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


def _now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def _study_id(method: str) -> str:
    return f"powerflow-{method.lower().replace(' ', '-')}-{int(time.time() * 1000)}"


def _empty_result(method: PowerFlowMethod, elapsed: float) -> PowerFlowResult:
    return PowerFlowResult(
        converged=False,
        iterations=0,
        maxMismatch=float("nan"),
        losses={"real": 0.0, "imag": 0.0},
        busResults=[],
        lineResults=[],
        transformerResults=[],
        generatorResults=[],
        elapsedTime=elapsed,
        method=method,
    )


def _bus_totals(system: PowerSystem, net: pp.pandapowerNet) -> dict[str, dict[str, float]]:
    totals = {
        bus.id: {"pl": 0.0, "ql": 0.0, "shunt_p": 0.0, "shunt_q": 0.0} for bus in system.buses
    }
    for load in system.loads:
        if load.bus in totals and load.active:
            totals[load.bus]["pl"] += load.pl
            totals[load.bus]["ql"] += load.ql
    for shunt in system.shunts:
        if shunt.bus in totals and shunt.active:
            totals[shunt.bus]["shunt_p"] += shunt.g * system.baseMVA
            totals[shunt.bus]["shunt_q"] += -shunt.b * system.baseMVA
    return totals


def _generator_injections(
    net: pp.pandapowerNet, mapping: ElementMap
) -> dict[str, tuple[float, float]]:
    """Solved p/q at each generator's bus, keyed by element kind."""
    injections: dict[str, tuple[float, float]] = {}
    for gen_id, (kind, index) in mapping.generators.items():
        if kind == "ext_grid":
            row = net.res_ext_grid.loc[index]
        elif kind == "gen":
            row = net.res_gen.loc[index]
        else:
            row = net.res_sgen.loc[index]
        injections[gen_id] = (float(row.p_mw), float(row.q_mvar))
    return injections


def _line_loading(row, rating: float) -> float:  # noqa: ANN001 - pandas row
    """Apparent power at the worse end as a percentage of the branch rating.

    The client divides only the sending-end flow by the rating, which understates
    charging-heavy lines; the service reports the larger of the two ends.
    """
    sending = math.hypot(float(row.p_from_mw), float(row.q_from_mvar))
    receiving = math.hypot(float(row.p_to_mw), float(row.q_to_mvar))
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


def _residual(system: PowerSystem, net: pp.pandapowerNet, mapping: ElementMap) -> float:
    """Recompute the bus balance from the results and return the worst error in p.u."""
    base = system.baseMVA
    # pandapower reports res_bus as consumption: positive means load, negative means injection.
    bus_p: dict[str, float] = {bus.id: 0.0 for bus in system.buses}
    bus_q: dict[str, float] = {bus.id: 0.0 for bus in system.buses}
    for load in system.loads:
        if load.active:
            bus_p[load.bus] += load.pl
            bus_q[load.bus] += load.ql
    for shunt in system.shunts:
        if shunt.active:
            bus_p[shunt.bus] += shunt.g * base
            bus_q[shunt.bus] += -shunt.b * base
    for gen_id, (kind, index) in mapping.generators.items():
        gen = next(g for g in system.generators if g.id == gen_id)
        if not gen.active or kind == "ext_grid":
            continue
        row = net.res_gen.loc[index] if kind == "gen" else net.res_sgen.loc[index]
        bus_p[gen.bus] -= float(row.p_mw)
        bus_q[gen.bus] -= float(row.q_mvar)

    worst = 0.0
    slack = next((bus.id for bus in system.buses if bus.type == "slack"), None)
    for bus in system.buses:
        if bus.type == "isolated" or not bus.active or bus.id == slack:
            continue
        index = mapping.buses[bus.id]
        p_err = abs(float(net.res_bus.at[index, "p_mw"]) - bus_p[bus.id]) / base
        worst = max(worst, p_err)
        if bus.type == "pq":
            q_err = abs(float(net.res_bus.at[index, "q_mvar"]) - bus_q[bus.id]) / base
            worst = max(worst, q_err)
    return worst


