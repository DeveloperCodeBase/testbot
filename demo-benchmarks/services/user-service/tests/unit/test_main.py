# filename: tests/test_main.py
import pytest
from fastapi.testclient import TestClient
from main import app, UserStats, health_check, get_user_stats

client = TestClient(app)

# UNIT TESTS

def test_userstats_model_valid_data():
    data = {"total_users": 10, "active_users": 5}
    user_stats = UserStats(**data)
    assert user_stats.total_users == 10
    assert user_stats.active_users == 5

def test_userstats_model_invalid_data():
    # active_users cannot be string, should raise ValidationError
    with pytest.raises(Exception) as exc_info:
        UserStats(total_users="100", active_users="forty-two")
    assert "value is not a valid integer" in str(exc_info.value)

def test_health_check_function():
    response = health_check()
    assert isinstance(response, dict)
    assert response.get("status") == "ok"

def test_get_user_stats_function():
    # Since this function returns constant data, just verify keys and values
    response = get_user_stats()
    assert isinstance(response, dict)
    assert "total_users" in response
    assert "active_users" in response
    assert response["total_users"] == 100
    assert response["active_users"] == 42

# INTEGRATION TESTS

def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    json_data = response.json()
    assert "status" in json_data
    assert json_data["status"] == "ok"

def test_stats_users_endpoint():
    response = client.post("/stats/users")
    assert response.status_code == 200
    json_data = response.json()
    assert "total_users" in json_data
    assert "active_users" in json_data
    assert json_data["total_users"] == 100
    assert json_data["active_users"] == 42

# E2E TESTS

@pytest.fixture(scope="module")
def test_client():
    # Setup - create TestClient
    with TestClient(app) as c:
        yield c
    # No teardown necessary as no stateful resource used

def test_full_user_stats_workflow(test_client):
    # 1. Check health to ensure service is up
    health_resp = test_client.get("/health")
    assert health_resp.status_code == 200
    assert health_resp.json() == {"status": "ok"}

    # 2. Request user stats
    stats_resp = test_client.post("/stats/users")
    assert stats_resp.status_code == 200
    stats_json = stats_resp.json()
    assert isinstance(stats_json, dict)
    assert stats_json.get("total_users") == 100
    assert stats_json.get("active_users") == 42

# EDGE CASES

def test_stats_users_invalid_method():
    # Only POST allowed, GET should 405
    response = client.get("/stats/users")
    assert response.status_code == 405

def test_health_invalid_method():
    # Only GET allowed, POST should 405
    response = client.post("/health")
    assert response.status_code == 405