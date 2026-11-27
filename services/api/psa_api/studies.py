"""Study runner: pandapower power flow wrapped in the ``StudyRun`` contract."""

from __future__ import annotations

import math
import platform
import time
from datetime import UTC, datetime

import pandapower as pp

from .adapter import ElementMap, build_net
from .contract import (
    BusResult,
    GeneratorResult,
    LineResult,
    PowerFlowMethod,
    PowerFlowResult,
    PowerFlowStudy,
    PowerSystem,
    TransformerResult,
)
from .validation import SystemValidationError, validate_system

ALGORITHMS: dict[str, str] = {
    "Newton-Raphson": "nr",
    "Fast-Decoupled": "fdxb",
    "Gauss-Seidel": "gs",
    "DC": "dc",
    "HOLAR": "nr",
    "Hybrid": "nr",
}

ENGINE = f"pandapower {pp.__version__} on Python {platform.python_version()}"


def _num(value, default: float = 0.0) -> float:  # noqa: ANN001 - pandas/numpy scalar
    """Return a finite float; pandapower leaves NaN in fields a method does not solve."""
    number = float(value)
    return number if math.isfinite(number) else default


def _now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def _study_id(method: str) -> str:
    return f"powerflow-{method.lower().replace(' ', '-')}-{int(time.time() * 1000)}"


def _empty_result(method: PowerFlowMethod, elapsed: float) -> PowerFlowResult:
    return PowerFlowResult(
        converged=False,
        iterations=0,
        maxMismatch=None,
        losses={"real": 0.0, "imag": 0.0},
        busResults=[],
        lineResults=[],
        transformerResults=[],
        generatorResults=[],
        elapsedTime=elapsed,
        method=method,
    )


def _shunt_consumption(
    system: PowerSystem, net: pp.pandapowerNet, mapping: ElementMap
) -> dict[str, dict[str, float]]:
    """Solved shunt consumption per bus; pandapower scales it by the bus voltage squared."""
    consumption = {bus.id: {"p": 0.0, "q": 0.0} for bus in system.buses}
    shunts_by_id = {shunt.id: shunt for shunt in system.shunts}
    for shunt_id, index in mapping.shunts.items():
        shunt = shunts_by_id.get(shunt_id)
        if shunt is None:
            continue
        row = net.res_shunt.loc[index]
        consumption[shunt.bus]["p"] += _num(row.p_mw)
        consumption[shunt.bus]["q"] += _num(row.q_mvar)
    return consumption


def _bus_totals(
    system: PowerSystem, net: pp.pandapowerNet, mapping: ElementMap
) -> dict[str, dict[str, float]]:
    totals = {
        bus.id: {"pl": 0.0, "ql": 0.0, "shunt_p": 0.0, "shunt_q": 0.0} for bus in system.buses
    }
    for load in system.loads:
        if load.bus in totals and load.active:
            totals[load.bus]["pl"] += load.pl
            totals[load.bus]["ql"] += load.ql
    for bus_id, values in _shunt_consumption(system, net, mapping).items():
        totals[bus_id]["shunt_p"] = values["p"]
        totals[bus_id]["shunt_q"] = values["q"]
    return totals


def _generator_injections(
    net: pp.pandapowerNet, mapping: ElementMap
) -> dict[str, tuple[float, float]]:
    injections: dict[str, tuple[float, float]] = {}
    for gen_id, (kind, index) in mapping.generators.items():
        if kind == "ext_grid":
            row = net.res_ext_grid.loc[index]
        elif kind == "gen":
            row = net.res_gen.loc[index]
        else:
            row = net.res_sgen.loc[index]
        injections[gen_id] = (_num(row.p_mw), _num(row.q_mvar))
    return injections


def _line_loading(row, rating: float) -> float:  # noqa: ANN001 - pandas row
    """Apparent power at the worse end as a percentage of the branch rating.

    The client divides only the sending-end flow by the rating, which understates
    charging-heavy lines; the service reports the larger of the two ends.
    """
    sending = math.hypot(_num(row.p_from_mw), _num(row.q_from_mvar))
    receiving = math.hypot(_num(row.p_to_mw), _num(row.q_to_mvar))
    return max(sending, receiving) * 100.0 / rating


def _status(gen_q: float, qmin: float, qmax: float, active: bool) -> str:
    if not active:
        return "off"
    if qmax <= qmin:
        return "on"
    tolerance = 1e-6 * max(1.0, abs(qmax), abs(qmin))
    if abs(gen_q - qmax) <= tolerance or abs(gen_q - qmin) <= tolerance:
        return "at limit"
    return "on"