def run_power_flow(
    system: PowerSystem,
    method: PowerFlowMethod = "Newton-Raphson",
    tolerance: float = 1e-6,
    max_iterations: int = 50,
) -> PowerFlowStudy:
    started = time.perf_counter()
    started_at = _now_iso()
    messages: list[str] = []

    try:
        messages.extend(validate_system(system))
    except SystemValidationError as error:
        elapsed_ms = (time.perf_counter() - started) * 1000
        return PowerFlowStudy(
            id=_study_id(method),
            title=f"Power flow ({method})",
            startedAt=started_at,
            elapsedMs=elapsed_ms,
            status="failed",
            summary="Model validation failed",
            messages=error.messages,
            engine=ENGINE,
            data=_empty_result(method, elapsed_ms),
        )

    net, mapping, adapter_messages = build_net(system)
    messages.extend(adapter_messages)

    algorithm = ALGORITHMS[method]
    if method in {"HOLAR", "Hybrid"}:
        messages.append(f"{method} is not implemented server-side; Newton-Raphson is used")

    converged = True
    iterations = 0
    failure: str | None = None
    try:
        if algorithm == "dc":
            pp.rundcpp(net, numba=False)
        else:
            pp.runpp(
                net,
                algorithm=algorithm,
                init="flat",
                tolerance_mva=tolerance * system.baseMVA,
                max_iteration=max_iterations,
                numba=False,
            )
        iterations = int(net._ppc.get("iterations", 0))
    except Exception as error:  # pandapower raises several unrelated exception types
        converged = False
        failure = f"{type(error).__name__}: {error}"

    elapsed_ms = (time.perf_counter() - started) * 1000

    if not converged:
        messages.append(failure or "power flow did not converge")
        return PowerFlowStudy(
            id=_study_id(method),
            title=f"Power flow ({method})",
            startedAt=started_at,
            elapsedMs=elapsed_ms,
            status="failed",
            summary="Power flow did not converge",
            messages=messages,
            engine=ENGINE,
            data=_empty_result(method, elapsed_ms),
        )

    totals = _bus_totals(system, net)
    bus_results: list[BusResult] = []
    for bus in system.buses:
        index = mapping.buses[bus.id]
        row = net.res_bus.loc[index]
        values = totals[bus.id]
        bus_results.append(
            BusResult(
                bus=bus.id,
                v=float(row.vm_pu),
                angle=float(row.va_degree),
                pg=values["pl"] + values["shunt_p"] - float(row.p_mw),
                qg=values["ql"] + values["shunt_q"] - float(row.q_mvar),
                pl=values["pl"],
                ql=values["ql"],
                qshunt=values["shunt_q"],
            )
        )

    line_results: list[LineResult] = []
    for line in system.lines:
        if line.id not in mapping.lines:
            continue
        row = net.res_line.loc[mapping.lines[line.id]]
        line_results.append(
            LineResult(
                line=line.id,
                fromBus=line.fromBus,
                toBus=line.toBus,
                pFrom=float(row.p_from_mw),
                qFrom=float(row.q_from_mvar),
                pTo=float(row.p_to_mw),
                qTo=float(row.q_to_mvar),
                ploss=float(row.pl_mw),
                qloss=float(row.ql_mvar),
                loading=_line_loading(row, line.rating) if line.rating and line.rating > 0 else 0.0,
            )
        )

    transformer_results: list[TransformerResult] = []
    for txf in system.transformers:
        if txf.id not in mapping.transformers:
            continue
        row = net.res_trafo.loc[mapping.transformers[txf.id]]
        transformer_results.append(
            TransformerResult(
                transformer=txf.id,
                fromBus=txf.fromBus,
                toBus=txf.toBus,
                pFrom=float(row.p_hv_mw),
                qFrom=float(row.q_hv_mvar),
                pTo=float(row.p_lv_mw),
                qTo=float(row.q_lv_mvar),
                loading=float(row.loading_percent),
                tap=txf.tap,
            )
        )

    injections = _generator_injections(net, mapping)
    generator_results: list[GeneratorResult] = []
    for gen in system.generators:
        pg, qg = injections.get(gen.id, (gen.pg, gen.qg))
        bus_index = mapping.buses[gen.bus]
        generator_results.append(
            GeneratorResult(
                generator=gen.id,
                bus=gen.bus,
                pg=pg,
                qg=qg,
                v=float(net.res_bus.at[bus_index, "vm_pu"]),
                status=_status(qg, gen.qmin, gen.qmax, gen.active),
            )
        )

    loss_p = sum(float(row.pl_mw) for row in net.res_line.itertuples())
    loss_q = sum(float(row.ql_mvar) for row in net.res_line.itertuples())
    loss_p += sum(float(row.pl_mw) for row in net.res_trafo.itertuples())
    loss_q += sum(float(row.ql_mvar) for row in net.res_trafo.itertuples())

    out_of_limits = [
        result.bus
        for result, bus in zip(bus_results, system.buses, strict=True)
        if bus.active and (result.v < bus.vmin - 1e-9 or result.v > bus.vmax + 1e-9)
    ]
    if out_of_limits:
        messages.append(f"{len(out_of_limits)} bus(es) outside the declared vmin/vmax limits")
    if algorithm == "dc":
        messages.append("DC power flow reports MW flows and angles; voltages are nominal")

    messages.append(f"{ENGINE}; method {method} solved as '{algorithm}'")

    summary = (
        f"{method} converged in {iterations} iteration(s); "
        f"losses {loss_p:.3f} MW / {loss_q:.3f} Mvar"
    )

    return PowerFlowStudy(
        id=_study_id(method),
        title=f"Power flow ({method})",
        startedAt=started_at,
        elapsedMs=elapsed_ms,
        status="success",
        summary=summary,
        messages=messages,
        engine=ENGINE,
        data=PowerFlowResult(
            converged=True,
            iterations=iterations,
            maxMismatch=_residual(system, net, mapping),
            losses={"real": loss_p, "imag": loss_q},
            busResults=bus_results,
            lineResults=line_results,
            transformerResults=transformer_results,
            generatorResults=generator_results,
            elapsedTime=elapsed_ms,
            method=method,
        ),
    )
