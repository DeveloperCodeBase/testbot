import pytest
import os

def test_environment_health():
    """
    Minimal integration test to verify the test environment is working.
    """
    assert True
    assert os.environ.get("PATH") is not None