def _bus_results(
    system: PowerSystem, net: pp.pandapowerNet, mapping: ElementMap
) -> list[BusResult]:
    totals = _bus_totals(system, net, mapping)
    results: list[BusResult] = []
    for bus in system.buses:
        if not bus.active or bus.type == "isolated":
            results.append(
                BusResult(bus=bus.id, v=0.0, angle=0.0, pg=0.0, qg=0.0, pl=0.0, ql=0.0, qshunt=0.0)
            )
            continue
        row = net.res_bus.loc[mapping.buses[bus.id]]
        values = totals[bus.id]
        results.append(
            BusResult(
                bus=bus.id,
                v=_num(row.vm_pu),
                angle=_num(row.va_degree),
                pg=values["pl"] + values["shunt_p"] - _num(row.p_mw),
                qg=values["ql"] + values["shunt_q"] - _num(row.q_mvar),
                pl=values["pl"],
                ql=values["ql"],
                qshunt=-values["shunt_q"],
            )
        )
    return results


def _line_results(system: PowerSystem, net: pp.pandapowerNet, mapping: ElementMap) -> list[LineResult]:
    results: list[LineResult] = []
    for line in system.lines:
        if line.id not in mapping.lines:
            continue
        row = net.res_line.loc[mapping.lines[line.id]]
        rated = bool(line.rating and line.rating > 0)
        results.append(
            LineResult(
                line=line.id,
                fromBus=line.fromBus,
                toBus=line.toBus,
                pFrom=_num(row.p_from_mw),
                qFrom=_num(row.q_from_mvar),
                pTo=_num(row.p_to_mw),
                qTo=_num(row.q_to_mvar),
                ploss=_num(row.pl_mw),
                qloss=_num(row.ql_mvar),
                loading=_line_loading(row, line.rating) if rated else 0.0,
            )
        )
    return results


def _transformer_results(
    system: PowerSystem, net: pp.pandapowerNet, mapping: ElementMap
) -> list[TransformerResult]:
    results: list[TransformerResult] = []
    for txf in system.transformers:
        if txf.id not in mapping.transformers:
            continue
        row = net.res_trafo.loc[mapping.transformers[txf.id]]
        results.append(
            TransformerResult(
                transformer=txf.id,
                fromBus=txf.fromBus,
                toBus=txf.toBus,
                pFrom=_num(row.p_hv_mw),
                qFrom=_num(row.q_hv_mvar),
                pTo=_num(row.p_lv_mw),
                qTo=_num(row.q_lv_mvar),
                loading=_num(row.loading_percent),
                tap=txf.tap,
            )
        )
    return results


def _generator_results(
    system: PowerSystem, net: pp.pandapowerNet, mapping: ElementMap
) -> list[GeneratorResult]:
    injections = _generator_injections(net, mapping)
    results: list[GeneratorResult] = []
    for gen in system.generators:
        pg, qg = injections.get(gen.id, (gen.pg, gen.qg))
        results.append(
            GeneratorResult(
                generator=gen.id,
                bus=gen.bus,
                pg=pg,
                qg=qg,
                v=_num(net.res_bus.at[mapping.buses[gen.bus], "vm_pu"]),
                status=_status(qg, gen.qmin, gen.qmax, gen.active),
            )
        )
    return results


def _branch_losses(net: pp.pandapowerNet) -> tuple[float, float]:
    real = sum(_num(row.pl_mw) for row in net.res_line.itertuples())
    reactive = sum(_num(row.ql_mvar) for row in net.res_line.itertuples())
    real += sum(_num(row.pl_mw) for row in net.res_trafo.itertuples())
    reactive += sum(_num(row.ql_mvar) for row in net.res_trafo.itertuples())
    return real, reactive


def _consumption(
    system: PowerSystem, net: pp.pandapowerNet, mapping: ElementMap
) -> tuple[dict[str, float], dict[str, float]]:
    """Consumption per bus: positive means load, matching pandapower's convention."""
    bus_p: dict[str, float] = {bus.id: 0.0 for bus in system.buses}
    bus_q: dict[str, float] = {bus.id: 0.0 for bus in system.buses}
    for load in system.loads:
        if load.active:
            bus_p[load.bus] += load.pl
            bus_q[load.bus] += load.ql
    for bus_id, values in _shunt_consumption(system, net, mapping).items():
        bus_p[bus_id] += values["p"]
        bus_q[bus_id] += values["q"]
    for gen_id, (kind, index) in mapping.generators.items():
        gen = next(item for item in system.generators if item.id == gen_id)
        if not gen.active or kind == "ext_grid":
            continue
        row = net.res_gen.loc[index] if kind == "gen" else net.res_sgen.loc[index]
        bus_p[gen.bus] -= _num(row.p_mw)
        bus_q[gen.bus] -= _num(row.q_mvar)
    return bus_p, bus_q


