import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool

from psa_api.catalog import Catalog
from psa_api.contract import PowerSystem
from psa_api.main import app

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture(scope="session")
def ieee9() -> dict:
    return json.loads((FIXTURES / "ieee9.json").read_text())


@pytest.fixture()
def system(ieee9) -> PowerSystem:
    return PowerSystem.model_validate(ieee9)


@pytest.fixture()
def catalog() -> Catalog:
    engine = create_engine(
        "sqlite+pysqlite://",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    instance = Catalog(engine)
    instance.ensure_seeded()
    return instance


@pytest.fixture(scope="session")
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client
