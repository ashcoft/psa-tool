"""Map the per-unit ``PowerSystem`` model onto a pandapower network.

The client engine stores every impedance in per-unit on ``system.baseMVA`` and
the bus voltage base. pandapower works in ohms, kV and MVA, so the adapter
re-references each branch at its own voltage base instead of touching the
numbers. The mapping is deliberately mechanical and logged: anything assumed
is reported as a message in the study log.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import pandapower as pp

from .contract import Bus, Generator, Line, PowerSystem, Shunt, Transformer

DEFAULT_VBASE_KV = 1.0
UNRATED_MAX_I_KA = 1e6


@dataclass
class ElementMap:
    buses: dict[str, int] = field(default_factory=dict)
    lines: dict[str, int] = field(default_factory=dict)
    transformers: dict[str, int] = field(default_factory=dict)
    loads: dict[str, int] = field(default_factory=dict)
    shunts: dict[str, int] = field(default_factory=dict)
    generators: dict[str, tuple[str, int]] = field(default_factory=dict)
    references: set[str] = field(default_factory=set)


@dataclass
class BuildContext:
    system: PowerSystem
    net: pp.pandapowerNet
    mapping: ElementMap = field(default_factory=ElementMap)
    bases: dict[str, float] = field(default_factory=dict)
    messages: list[str] = field(default_factory=list)


def _voltage_bases(system: PowerSystem, messages: list[str]) -> dict[str, float]:
    bases: dict[str, float] = {}
    for bus in system.buses:
        if bus.vbase and bus.vbase > 0:
            bases[bus.id] = bus.vbase
    for txf in system.transformers:
        if txf.fromBus not in bases and txf.vhigh:
            bases[txf.fromBus] = txf.vhigh
        if txf.toBus not in bases and txf.vlow:
            bases[txf.toBus] = txf.vlow
    for bus in system.buses:
        if bus.id not in bases:
            bases[bus.id] = DEFAULT_VBASE_KV
            messages.append(
                f"bus {bus.id} has no vbase and no transformer voltage; "
                f"{DEFAULT_VBASE_KV} kV is assumed for the impedance conversion"
            )
    return bases


def _add_buses(ctx: BuildContext) -> None:
    for bus in ctx.system.buses:
        in_service = bus.active and bus.type != "isolated"
        ctx.mapping.buses[bus.id] = pp.create_bus(
            ctx.net,
            vn_kv=ctx.bases[bus.id],
            name=bus.name or bus.id,
            in_service=in_service,
        )


def _create_ext_grid(ctx: BuildContext, bus: Bus, vm_pu: float, seen: set[str]) -> int:
    index = pp.create_ext_grid(
        ctx.net,
        ctx.mapping.buses[bus.id],
        vm_pu=vm_pu,
        va_degree=math.degrees(bus.angle or 0.0),
    )
    seen.add(bus.id)
    ctx.mapping.references.add(bus.id)
    return index


def _add_ext_grid(ctx: BuildContext, gen: Generator, bus: Bus, seen: set[str]) -> None:
    if gen.bus in seen:
        ctx.messages.append(
            f"generator {gen.id} sits on a slack bus that already has an external grid; "
            "its pg is ignored, as in the client engine"
        )
        return
    index = _create_ext_grid(ctx, bus, gen.v or bus.voltage or 1.0, seen)
    ctx.mapping.generators[gen.id] = ("ext_grid", index)


def _slack_buses(ctx: BuildContext) -> set[str]:
    slack = {bus.id for bus in ctx.system.buses if bus.type == "slack"}
    if slack or not ctx.system.buses:
        return slack
    fallback = ctx.system.buses[0]
    ctx.messages.append(
        f"no bus is marked 'slack'; bus {fallback.id} is used as the reference, "
        "as in the client engine"
    )
    return {fallback.id}


def _add_pv_generator(ctx: BuildContext, gen: Generator, pp_bus: int) -> None:
    limits: dict[str, float] = {}
    if gen.qmax > gen.qmin:
        limits = {"min_q_mvar": gen.qmin, "max_q_mvar": gen.qmax}
    index = pp.create_gen(
        ctx.net, pp_bus, p_mw=gen.pg, vm_pu=gen.v or 1.0, name=gen.id, **limits
    )
    ctx.mapping.generators[gen.id] = ("gen", index)


def _add_generators(ctx: BuildContext) -> None:
    system = ctx.system
    slack_buses = _slack_buses(ctx)
    ext_grid_seen: set[str] = set()

    for gen in system.generators:
        bus = next((item for item in system.buses if item.id == gen.bus), None)
        if bus is None or not gen.active or bus.type == "isolated" or not bus.active:
            continue
        pp_bus = ctx.mapping.buses[gen.bus]
        if gen.bus in slack_buses:
            _add_ext_grid(ctx, gen, bus, ext_grid_seen)
        elif bus.type == "pv":
            _add_pv_generator(ctx, gen, pp_bus)
        else:
            ctx.messages.append(
                f"generator {gen.id} is attached to pq bus {gen.bus}; "
                "it is modelled as a fixed injection"
            )
            index = pp.create_sgen(ctx.net, pp_bus, p_mw=gen.pg, q_mvar=gen.qg, name=gen.id)
            ctx.mapping.generators[gen.id] = ("sgen", index)

    # A slack bus without a generator (or with only inactive ones) still needs a reference.
    for bus_id in slack_buses - ext_grid_seen:
        bus = next(item for item in system.buses if item.id == bus_id)
        _create_ext_grid(ctx, bus, bus.voltage or 1.0, ext_grid_seen)


def _create_shunt(ctx: BuildContext, shunt: Shunt) -> int:
    # pandapower treats q_mvar > 0 as inductive; the model's b > 0 is capacitive.
    return pp.create_shunt(
        ctx.net,
        ctx.mapping.buses[shunt.bus],
        p_mw=shunt.g * ctx.system.baseMVA,
        q_mvar=-shunt.b * ctx.system.baseMVA,
        name=shunt.id,
        in_service=shunt.active,
    )


def _add_loads_and_shunts(ctx: BuildContext) -> None:
    for load in ctx.system.loads:
        if load.bus not in ctx.mapping.buses:
            continue
        ctx.mapping.loads[load.id] = pp.create_load(
            ctx.net,
            ctx.mapping.buses[load.bus],
            p_mw=load.pl,
            q_mvar=load.ql,
            name=load.id,
            in_service=load.active,
        )
    for shunt in ctx.system.shunts:
        if shunt.bus in ctx.mapping.buses:
            ctx.mapping.shunts[shunt.id] = _create_shunt(ctx, shunt)


def _line_max_i(ctx: BuildContext, line: Line) -> float:
    if line.rating and line.rating > 0:
        return line.rating / (math.sqrt(3) * ctx.bases[line.fromBus])
    ctx.messages.append(f"line {line.id} has no valid rating; loading is reported as 0")
    return UNRATED_MAX_I_KA


def _line_parameters(ctx: BuildContext, line: Line) -> dict[str, float]:
    system = ctx.system
    zbase = ctx.bases[line.fromBus] ** 2 / system.baseMVA
    if ctx.bases[line.fromBus] != ctx.bases[line.toBus]:
        ctx.messages.append(
            f"line {line.id} joins buses with different voltage bases "
            f"({ctx.bases[line.fromBus]} kV / {ctx.bases[line.toBus]} kV); "
            "the from-bus base is used"
        )
    length = line.length if line.length and line.length > 0 else 1.0
    charging = (line.susceptance or 0.0) / zbase / (2 * math.pi * system.baseFreq) * 1e9
    return {
        "length_km": length,
        "r_ohm_per_km": line.resistance * zbase / length,
        "x_ohm_per_km": line.reactance * zbase / length,
        "c_nf_per_km": charging / length,
        "max_i_ka": _line_max_i(ctx, line),
    }


def _add_lines(ctx: BuildContext) -> None:
    for line in ctx.system.lines:
        if abs(line.resistance) < 1e-12 and abs(line.reactance) < 1e-12:
            ctx.messages.append(f"line {line.id} has zero impedance and is excluded from the solve")
            continue
        parameters = _line_parameters(ctx, line)
        ctx.mapping.lines[line.id] = pp.create_line_from_parameters(
            ctx.net,
            ctx.mapping.buses[line.fromBus],
            ctx.mapping.buses[line.toBus],
            name=line.id,
            in_service=line.active,
            **parameters,
        )


def _transformer_parameters(ctx: BuildContext, txf: Transformer) -> dict[str, float] | None:
    system = ctx.system
    if abs(txf.resistance) < 1e-12 and abs(txf.reactance) < 1e-12:
        ctx.messages.append(f"transformer {txf.id} has zero impedance and is skipped")
        return None
    rating = txf.rating if txf.rating and txf.rating > 0 else system.baseMVA
    if not txf.rating or txf.rating <= 0:
        ctx.messages.append(f"transformer {txf.id} has no rating; {system.baseMVA} MVA is used")
    scale = rating / system.baseMVA
    return {
        "sn_mva": rating,
        "vn_hv_kv": ctx.bases[txf.fromBus],
        "vn_lv_kv": ctx.bases[txf.toBus],
        "vk_percent": math.hypot(txf.resistance, txf.reactance) * scale * 100,
        "vkr_percent": txf.resistance * scale * 100,
    }


def _add_transformers(ctx: BuildContext) -> None:
    for txf in ctx.system.transformers:
        parameters = _transformer_parameters(ctx, txf)
        if parameters is None:
            continue
        tap = txf.tap if txf.tap and txf.tap > 0 else 1.0
        ctx.mapping.transformers[txf.id] = pp.create_transformer_from_parameters(
            ctx.net,
            hv_bus=ctx.mapping.buses[txf.fromBus],
            lv_bus=ctx.mapping.buses[txf.toBus],
            pfe_kw=0.0,
            i0_percent=0.0,
            shift_degree=txf.shift or 0.0,
            # pandapower ignores tap_ratio in the solve; the Ratio changer encodes the
            # model's per-unit tap as 1 + tap_pos * tap_step_percent / 100 on the HV side.
            tap_changer_type="Ratio" if abs(tap - 1.0) > 1e-9 else None,
            tap_side="hv",
            tap_neutral=0.0,
            tap_pos=tap - 1.0,
            tap_step_percent=100.0,
            name=txf.id,
            in_service=txf.active,
            **parameters,
        )


def _check_pv_buses(ctx: BuildContext) -> None:
    for bus in ctx.system.buses:
        if bus.type == "pv" and not any(
            gen.bus == bus.id and gen.active for gen in ctx.system.generators
        ):
            ctx.messages.append(f"bus {bus.id} is marked pv but has no active generator")


def build_net(system: PowerSystem) -> tuple[pp.pandapowerNet, ElementMap, list[str]]:
    messages: list[str] = []
    ctx = BuildContext(
        system=system,
        net=pp.create_empty_network(sn_mva=system.baseMVA, f_hz=system.baseFreq),
        bases=_voltage_bases(system, messages),
        messages=messages,
    )
    _add_buses(ctx)
    _add_generators(ctx)
    _add_loads_and_shunts(ctx)
    _add_lines(ctx)
    _add_transformers(ctx)
    _check_pv_buses(ctx)
    return ctx.net, ctx.mapping, ctx.messages
