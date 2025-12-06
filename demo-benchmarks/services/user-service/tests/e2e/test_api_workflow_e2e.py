import pytest
from fastapi.testclient import TestClient
from user_service.main import app
from user_service.models import User
from sqlalchemy.orm import sessionmaker
from sqlalchemy import create_engine

# Setup in-memory database for testing
DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create the tables in the test database
from user_service.database import Base
Base.metadata.create_all(bind=engine)

@pytest.fixture(scope="module")
def client():
    client = TestClient(app)
    yield client
    # Teardown can be done here if needed

@pytest.fixture(scope="module")
def test_db_session():
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()

@pytest.fixture(scope="module")
def test_user(test_db_session):
    user = User(username="testuser", password="testpass", email="testuser@example.com")
    test_db_session.add(user)
    test_db_session.commit()
    test_db_session.refresh(user)
    return user

@pytest.fixture(scope="module")
def auth_token(client, test_user):
    response = client.post("/api/login", json={"username": test_user.username, "password": "testpass"})
    assert response.status_code == 200
    return response.json().get("access_token")

def test_complete_api_workflow(client, auth_token, test_user):
    headers = {"Authorization": f"Bearer {auth_token}"}
    
    # Step 1: Fetch user profile
    response = client.get("/api/user/profile", headers=headers)
    assert response.status_code == 200
    user_profile = response.json()
    assert user_profile["username"] == test_user.username
    assert user_profile["email"] == test_user.email

    # Step 2: Update user profile
    update_data = {"email": "updatedtestuser@example.com"}
    response = client.put("/api/user/profile", headers=headers, json=update_data)
    assert response.status_code == 200
    updated_profile = response.json()
    assert updated_profile["email"] == update_data["email"]

    # Step 3: Delete user profile
    response = client.delete("/api/user/profile", headers=headers)
    assert response.status_code == 204

    # Verify user is deleted
    response = client.get("/api/user/profile", headers=headers)
    assert response.status_code == 404

def test_error_scenarios(client, test_user):
    # Case 1: Login with wrong credentials
    response = client.post("/api/login", json={"username": test_user.username, "password": "wrongpass"})
    assert response.status_code == 401

    # Case 2: Access user profile without authentication
    response = client.get("/api/user/profile")
    assert response.status_code == 401

    # Case 3: Update user profile with invalid data
    headers = {"Authorization": f"Bearer {auth_token}"}
    invalid_update_data = {"email": "invalidemail"}
    response = client.put("/api/user/profile", headers=headers, json=invalid_update_data)
    assert response.status_code == 422

    # Case 4: Delete non-existent user profile
    response = client.delete("/api/user/profile", headers=headers)
    assert response.status_code == 404