"""Model checks that must run before a study.

The service refuses a system that references a missing bus or repeats an id.
Everything else degrades to a study-log message, because the point is to solve
a screening model, not to gate the user behind a validation wizard.
"""

from __future__ import annotations

from .contract import PowerSystem


class SystemValidationError(ValueError):
    def __init__(self, messages: list[str]) -> None:
        super().__init__("; ".join(messages))
        self.messages = messages


def validate_system(system: PowerSystem) -> list[str]:
    """Return advisory messages or raise on an unusable model."""
    errors: list[str] = []
    warnings: list[str] = []

    bus_ids = [bus.id for bus in system.buses]
    if not bus_ids:
        errors.append("system has no buses")
    duplicates = {bid for bid in bus_ids if bus_ids.count(bid) > 1}
    if duplicates:
        errors.append(f"duplicate bus ids: {', '.join(sorted(duplicates))}")

    known = set(bus_ids)

    def require_bus(owner: str, value: str | None) -> None:
        if value is None:
            errors.append(f"{owner} has no bus reference")
        elif value not in known:
            errors.append(f"{owner} references unknown bus '{value}'")

    for line in system.lines:
        require_bus(f"line {line.id} (fromBus)", line.fromBus)
        require_bus(f"line {line.id} (toBus)", line.toBus)
        if line.fromBus == line.toBus:
            errors.append(f"line {line.id} connects a bus to itself")
        if line.rating <= 0:
            warnings.append(f"line {line.id} has non-positive rating; loading is reported as 0")
    for txf in system.transformers:
        require_bus(f"transformer {txf.id} (fromBus)", txf.fromBus)
        require_bus(f"transformer {txf.id} (toBus)", txf.toBus)
        if txf.fromBus == txf.toBus:
            errors.append(f"transformer {txf.id} connects a bus to itself")
        if txf.tap <= 0:
            warnings.append(f"transformer {txf.id} has tap <= 0; 1.0 is used")
    for gen in system.generators:
        require_bus(f"generator {gen.id}", gen.bus)
        if gen.qmax < gen.qmin:
            warnings.append(f"generator {gen.id} has qmax < qmin; limits ignored")
    for load in system.loads:
        require_bus(f"load {load.id}", load.bus)
    for shunt in system.shunts:
        require_bus(f"shunt {shunt.id}", shunt.bus)

    slack = [bus for bus in system.buses if bus.type == "slack"]
    if not slack:
        warnings.append(
            "no bus is marked 'slack'; bus 0 is used as the reference, as in the client engine"
        )
    elif len(slack) > 1:
        warnings.append(
            f"{len(slack)} slack buses found; each becomes an external grid at its own voltage"
        )

    if errors:
        raise SystemValidationError(errors)
    return warnings
