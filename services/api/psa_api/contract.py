"""Pydantic mirror of the TypeScript model in ``src/types/index.ts``.

Field names stay camelCase so a project file loads into both implementations
without an adapter. Extra keys are preserved rather than rejected: the
TypeScript model grows faster than this mirror, and a new optional field must
not break the service.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

CONTRACT_VERSION = "1.1.0"

BusType = Literal["slack", "pv", "pq", "isolated"]
PowerFlowMethod = Literal[
    "Newton-Raphson", "Fast-Decoupled", "DC", "Gauss-Seidel", "HOLAR", "Hybrid"
]


class Model(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)


class Bus(Model):
    id: str
    name: str = ""
    type: BusType = "pq"
    voltage: float = 1.0
    angle: float = 0.0
    vmin: float = 0.9
    vmax: float = 1.1
    area: int = 1
    region: int = 1
    x: float = 0.0
    y: float = 0.0
    active: bool = True
    vbase: float | None = Field(default=None, gt=0)
    vScheduled: float | None = None
    symbol: str | None = None
    subtype: str | None = None
    zone: int | None = None
    owner: int | None = None
    comments: str | None = None


class Line(Model):
    id: str
    name: str | None = None
    fromBus: str
    toBus: str
    resistance: float
    reactance: float
    susceptance: float = 0.0
    rating: float = 100.0
    ratingA: float | None = None
    ratingB: float | None = None
    length: float | None = Field(default=None, ge=0)
    cost: float | None = None
    active: bool = True
    lineType: str | None = None
    symbol: str | None = None


class Transformer(Model):
    id: str
    name: str | None = None
    fromBus: str
    toBus: str
    resistance: float
    reactance: float
    tap: float = 1.0
    shift: float = 0.0
    rating: float = 100.0
    vhigh: float | None = Field(default=None, gt=0)
    vlow: float | None = Field(default=None, gt=0)
    vectorGroup: str | None = None
    connection: str | None = None
    active: bool = True
    symbol: str | None = None


class GeneratorCost(Model):
    model: Literal["polynomial", "piecewise"]
    c2: float | None = None
    c1: float | None = None
    c0: float | None = None
    startup: float | None = None
    shutdown: float | None = None
    piecewise: list[dict[str, float]] | None = None


class Generator(Model):
    id: str
    name: str | None = None
    bus: str
    pg: float = 0.0
    qg: float = 0.0
    v: float = 1.0
    pmax: float = 0.0
    pmin: float = 0.0
    qmax: float = 0.0
    qmin: float = 0.0
    cost: GeneratorCost | None = None
    model: str | None = None
    active: bool = True
    symbol: str | None = None


class Load(Model):
    id: str
    name: str | None = None
    bus: str
    pl: float = 0.0
    ql: float = 0.0
    demandModel: str | None = None
    active: bool = True
    symbol: str | None = None


class Shunt(Model):
    id: str
    name: str | None = None
    bus: str
    g: float = 0.0
    b: float = 0.0
    vlow: float | None = None
    vhigh: float | None = None
    active: bool = True
    symbol: str | None = None


class GenericComponent(Model):
    id: str
    type: str
    category: Literal["AC", "DC", "Instrument", "Control", "Other"]
    name: str
    bus: str | None = None
    fromBus: str | None = None
    toBus: str | None = None
    x: float = 0.0
    y: float = 0.0
    properties: dict[str, Any] = Field(default_factory=dict)
    active: bool = True


class Area(Model):
    id: str
    name: str
    slackBus: str


class PowerSystem(Model):
    buses: list[Bus]
    lines: list[Line] = Field(default_factory=list)
    transformers: list[Transformer] = Field(default_factory=list)
    generators: list[Generator] = Field(default_factory=list)
    loads: list[Load] = Field(default_factory=list)
    shunts: list[Shunt] = Field(default_factory=list)
    components: list[GenericComponent] = Field(default_factory=list)
    areas: list[Area] = Field(default_factory=list)
    baseMVA: float = Field(default=100.0, gt=0)
    baseFreq: float = Field(default=50.0, gt=0)
    slackBus: str | None = None
    name: str | None = None


class BusResult(Model):
    bus: str
    v: float
    angle: float
    pg: float
    qg: float
    pl: float
    ql: float
    qshunt: float


class LineResult(Model):
    line: str
    fromBus: str
    toBus: str
    pFrom: float
    qFrom: float
    pTo: float
    qTo: float
    ploss: float
    qloss: float
    loading: float


class TransformerResult(Model):
    transformer: str
    fromBus: str
    toBus: str
    pFrom: float
    qFrom: float
    pTo: float
    qTo: float
    loading: float
    tap: float


class GeneratorResult(Model):
    generator: str
    bus: str
    pg: float
    qg: float
    v: float
    status: Literal["on", "off", "at limit"]


class PowerFlowResult(Model):
    converged: bool
    iterations: int
    # None when no solution exists; the client keeps Number.NaN in memory but never
    # serialises it, so null is the JSON-safe equivalent.
    maxMismatch: float | None = None
    losses: dict[str, float]
    busResults: list[BusResult]
    lineResults: list[LineResult]
    transformerResults: list[TransformerResult] = Field(default_factory=list)
    generatorResults: list[GeneratorResult] = Field(default_factory=list)
    elapsedTime: float
    method: PowerFlowMethod


class StudyBase(Model):
    id: str
    title: str
    startedAt: str
    elapsedMs: float
    status: Literal["success", "failed"]
    summary: str
    messages: list[str] = Field(default_factory=list)
    engine: str | None = None


class PowerFlowStudy(StudyBase):
    kind: Literal["powerflow"] = "powerflow"
    data: PowerFlowResult


# Only power flow is implemented; each further study adds a variant here.
StudyRun = PowerFlowStudy


class PowerFlowRequest(Model):
    system: PowerSystem
    method: PowerFlowMethod = "Newton-Raphson"
    tolerance: float = Field(default=1e-6, gt=0, le=1e-1)
    maxIterations: int = Field(default=50, ge=1, le=500)


class HealthResponse(Model):
    status: Literal["ok"]
    service: str
    version: str
    contractVersion: str
    solver: dict[str, str]
    catalog: dict[str, Any]


class DatasetVersion(Model):
    id: str
    publishedAt: str
    source: str
    notes: str | None = None


class CableSize(Model):
    id: str
    familyId: str
    standard: str
    voltageClassKv: float
    conductor: str
    insulation: str
    sizeMm2: float
    resistanceOhmPerKm: float
    reactanceOhmPerKm: float
    capacitanceUfPerKm: float
    ampacityADuct: float | None = None
    ampacityADirect: float | None = None
    notes: str | None = None


class RelayCurve(Model):
    id: str
    standard: str
    curve: str
    label: str
    k: float
    alpha: float
    b: float = 0.0
    band: str | None = None
    datasetVersion: str


class RelayModel(Model):
    id: str
    manufacturer: str
    model: str
    standard: str
    functions: list[str]
    curves: list[str] = Field(default_factory=list)
    datasetVersion: str
    notes: str | None = None
