"""Power-flow tests: convergence, power balance and an independent 2-bus solve."""

from __future__ import annotations

import math

import numpy as np
import pytest
from scipy.optimize import fsolve

from psa_api.contract import PowerSystem, Shunt
from psa_api.studies import run_power_flow


def _totals(study):
    data = study.data
    generation = sum(result.pg for result in data.busResults)
    load = sum(result.pl for result in data.busResults)
    return generation, load


def test_ieee9_converges_and_balances_power(system: PowerSystem) -> None:
    study = run_power_flow(system, "Newton-Raphson")

    assert study.status == "success"
    assert study.data.converged is True
    assert study.data.iterations > 0
    assert study.data.losses["real"] > 0

    generation, load = _totals(study)
    assert generation == pytest.approx(load + study.data.losses["real"], rel=1e-6)


def test_ieee9_voltage_profile(system: PowerSystem) -> None:
    study = run_power_flow(system, "Newton-Raphson")
    voltages = {result.bus: result.v for result in study.data.busResults}

    assert voltages["1"] == pytest.approx(1.04, abs=1e-9)
    assert voltages["2"] == pytest.approx(1.025, abs=1e-9)
    assert all(0.9 < value < 1.1 for value in voltages.values())
    # The load buses sit below the PV setpoints; bus 7 is the weakest bus in the case.
    assert voltages["7"] < voltages["9"] < voltages["4"] < 1.05
    assert voltages["7"] == min(voltages.values())


def test_residual_is_below_tolerance(system: PowerSystem) -> None:
    study = run_power_flow(system, "Newton-Raphson", tolerance=1e-8)
    assert study.data.maxMismatch < 1e-8


def test_ac_methods_agree(system: PowerSystem) -> None:
    reference = run_power_flow(system, "Newton-Raphson")
    reference_v = {row.bus: row.v for row in reference.data.busResults}

    for method in ("Fast-Decoupled", "Gauss-Seidel"):
        # Gauss-Seidel needs a larger budget than the 50-iteration default for this case.
        study = run_power_flow(system, method, max_iterations=200)
        assert study.status == "success", study.messages
        for row in study.data.busResults:
            assert row.v == pytest.approx(reference_v[row.bus], abs=1e-5)


def test_dc_flow_reports_mw_flows(system: PowerSystem) -> None:
    study = run_power_flow(system, "DC")
    assert study.status == "success"
    assert study.data.method == "DC"
    assert any("nominal" in message for message in study.messages)
    # DC results carry angles and MW only; vm_pu echoes the setpoints.
    injections = {row.bus: row.pg for row in study.data.busResults}
    assert injections["2"] == pytest.approx(163.0, abs=1e-6)
    assert injections["3"] == pytest.approx(85.0, abs=1e-6)
    assert sum(row.pFrom for row in study.data.lineResults) > 0


def test_two_bus_against_independent_solution() -> None:
    system = PowerSystem.model_validate(
        {
            "baseMVA": 100,
            "baseFreq": 60,
            "buses": [
                {"id": "s", "type": "slack", "voltage": 1.0, "vbase": 138},
                {"id": "l", "type": "pq", "voltage": 1.0, "vbase": 138},
            ],
            "lines": [
                {
                    "id": "L",
                    "fromBus": "s",
                    "toBus": "l",
                    "resistance": 0.01,
                    "reactance": 0.1,
                    "rating": 100,
                }
            ],
            "generators": [
                {"id": "G", "bus": "s", "pg": 50, "v": 1.0, "pmax": 200, "qmax": 200, "qmin": -200}
            ],
            "loads": [{"id": "LD", "bus": "l", "pl": 50, "ql": 20}],
        }
    )
    study = run_power_flow(system, "Newton-Raphson", tolerance=1e-10)
    assert study.status == "success"

    z = 0.01 + 0.1j
    target = np.array([-0.5, -0.2])

    def mismatch(x: np.ndarray) -> np.ndarray:
        vm, va = x
        voltage = vm * np.exp(1j * va)
        current = (voltage - 1.0) / z
        power = voltage * np.conj(current)
        return np.array([power.real, power.imag]) - target

    solution, _, converged, _ = fsolve(mismatch, np.array([1.0, 0.0]), full_output=True)
    assert converged == 1
    expected_vm, expected_va = solution

    result = next(row for row in study.data.busResults if row.bus == "l")
    assert result.v == pytest.approx(float(expected_vm), abs=1e-6)
    # BusResult.angle is degrees in both implementations.
    assert result.angle == pytest.approx(math.degrees(float(expected_va)), abs=1e-6)

    current = abs(result.v * np.exp(1j * math.radians(result.angle)) - 1.0) / abs(z) * abs(z)
    current = abs((result.v * np.exp(1j * math.radians(result.angle)) - 1.0) / z)
    expected_loss = current**2 * z.real * 100
    assert study.data.losses["real"] == pytest.approx(float(expected_loss), rel=1e-6)


def test_unknown_bus_is_reported(system: PowerSystem) -> None:
    broken = system.model_copy(deep=True)
    broken.lines[0].toBus = "missing"
    study = run_power_flow(broken, "Newton-Raphson")

    assert study.status == "failed"
    assert study.data.converged is False
    assert any("missing" in message for message in study.messages)


def test_generator_at_pq_bus_is_fixed_injection(system: PowerSystem) -> None:
    modified = system.model_copy(deep=True)
    modified.buses = [
        bus.model_copy(update={"type": "pq"}) if bus.id == "2" else bus for bus in modified.buses
    ]
    study = run_power_flow(modified, "Newton-Raphson")

    assert study.status == "success"
    assert any("fixed injection" in message for message in study.messages)


def test_shunt_is_capacitive_when_b_is_positive(system: PowerSystem) -> None:
    base = run_power_flow(system, "Newton-Raphson")
    base_v = next(row.v for row in base.data.busResults if row.bus == "9")

    modified = system.model_copy(deep=True)
    modified.shunts = [Shunt(id="C9", bus="9", g=0.0, b=0.2, active=True)]
    study = run_power_flow(modified, "Newton-Raphson")
    assert study.status == "success"
    boosted = next(row.v for row in study.data.busResults if row.bus == "9")
    assert boosted > base_v

    qshunt = next(row.qshunt for row in study.data.busResults if row.bus == "9")
    assert qshunt == pytest.approx(-0.2 * 100, rel=1e-6)


def test_empty_method_mapping_is_explicit(system: PowerSystem) -> None:
    study = run_power_flow(system, "HOLAR")
    assert study.status == "success"
    assert any("Newton-Raphson is used" in message for message in study.messages)


def test_bus_angles_are_degrees(system: PowerSystem) -> None:
    study = run_power_flow(system, "Newton-Raphson")
    angles = {row.bus: row.angle for row in study.data.busResults}
    assert abs(angles["1"]) < 1e-12
    assert max(abs(value) for value in angles.values()) < 90
