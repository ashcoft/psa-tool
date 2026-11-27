"""Correctness cases raised in review: taps, slack references, limits and serialization."""

from __future__ import annotations

import math

import pytest

from psa_api.contract import Line, PowerSystem, Shunt
from psa_api.studies import run_power_flow


def _two_bus(**overrides) -> PowerSystem:
    payload = {
        "baseMVA": 100,
        "baseFreq": 50,
        "buses": [
            {"id": "1", "type": "slack", "voltage": 1.0, "vbase": 110},
            {"id": "2", "type": "pq", "voltage": 1.0, "vbase": 10},
        ],
        "transformers": [
            {
                "id": "T1",
                "fromBus": "1",
                "toBus": "2",
                "resistance": 0.001,
                "reactance": 0.05,
                "rating": 40,
                "tap": 1.0,
                "vhigh": 110,
                "vlow": 10,
            }
        ],
        "generators": [
            {"id": "G1", "bus": "1", "pg": 0, "v": 1.0, "pmax": 100, "qmax": 100, "qmin": -100}
        ],
        "loads": [{"id": "L2", "bus": "2", "pl": 10, "ql": 3}],
    }
    payload.update(overrides)
    return PowerSystem.model_validate(payload)


def test_transformer_tap_changes_the_secondary_voltage() -> None:
    neutral = run_power_flow(_two_bus(), "Newton-Raphson")
    tapped_system = _two_bus()
    tapped_system.transformers = [tapped_system.transformers[0].model_copy(update={"tap": 1.05})]
    tapped = run_power_flow(tapped_system, "Newton-Raphson")

    neutral_v = next(row.v for row in neutral.data.busResults if row.bus == "2")
    tapped_v = next(row.v for row in tapped.data.busResults if row.bus == "2")

    assert neutral.status == "success"
    assert tapped.status == "success"
    # A ratio above 1 on the HV side lowers the secondary voltage by roughly 5 %.
    assert tapped_v == pytest.approx(neutral_v / 1.05, rel=5e-3)


def test_slack_bus_without_a_generator_is_the_reference() -> None:
    system = _two_bus(generators=[])
    study = run_power_flow(system, "Newton-Raphson")

    assert study.status == "success"
    assert study.data.converged is True


def test_missing_slack_bus_falls_back_to_bus_zero() -> None:
    system = _two_bus()
    system.buses = [bus.model_copy(update={"type": "pq"}) for bus in system.buses]
    study = run_power_flow(system, "Newton-Raphson")

    assert study.status == "success"
    assert any("used as the reference" in message for message in study.messages)


def test_slack_angle_is_converted_from_radians() -> None:
    system = _two_bus()
    system.buses = [
        bus.model_copy(update={"angle": 0.2}) if bus.id == "1" else bus for bus in system.buses
    ]
    study = run_power_flow(system, "Newton-Raphson")

    slack = next(row for row in study.data.busResults if row.bus == "1")
    assert slack.angle == pytest.approx(math.degrees(0.2), abs=1e-9)


def test_zero_impedance_line_is_excluded() -> None:
    system = _two_bus(
        transformers=[],
        buses=[
            {"id": "1", "type": "slack", "voltage": 1.0, "vbase": 110},
            {"id": "2", "type": "pq", "voltage": 1.0, "vbase": 110},
            {"id": "3", "type": "pq", "voltage": 1.0, "vbase": 110},
        ],
        lines=[
            {"id": "L12", "fromBus": "1", "toBus": "2", "resistance": 0.01, "reactance": 0.05},
            {"id": "L23", "fromBus": "2", "toBus": "3", "resistance": 0, "reactance": 0},
        ],
        loads=[{"id": "L3", "bus": "3", "pl": 5, "ql": 1}],
        generators=[
            {"id": "G1", "bus": "1", "pg": 0, "v": 1.0, "pmax": 100, "qmax": 100, "qmin": -100}
        ],
    )
    study = run_power_flow(system, "Newton-Raphson")

    assert study.status == "success"
    assert any("zero impedance" in message for message in study.messages)
    assert [row.line for row in study.data.lineResults] == ["L12"]


def test_reactive_limits_are_enforced() -> None:
    system = PowerSystem.model_validate(
        {
            "baseMVA": 100,
            "buses": [
                {"id": "1", "type": "slack", "voltage": 1.0, "vbase": 110},
                {"id": "2", "type": "pv", "voltage": 1.0, "vbase": 110},
            ],
            "lines": [
                {
                    "id": "L",
                    "fromBus": "1",
                    "toBus": "2",
                    "resistance": 0.01,
                    "reactance": 0.1,
                    "rating": 100,
                }
            ],
            "generators": [
                {
                    "id": "G1",
                    "bus": "2",
                    "pg": 50,
                    "v": 1.05,
                    "pmax": 100,
                    "qmax": 1,
                    "qmin": -1,
                }
            ],
            "loads": [{"id": "LD", "bus": "2", "pl": 50, "ql": 40}],
        }
    )
    study = run_power_flow(system, "Newton-Raphson")

    assert study.status == "success"
    generator = study.data.generatorResults[0]
    voltage = next(row.v for row in study.data.busResults if row.bus == "2")

    assert generator.qg == pytest.approx(1.0, abs=1e-6)
    assert generator.status == "at limit"
    assert voltage < 1.04


def test_dc_results_are_finite_and_serializable(system: PowerSystem) -> None:
    study = run_power_flow(system, "DC")
    payload = study.model_dump_json()

    assert study.status == "success"
    assert "NaN" not in payload
    assert all(math.isfinite(row.v) and math.isfinite(row.qg) for row in study.data.busResults)
    assert all(row.qFrom == 0 and row.qTo == 0 for row in study.data.lineResults)
    assert all(math.isfinite(row.qg) for row in study.data.generatorResults)


def test_out_of_service_bus_reports_zeros(system: PowerSystem) -> None:
    system.buses = [
        bus.model_copy(update={"active": False}) if bus.id == "4" else bus for bus in system.buses
    ]
    study = run_power_flow(system, "Newton-Raphson")

    assert study.status == "success"
    result = next(row for row in study.data.busResults if row.bus == "4")
    assert (result.v, result.angle, result.pg, result.qg) == (0.0, 0.0, 0.0, 0.0)
    assert any("out of service" in message for message in study.messages)


def test_failed_study_has_no_nan_mismatch() -> None:
    study = run_power_flow(_two_bus(), "Gauss-Seidel", max_iterations=1)

    assert study.status == "failed"
    assert study.data.maxMismatch is None
    assert "NaN" not in study.model_dump_json()


def test_duplicate_element_ids_are_rejected() -> None:
    system = _two_bus()
    system.lines = [
        Line(id="L1", fromBus="1", toBus="2", resistance=0.01, reactance=0.1),
        Line(id="L1", fromBus="2", toBus="1", resistance=0.01, reactance=0.1),
    ]
    study = run_power_flow(system, "Newton-Raphson")

    assert study.status == "failed"
    assert any("duplicate line ids" in message for message in study.messages)


def test_shunt_power_is_scaled_by_voltage(system: PowerSystem) -> None:
    system.shunts = [Shunt(id="C", bus="5", g=0.0, b=0.1)]
    study = run_power_flow(system, "Newton-Raphson")

    result = next(row for row in study.data.busResults if row.bus == "5")
    expected = 0.1 * 100 * result.v**2
    assert result.qshunt == pytest.approx(expected, rel=1e-6)
