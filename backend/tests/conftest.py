import os, tempfile
from pathlib import Path

os.environ["YOLO_AUTOINSTALL"] = "false"
_TEST_ROOT = Path(tempfile.mkdtemp(prefix="mathtech-tests-"))
os.environ["DATA_DIR"] = str(_TEST_ROOT / "data")
os.environ["MODEL_DIR"] = str(_TEST_ROOT / "models")
os.environ["DATABASE_URL"] = "sqlite:///" + str(_TEST_ROOT / "test.db")
os.environ["MODEL_PATH"] = ""
import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture
def client():
    with TestClient(app) as client:
        yield client
