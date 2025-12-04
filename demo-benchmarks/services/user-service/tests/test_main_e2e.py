import pytest
from fastapi.testclient import TestClient
from main import app

@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c

def test_e2e_user_stats_workflow(client):
    # 1. Check health first
    health_resp = client.get("/health")
    assert health_resp.status_code == 200
    assert health_resp.json() == {"status": "ok"}

    # 2. Get user stats
    stats_resp = client.post("/stats/users")
    assert stats_resp.status_code == 200
    stats_json = stats_resp.json()
    assert "total_users" in stats_json
    assert "active_users" in stats_json

    # 3. Validate stats consistency (active users can't be greater than total users)
    total = stats_json["total_users"]
    active = stats_json["active_users"]
    assert isinstance(total, int) and isinstance(active, int)
    assert 0 <= active <= total

def test_e2e_invalid_endpoint(client):
    # Request to an endpoint that does not exist
    response = client.get("/invalid-endpoint")
    assert response.status_code == 404