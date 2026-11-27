"""Contract tests: the Pydantic mirror must accept client JSON unchanged."""

from __future__ import annotations

import pytest
from pydantic import ValidationError
from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateTable

from psa_api.catalog import metadata
from psa_api.contract import CONTRACT_VERSION, PowerFlowStudy, PowerSystem
from psa_api.studies import run_power_flow


def test_contract_version_is_pinned() -> None:
    assert CONTRACT_VERSION == "1.1.0"


def test_fixture_validates_and_preserves_unknown_fields(ieee9: dict) -> None:
    ieee9 = {**ieee9, "uiState": {"zoom": 1.5}, "futureField": [1, 2, 3]}
    system = PowerSystem.model_validate(ieee9)

    dumped = system.model_dump()
    assert dumped["uiState"] == {"zoom": 1.5}
    assert dumped["futureField"] == [1, 2, 3]
    assert dumped["lines"][0]["fromBus"] == "4"
    assert dumped["baseMVA"] == 100


def test_study_payload_matches_the_client_shape(system: PowerSystem) -> None:
    study = run_power_flow(system, "Newton-Raphson")
    payload = study.model_dump()

    assert set(payload) >= {
        "id",
        "kind",
        "title",
        "startedAt",
        "elapsedMs",
        "status",
        "summary",
        "messages",
        "data",
    }
    assert payload["kind"] == "powerflow"
    data = payload["data"]
    assert set(data) >= {
        "converged",
        "iterations",
        "maxMismatch",
        "losses",
        "busResults",
        "lineResults",
        "transformerResults",
        "generatorResults",
        "elapsedTime",
        "method",
    }
    assert next(row for row in data["busResults"] if row["bus"] == "1")["v"] == pytest.approx(1.04)
    assert all(set(row) >= {"bus", "v", "angle", "pg", "qg", "pl", "ql", "qshunt"} for row in data["busResults"])
    assert all(
        set(row) >= {"line", "fromBus", "toBus", "pFrom", "qFrom", "pTo", "qTo", "ploss", "qloss", "loading"}
        for row in data["lineResults"]
    )


def test_study_payload_round_trips_through_the_model(system: PowerSystem) -> None:
    study = run_power_flow(system, "Newton-Raphson")
    reparsed = PowerFlowStudy.model_validate_json(study.model_dump_json())
    assert reparsed.data.converged is True


def test_invalid_models_are_rejected_upstream() -> None:
    with pytest.raises(ValidationError):
        PowerSystem.model_validate({"buses": [], "baseMVA": 0})
    with pytest.raises(ValidationError):
        PowerSystem.model_validate(
            {"buses": [{"id": "1", "type": "not-a-bus-type"}], "baseMVA": 100}
        )


def test_duplicate_ids_are_rejected_by_validation(system: PowerSystem) -> None:
    broken = system.model_copy(deep=True)
    broken.buses.append(broken.buses[0])

    study = run_power_flow(broken, "Newton-Raphson")
    assert study.status == "failed"
    assert any("duplicate bus ids" in message for message in study.messages)


def test_catalog_ddl_compiles_for_postgres() -> None:
    dialect = postgresql.dialect()
    names = set()
    for table in metadata.sorted_tables:
        ddl = str(CreateTable(table).compile(dialect=dialect))
        names.add(table.name)
        assert "CREATE TABLE" in ddl

    assert names == {"dataset_version", "cable_family", "cable_size", "relay_curve", "relay_model"}
    relay_ddl = str(CreateTable(metadata.tables["relay_model"]).compile(dialect=dialect))
    assert "JSON" in relay_ddl
    assert "FOREIGN KEY" in relay_ddl