def _residual(system: PowerSystem, net: pp.pandapowerNet, mapping: ElementMap) -> float:
    """Recompute the bus balance from the results and return the worst error in p.u."""
    base = system.baseMVA
    bus_p, bus_q = _consumption(system, net, mapping)
    # Every external grid is a free injection, including the bus-0 fallback and multi-slack systems.
    references = mapping.references or {
        gen.bus for gen_id, (kind, _) in mapping.generators.items() if kind == "ext_grid"
        for gen in system.generators if gen.id == gen_id
    }
    worst = 0.0
    for bus in system.buses:
        if bus.type == "isolated" or not bus.active or bus.id in references:
            continue
        index = mapping.buses[bus.id]
        worst = max(worst, abs(_num(net.res_bus.at[index, "p_mw"]) - bus_p[bus.id]) / base)
        if bus.type == "pq":
            worst = max(worst, abs(_num(net.res_bus.at[index, "q_mvar"]) - bus_q[bus.id]) / base)
    return worst


def _solve(
    net: pp.pandapowerNet, algorithm: str, tolerance: float, base_mva: float, max_iterations: int
) -> tuple[bool, int, str | None]:
    try:
        if algorithm == "dc":
            pp.rundcpp(net, numba=False)
        else:
            pp.runpp(
                net,
                algorithm=algorithm,
                init="flat",
                tolerance_mva=tolerance * base_mva,
                max_iteration=max_iterations,
                numba=False,
                enforce_q_lims=True,
            )
        return True, int(net._ppc.get("iterations", 0)), None
    except Exception as error:  # pandapower raises several unrelated exception types
        return False, 0, f"{type(error).__name__}: {error}"


def _service_messages(system: PowerSystem, messages: list[str]) -> None:
    out_of_service = [
        bus.id for bus in system.buses if not bus.active or bus.type == "isolated"
    ]
    if out_of_service:
        messages.append(
            f"{len(out_of_service)} bus(es) out of service report zero voltage and no injection"
        )


def _profile_messages(
    system: PowerSystem, results: list[BusResult], algorithm: str, messages: list[str]
) -> None:
    out_of_limits = [
        result.bus
        for result, bus in zip(results, system.buses, strict=True)
        if bus.active and (result.v < bus.vmin - 1e-9 or result.v > bus.vmax + 1e-9)
    ]
    if out_of_limits:
        messages.append(f"{len(out_of_limits)} bus(es) outside the declared vmin/vmax limits")
    if algorithm == "dc":
        messages.append("DC power flow reports MW flows and angles; voltages are nominal")


def _failed_study(
    method: str, started_at: str, started: float, summary: str, messages: list[str]
) -> PowerFlowStudy:
    elapsed = (time.perf_counter() - started) * 1000
    return PowerFlowStudy(
        id=_study_id(method),
        title=f"Power flow ({method})",
        startedAt=started_at,
        elapsedMs=elapsed,
        status="failed",
        summary=summary,
        messages=messages,
        engine=ENGINE,
        data=_empty_result(method, elapsed),
    )


def run_power_flow(
    system: PowerSystem,
    method: PowerFlowMethod = "Newton-Raphson",
    tolerance: float = 1e-6,
    max_iterations: int = 50,
) -> PowerFlowStudy:
    started = time.perf_counter()
    started_at = _now_iso()

    try:
        messages = validate_system(system)
    except SystemValidationError as error:
        return _failed_study(method, started_at, started, "Model validation failed", error.messages)

    net, mapping, adapter_messages = build_net(system)
    messages.extend(adapter_messages)

    algorithm = ALGORITHMS[method]
    if method in {"HOLAR", "Hybrid"}:
        messages.append(f"{method} is not implemented server-side; Newton-Raphson is used")

    converged, iterations, failure = _solve(
        net, algorithm, tolerance, system.baseMVA, max_iterations
    )
    if not converged:
        messages.append(failure or "power flow did not converge")
        return _failed_study(method, started_at, started, "Power flow did not converge", messages)

    elapsed = (time.perf_counter() - started) * 1000
    bus_results = _bus_results(system, net, mapping)
    loss_p, loss_q = _branch_losses(net)
    _service_messages(system, messages)
    _profile_messages(system, bus_results, algorithm, messages)
    messages.append(f"{ENGINE}; method {method} solved as '{algorithm}'")

    return PowerFlowStudy(
        id=_study_id(method),
        title=f"Power flow ({method})",
        startedAt=started_at,
        elapsedMs=elapsed,
        status="success",
        summary=(
            f"{method} converged in {iterations} iteration(s); "
            f"losses {loss_p:.3f} MW / {loss_q:.3f} Mvar"
        ),
        messages=messages,
        engine=ENGINE,
        data=PowerFlowResult(
            converged=True,
            iterations=iterations,
            maxMismatch=_residual(system, net, mapping),
            losses={"real": loss_p, "imag": loss_q},
            busResults=bus_results,
            lineResults=_line_results(system, net, mapping),
            transformerResults=_transformer_results(system, net, mapping),
            generatorResults=_generator_results(system, net, mapping),
            elapsedTime=elapsed,
            method=method,
        ),
    )
