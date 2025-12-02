# filename: tests/e2e/test_api_workflow.py
import pytest
import requests
from requests.exceptions import ConnectionError, Timeout

@pytest.fixture(scope="module")
def base_url():
    # Assuming the API server is running locally on port 8000
    return "http://localhost:8000/api"

@pytest.fixture
def client():
    # Initialize a requests session for connection pooling and reuse
    session = requests.Session()
    yield session
    session.close()

def test_api_workflow_success(client, base_url):
    """
    Test complete API workflow end-to-end:
    - Initialize client
    - Authenticate user (if required)
    - Call all intermediate steps of the /api endpoint workflow
    - Verify successful responses and expected outcomes
    """
    # Step 1: Authenticate user (assume token-based auth endpoint /api/auth/login)
    auth_payload = {"username": "testuser", "password": "correct_password"}
    auth_resp = client.post(f"{base_url}/auth/login", json=auth_payload)
    assert auth_resp.status_code == 200, "Authentication failed with correct credentials"
    auth_data = auth_resp.json()
    assert "token" in auth_data, "Auth token missing in response"
    token = auth_data["token"]

    headers = {"Authorization": f"Bearer {token}"}

    # Step 2: Call the primary API endpoint - example POST /api/data to create resource
    data_payload = {"item_name": "Test Item", "quantity": 5}
    create_resp = client.post(f"{base_url}/data", json=data_payload, headers=headers)
    assert create_resp.status_code == 201, "Resource creation failed"
    create_data = create_resp.json()
    assert "id" in create_data and create_data["item_name"] == "Test Item" and create_data["quantity"] == 5

    resource_id = create_data["id"]

    # Step 3: Retrieve the created resource via GET /api/data/{id}
    get_resp = client.get(f"{base_url}/data/{resource_id}", headers=headers)
    assert get_resp.status_code == 200, "Failed to fetch created resource"
    get_data = get_resp.json()
    assert get_data == create_data, "Fetched data does not match created data"

    # Step 4: Update resource via PUT /api/data/{id}
    update_payload = {"quantity": 10}
    update_resp = client.put(f"{base_url}/data/{resource_id}", json=update_payload, headers=headers)
    assert update_resp.status_code == 200, "Failed to update resource"
    update_data = update_resp.json()
    assert update_data["quantity"] == 10, "Resource quantity not updated"

    # Step 5: Delete resource via DELETE /api/data/{id}
    delete_resp = client.delete(f"{base_url}/data/{resource_id}", headers=headers)
    assert delete_resp.status_code == 204, "Failed to delete resource"

    # Step 6: Verify resource no longer exists
    get_after_delete_resp = client.get(f"{base_url}/data/{resource_id}", headers=headers)
    assert get_after_delete_resp.status_code == 404, "Deleted resource still accessible"

def test_api_authentication_failure(client, base_url):
    """
    Verify authentication failure with invalid credentials
    """
    bad_auth_payload = {"username": "testuser", "password": "wrong_password"}
    resp = client.post(f"{base_url}/auth/login", json=bad_auth_payload)
    assert resp.status_code == 401, "Authentication succeeded with invalid credentials"
    data = resp.json()
    assert "error" in data

@pytest.mark.parametrize("endpoint,method,payload,expected_status", [
    ("/data", "POST", {}, 400),  # Empty payload for creation
    ("/data/999999", "GET", None, 404),  # Nonexistent resource ID
    ("/data/abc", "GET", None, 400),  # Invalid resource ID format
])
def test_api_invalid_requests(client, base_url, endpoint, method, payload, expected_status):
    """
    Test API endpoints with invalid inputs and verify proper error responses
    """
    # Perform authentication first
    auth_resp = client.post(f"{base_url}/auth/login", json={"username": "testuser", "password": "correct_password"})
    token = auth_resp.json().get("token", "")
    headers = {"Authorization": f"Bearer {token}"} if token else {}

    url = f"{base_url}{endpoint}"
    if method == "POST":
        resp = client.post(url, json=payload, headers=headers)
    elif method == "GET":
        resp = client.get(url, headers=headers)
    elif method == "PUT":
        resp = client.put(url, json=payload or {}, headers=headers)
    elif method == "DELETE":
        resp = client.delete(url, headers=headers)
    else:
        pytest.skip(f"Unsupported method: {method}")

    assert resp.status_code == expected_status, f"Expected {expected_status}, got {resp.status_code}"

def test_api_workflow_network_error(monkeypatch, client, base_url):
    """
    Simulate network errors to verify client retries or error handling
    """
    def raise_connection_error(*args, **kwargs):
        raise ConnectionError("Simulated connection error")

    # Patch client's post method to simulate connection error during auth
    monkeypatch.setattr(client, "post", raise_connection_error)

    with pytest.raises(ConnectionError):
        client.post(f"{base_url}/auth/login", json={"username": "testuser", "password": "any"})

def test_api_auth_token_required(client, base_url):
    """
    Verify that accessing protected endpoints without auth token returns 401
    """
    protected_endpoints = [
        (f"{base_url}/data", "POST"),
        (f"{base_url}/data/1", "GET"),
        (f"{base_url}/data/1", "PUT"),
        (f"{base_url}/data/1", "DELETE"),
    ]
    for url, method in protected_endpoints:
        if method == "POST":
            resp = client.post(url, json={"item_name": "test"}, headers={})
        elif method == "GET":
            resp = client.get(url, headers={})
        elif method == "PUT":
            resp = client.put(url, json={"quantity": 5}, headers={})
        elif method == "DELETE":
            resp = client.delete(url, headers={})
        else:
            continue
        assert resp.status_code == 401, f"Expected 401 Unauthorized for {method} {url} without token"
        data = resp.json()
        assert "error" in data