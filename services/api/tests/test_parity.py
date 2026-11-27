"""Parity with the TypeScript engine on the IEEE 9-bus golden case.

The reference fixture was produced once by the client solver and is committed so
CI can catch drift in either implementation without running Node.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import pytest

from psa_api.contract import PowerSystem
from psa_api.studies import run_power_flow

REFERENCE = json.loads((Path(__file__).parent / "fixtures" / "ieee9-client-nr.json").read_text())


@pytest.fixture()
def study(system: PowerSystem):
    # Same tolerance the client used for the fixture; tighter budgets converge elsewhere.
    return run_power_flow(system, "Newton-Raphson")


def test_bus_voltages_match_the_client(study) -> None:
    reference = {row["bus"]: row for row in REFERENCE["busResults"]}
    for row in study.data.busResults:
        assert row.v == pytest.approx(reference[row.bus]["v"], abs=1e-8)


def test_bus_angles_match_the_client_in_degrees(study) -> None:
    reference = {row["bus"]: row for row in REFERENCE["busResults"]}
    for row in study.data.busResults:
        assert row.angle == pytest.approx(reference[row.bus]["angle"], abs=1e-6)


def test_reactive_generation_matches_at_every_bus(study) -> None:
    reference = {row["bus"]: row for row in REFERENCE["busResults"]}
    for row in study.data.busResults:
        assert row.qg == pytest.approx(reference[row.bus]["qg"], abs=1e-6)


def test_line_flows_match_the_client(study) -> None:
    reference = {row["line"]: row for row in REFERENCE["lineResults"]}
    for row in study.data.lineResults:
        expected = reference[row.line]
        assert row.pFrom == pytest.approx(expected["pFrom"], abs=1e-6)
        assert row.qFrom == pytest.approx(expected["qFrom"], abs=1e-6)
        assert row.pTo == pytest.approx(expected["pTo"], abs=1e-6)
        assert row.qTo == pytest.approx(expected["qTo"], abs=1e-6)


def test_transformer_flows_match_the_client(study) -> None:
    reference = {row["transformer"]: row for row in REFERENCE["transformerResults"]}
    for row in study.data.transformerResults:
        expected = reference[row.transformer]
        assert row.pFrom == pytest.approx(expected["pFrom"], abs=1e-6)
        assert row.qFrom == pytest.approx(expected["qFrom"], abs=1e-6)


def test_losses_match_the_client(study) -> None:
    assert study.data.losses["real"] == pytest.approx(REFERENCE["losses"]["real"], rel=1e-9)
    assert study.data.losses["imag"] == pytest.approx(REFERENCE["losses"]["imag"], rel=1e-9)


def test_loading_uses_the_worse_end(study, system: PowerSystem) -> None:
    """Documented divergence: the client divides only the sending-end flow."""
    reference = {row["line"]: row for row in REFERENCE["lineResults"]}
    ratings = {line.id: line.rating for line in system.lines}
    for row in study.data.lineResults:
        expected = reference[row.line]
        sending = math.hypot(expected["pFrom"], expected["qFrom"])
        receiving = math.hypot(expected["pTo"], expected["qTo"])
        assert row.loading == pytest.approx(
            max(sending, receiving) * 100.0 / ratings[row.line], abs=1e-9
        )
        assert row.loading >= expected["loading"] - 1e-9


def test_slack_generation_is_solved_not_scheduled(study, system: PowerSystem) -> None:
    """Documented divergence: the client reports the scheduled pg for the slack unit."""
    scheduled = next(gen.pg for gen in system.generators if gen.id == "G1")
    solved = next(row.pg for row in study.data.busResults if row.bus == "1")

    assert solved == pytest.approx(68.1488, abs=1e-3)
    assert solved < scheduled
