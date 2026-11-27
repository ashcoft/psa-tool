"""HTTP tests for the FastAPI surface."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_health(client: TestClient) -> None:
    response = client.get("/v1/health")
    assert response.status_code == 200

    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "psa-api"
    assert body["contractVersion"] == "1.0.0"
    assert body["solver"]["engine"] == "pandapower"
    assert body["catalog"]["datasets"] == 1


def test_openapi_documents_the_contract(client: TestClient) -> None:
    schema = client.get("/openapi.json").json()
    paths = set(schema["paths"])
    assert {"/v1/health", "/v1/studies/powerflow", "/v1/catalog/cables"} <= paths
    assert "PowerFlowRequest" in schema["components"]["schemas"]
    assert "PowerFlowStudy" in schema["components"]["schemas"]


def test_power_flow_endpoint(client: TestClient, ieee9: dict) -> None:
    response = client.post(
        "/v1/studies/powerflow",
        json={"system": ieee9, "method": "Newton-Raphson"},
    )
    assert response.status_code == 200

    body = response.json()
    assert body["kind"] == "powerflow"
    assert body["status"] == "success"
    assert body["data"]["converged"] is True
    assert body["data"]["method"] == "Newton-Raphson"
    assert len(body["data"]["busResults"]) == 9
    assert body["engine"].startswith("pandapower")


def test_unknown_bus_returns_422(client: TestClient, ieee9: dict) -> None:
    broken = {**ieee9, "lines": [{**ieee9["lines"][0], "toBus": "nope"}, *ieee9["lines"][1:]]}
    response = client.post("/v1/studies/powerflow", json={"system": broken})

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert any("nope" in message for message in detail["messages"])


def test_malformed_request_returns_422(client: TestClient) -> None:
    response = client.post("/v1/studies/powerflow", json={"system": {"buses": []}, "tolerance": -1})
    assert response.status_code == 422


def test_catalog_cables_filter(client: TestClient) -> None:
    all_cables = client.get("/v1/catalog/cables").json()
    low_voltage = client.get("/v1/catalog/cables", params={"voltageClassKv": 1.0}).json()

    assert len(all_cables) == 15
    assert len(low_voltage) == 8
    assert all(row["voltageClassKv"] == 1.0 for row in low_voltage)
    assert low_voltage[0]["standard"] == "IEC 60502-1"


def test_catalog_relays_and_curves(client: TestClient) -> None:
    relays = client.get("/v1/catalog/relays").json()
    curves = client.get("/v1/catalog/relay-curves").json()

    assert len(relays) == 5
    assert len(curves) == 6
    iec_si = next(curve for curve in curves if curve["id"] == "iec-si")
    assert iec_si == {
        "id": "iec-si",
        "standard": "IEC 60255-151",
        "curve": "SI",
        "label": "IEC Standard Inverse",
        "k": 0.14,
        "alpha": 0.02,
        "band": "IEC",
        "datasetVersion": "2026.11",
    }


def test_datasets_endpoint(client: TestClient) -> None:
    datasets = client.get("/v1/catalog/datasets").json()
    assert datasets[0]["id"] == "2026.11"
    assert datasets[0]["publishedAt"] == "2026-11-26"


def test_cors_allows_the_workbench_origin(client: TestClient) -> None:
    response = client.get("/v1/health", headers={"Origin": "http://localhost:3000"})
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
