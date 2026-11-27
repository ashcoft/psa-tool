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

from .contract import PowerSystem

DEFAULT_VBASE_KV = 1.0


@dataclass
class ElementMap:
    buses: dict[str, int] = field(default_factory=dict)
    lines: dict[str, int] = field(default_factory=dict)
    transformers: dict[str, int] = field(default_factory=dict)
    loads: dict[str, int] = field(default_factory=dict)
    shunts: dict[str, int] = field(default_factory=dict)
    generators: dict[str, tuple[str, int]] = field(default_factory=dict)


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


def build_net(system: PowerSystem) -> tuple[pp.pandapowerNet, ElementMap, list[str]]:
    messages: list[str] = []
    bases = _voltage_bases(system, messages)
    net = pp.create_empty_network(sn_mva=system.baseMVA, f_hz=system.baseFreq)
    mapping = ElementMap()

    for bus in system.buses:
        in_service = bus.active and bus.type != "isolated"
        mapping.buses[bus.id] = pp.create_bus(
            net,
            vn_kv=bases[bus.id],
            name=bus.name or bus.id,
            in_service=in_service,
        )

    # Slack buses get one external grid each; the generator's pg is solved, not imposed.
    slack_buses = {bus.id for bus in system.buses if bus.type == "slack"}
    ext_grid_seen: dict[str, int] = {}

    for gen in system.generators:
        bus = next((b for b in system.buses if b.id == gen.bus), None)
        if bus is None or not gen.active or bus.type == "isolated" or not bus.active:
            continue
        pp_bus = mapping.buses[gen.bus]
        if gen.bus in slack_buses:
            if gen.bus in ext_grid_seen:
                messages.append(
                    f"generator {gen.id} sits on a slack bus that already has an external grid; "
                    "its pg is ignored, as in the client engine"
                )
                continue
            index = pp.create_ext_grid(
                net, pp_bus, vm_pu=gen.v or bus.voltage or 1.0, va_degree=bus.angle or 0.0
            )
            ext_grid_seen[gen.bus] = index
            mapping.generators[gen.id] = ("ext_grid", index)
            continue
        if bus.type == "pv":
            limits: dict[str, float] = {}
            if gen.qmax > gen.qmin:
                limits = {"min_q_mvar": gen.qmin, "max_q_mvar": gen.qmax}
            index = pp.create_gen(
                net, pp_bus, p_mw=gen.pg, vm_pu=gen.v or 1.0, name=gen.id, **limits
            )
            mapping.generators[gen.id] = ("gen", index)
            continue
        messages.append(
            f"generator {gen.id} is attached to pq bus {gen.bus}; "
            "it is modelled as a fixed injection"
        )
        index = pp.create_sgen(net, pp_bus, p_mw=gen.pg, q_mvar=gen.qg, name=gen.id)
        mapping.generators[gen.id] = ("sgen", index)

    for load in system.loads:
        if load.bus not in mapping.buses:
            continue
        mapping.loads[load.id] = pp.create_load(
            net,
            mapping.buses[load.bus],
            p_mw=load.pl,
            q_mvar=load.ql,
            name=load.id,
            in_service=load.active,
        )

    for shunt in system.shunts:
        if shunt.bus not in mapping.buses:
            continue
        # pandapower treats q_mvar > 0 as inductive; the model's b > 0 is capacitive.
        mapping.shunts[shunt.id] = pp.create_shunt(
            net,
            mapping.buses[shunt.bus],
            p_mw=shunt.g * system.baseMVA,
            q_mvar=-shunt.b * system.baseMVA,
            name=shunt.id,
            in_service=shunt.active,
        )

    for line in system.lines:
        zbase = bases[line.fromBus] ** 2 / system.baseMVA
        if bases[line.fromBus] != bases[line.toBus]:
            messages.append(
                f"line {line.id} joins buses with different voltage bases "
                f"({bases[line.fromBus]} kV / {bases[line.toBus]} kV); "
                "the from-bus base is used"
            )
        length = line.length if line.length and line.length > 0 else 1.0
        r_ohm_per_km = line.resistance * zbase / length
        x_ohm_per_km = line.reactance * zbase / length
        if abs(line.resistance) < 1e-12 and abs(line.reactance) < 1e-12:
            messages.append(f"line {line.id} has zero impedance and is modelled as an open branch")
        b_pu = line.susceptance or 0.0
        c_nf_per_km = b_pu / zbase / (2 * math.pi * system.baseFreq) * 1e9 / length
        if line.rating and line.rating > 0:
            max_i_ka = line.rating / (math.sqrt(3) * bases[line.fromBus])
        else:
            max_i_ka = 1e6
            messages.append(f"line {line.id} has no valid rating; loading is reported as 0")
        mapping.lines[line.id] = pp.create_line_from_parameters(
            net,
            mapping.buses[line.fromBus],
            mapping.buses[line.toBus],
            length_km=length,
            r_ohm_per_km=r_ohm_per_km,
            x_ohm_per_km=x_ohm_per_km,
            c_nf_per_km=c_nf_per_km,
            max_i_ka=max_i_ka,
            name=line.id,
            in_service=line.active,
        )

    for txf in system.transformers:
        hv_bus = bases[txf.fromBus]
        lv_bus = bases[txf.toBus]
        if abs(txf.resistance) < 1e-12 and abs(txf.reactance) < 1e-12:
            messages.append(f"transformer {txf.id} has zero impedance and is skipped")
            continue
        sn_mva = txf.rating if txf.rating and txf.rating > 0 else system.baseMVA
        if not txf.rating or txf.rating <= 0:
            messages.append(f"transformer {txf.id} has no rating; {system.baseMVA} MVA is used")
        scale = sn_mva / system.baseMVA
        index = pp.create_transformer_from_parameters(
            net,
            hv_bus=mapping.buses[txf.fromBus],
            lv_bus=mapping.buses[txf.toBus],
            sn_mva=sn_mva,
            vn_hv_kv=hv_bus,
            vn_lv_kv=lv_bus,
            vk_percent=math.hypot(txf.resistance, txf.reactance) * scale * 100,
            vkr_percent=txf.resistance * scale * 100,
            pfe_kw=0.0,
            i0_percent=0.0,
            shift_degree=txf.shift or 0.0,
            tap_side="hv",
            tap_neutral=1.0,
            tap_ratio=txf.tap if txf.tap and txf.tap > 0 else 1.0,
            name=txf.id,
            in_service=txf.active,
        )
        mapping.transformers[txf.id] = index

    for bus in system.buses:
        if bus.type == "pv" and not any(
            gen.bus == bus.id and gen.active for gen in system.generators
        ):
            messages.append(f"bus {bus.id} is marked pv but has no active generator")

    return net, mapping, messages
