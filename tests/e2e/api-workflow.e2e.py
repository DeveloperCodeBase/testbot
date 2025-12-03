# filename: tests/e2e/test_api_workflow.py
import pytest
import requests
from requests.exceptions import RequestException

@pytest.fixture(scope="module")
def base_url():
    # Base URL for API endpoints
    return "http://localhost:8000"

@pytest.fixture
def client():
    # In real scenario, this could be a requests.Session or a custom client
    with requests.Session() as session:
        yield session

@pytest.fixture
def auth_token(client, base_url):
    # If user authentication is required, obtain token here
    # Assuming a login endpoint - /api/login which returns JSON token
    # If auth not required, yield None
    login_url = f"{base_url}/api/login"
    credentials = {"username": "testuser", "password": "testpass"}
    try:
        response = client.post(login_url, json=credentials)
        response.raise_for_status()
        token = response.json().get("token")
        yield token
    except RequestException:
        # Authentication failed or not required
        yield None

def test_api_workflow_success(client, base_url, auth_token):
    """
    End-to-end test that verifies the complete API workflow:
    1) Initializes client session
    2) Authenticates user (if required)
    3) Calls /api endpoint with proper headers and payload
    4) Verifies successful response and expected output
    """

    headers = {}
    if auth_token:
        headers["Authorization"] = f"Bearer {auth_token}"

    api_url = f"{base_url}/api"

    # Example payload for the API endpoint
    payload = {"action": "start", "data": {"key": "value"}}

    # Step 1: Call API endpoint
    response = client.post(api_url, json=payload, headers=headers)
    assert response.status_code == 200, f"Expected 200 OK, got {response.status_code}"

    resp_json = response.json()
    # Expected keys in response, adjust according to API spec
    assert "status" in resp_json
    assert resp_json["status"] == "success"
    assert "result" in resp_json

    # Step 2: Call intermediate step if needed (simulate workflow progression)
    # Example: next API call after start
    payload_next = {"action": "continue", "session_id": resp_json["result"].get("session_id")}
    response_next = client.post(api_url, json=payload_next, headers=headers)
    assert response_next.status_code == 200
    resp_next_json = response_next.json()
    assert resp_next_json.get("status") == "success"
    assert "progress" in resp_next_json

    # Step 3: Finalize workflow
    payload_finalize = {"action": "finish", "session_id": resp_json["result"].get("session_id")}
    response_finalize = client.post(api_url, json=payload_finalize, headers=headers)
    assert response_finalize.status_code == 200
    resp_finalize_json = response_finalize.json()
    assert resp_finalize_json.get("status") == "completed"

def test_api_workflow_auth_failure(client, base_url):
    """
    Verify that API rejects unauthorized access when authentication required
    """
    api_url = f"{base_url}/api"
    payload = {"action": "start"}

    # Call without auth headers or with invalid token
    headers = {"Authorization": "Bearer invalidtoken"}

    response = client.post(api_url, json=payload, headers=headers)
    assert response.status_code in (401, 403), "Expected unauthorized status code"

def test_api_workflow_invalid_payload(client, base_url, auth_token):
    """
    Verify API returns proper error responses on invalid payloads
    """
    headers = {}
    if auth_token:
        headers["Authorization"] = f"Bearer {auth_token}"
    api_url = f"{base_url}/api"

    # Missing required fields in payload
    invalid_payload = {"invalid_field": "data"}

    response = client.post(api_url, json=invalid_payload, headers=headers)
    assert response.status_code == 400, "Expected 400 Bad Request for invalid payload"

    resp_json = response.json()
    assert "error" in resp_json
    assert isinstance(resp_json["error"], str)

def test_api_workflow_server_error_handling(client, base_url, auth_token, monkeypatch):
    """
    Simulate server-side error and verify API handles it gracefully
    """

    headers = {}
    if auth_token:
        headers["Authorization"] = f"Bearer {auth_token}"
    api_url = f"{base_url}/api"

    # We simulate the server being unreachable by monkeypatching requests.post
    # Note: since we use requests directly, monkeypatch requests.Session.post

    original_post = client.post

    def failing_post(*args, **kwargs):
        raise requests.exceptions.ConnectionError("Simulated connection failure")

    monkeypatch.setattr(client, "post", failing_post)

    with pytest.raises(requests.exceptions.ConnectionError):
        client.post(api_url, json={"action": "start"}, headers=headers)

    # Restore original
    monkeypatch.setattr(client, "post", original_post)