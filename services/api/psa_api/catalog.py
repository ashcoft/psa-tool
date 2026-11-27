"""Equipment library storage: cable sizes, relay models and relay curves.

The schema is written with SQLAlchemy Core types that work on SQLite and
PostgreSQL alike, so tests run without a server and deployment uses Postgres.
Every row belongs to a dataset version; a project pins the version it was
solved against so numbers stay reproducible.
"""

from __future__ import annotations

from sqlalchemy import (
    JSON,
    Column,
    Float,
    ForeignKey,
    Integer,
    MetaData,
    String,
    Table,
    Text,
    func,
    select,
)

from . import seed
from .contract import CableSize, DatasetVersion, RelayCurve, RelayModel

metadata = MetaData()

dataset_version = Table(
    "dataset_version",
    metadata,
    Column("id", String(32), primary_key=True),
    Column("published_at", String(32), nullable=False),
    Column("source", Text, nullable=False),
    Column("notes", Text),
)

cable_family = Table(
    "cable_family",
    metadata,
    Column("id", String(64), primary_key=True),
    Column("standard", String(32), nullable=False),
    Column("voltage_class_kv", Float, nullable=False),
    Column("conductor", String(8), nullable=False),
    Column("insulation", String(16), nullable=False),
    Column("cores", Integer, nullable=False),
    Column("dataset_version", String(32), ForeignKey("dataset_version.id"), nullable=False),
)

cable_size = Table(
    "cable_size",
    metadata,
    Column("id", String(64), primary_key=True),
    Column("family_id", String(64), ForeignKey("cable_family.id"), nullable=False),
    Column("size_mm2", Float, nullable=False),
    Column("resistance_ohm_per_km", Float, nullable=False),
    Column("reactance_ohm_per_km", Float, nullable=False),
    Column("capacitance_uf_per_km", Float, nullable=False),
    Column("ampacity_a_duct", Float),
    Column("ampacity_a_direct", Float),
    Column("notes", Text),
)

relay_curve = Table(
    "relay_curve",
    metadata,
    Column("id", String(64), primary_key=True),
    Column("standard", String(32), nullable=False),
    Column("curve", String(8), nullable=False),
    Column("label", String(64), nullable=False),
    Column("k", Float, nullable=False),
    Column("alpha", Float, nullable=False),
    Column("band", String(16)),
    Column("dataset_version", String(32), ForeignKey("dataset_version.id"), nullable=False),
)

relay_model = Table(
    "relay_model",
    metadata,
    Column("id", String(64), primary_key=True),
    Column("manufacturer", String(64), nullable=False),
    Column("model", String(64), nullable=False),
    Column("standard", String(32), nullable=False),
    Column("functions", JSON, nullable=False),
    Column("curves", JSON, nullable=False),
    Column("dataset_version", String(32), ForeignKey("dataset_version.id"), nullable=False),
    Column("notes", Text),
)


class Catalog:
    def __init__(self, engine) -> None:  # noqa: ANN001 - SQLAlchemy Engine
        self.engine = engine

    def ensure_schema(self) -> None:
        metadata.create_all(self.engine)

    def ensure_seeded(self) -> None:
        self.ensure_schema()
        with self.engine.begin() as conn:
            existing = conn.execute(select(func.count()).select_from(dataset_version)).scalar_one()
            if existing:
                return
            conn.execute(dataset_version.insert(), [seed.DATASET])
            conn.execute(
                cable_family.insert(),
                [{**family, "dataset_version": seed.DATASET["id"]} for family in seed.FAMILIES],
            )
            conn.execute(
                cable_size.insert(),
                list(seed.CABLES),
            )
            conn.execute(
                relay_curve.insert(),
                [{**curve, "dataset_version": seed.DATASET["id"]} for curve in seed.CURVES],
            )
            conn.execute(
                relay_model.insert(),
                [{**relay, "dataset_version": seed.DATASET["id"]} for relay in seed.RELAYS],
            )

    def datasets(self) -> list[DatasetVersion]:
        query = select(dataset_version).order_by(dataset_version.c.published_at.desc())
        with self.engine.connect() as conn:
            return [
                DatasetVersion(
                    id=row.id,
                    publishedAt=row.published_at,
                    source=row.source,
                    notes=row.notes,
                )
                for row in conn.execute(query)
            ]

    def cables(
        self, voltage_class_kv: float | None = None, conductor: str | None = None
    ) -> list[CableSize]:
        query = select(cable_size, cable_family).join(
            cable_family, cable_size.c.family_id == cable_family.c.id
        )
        if voltage_class_kv is not None:
            query = query.where(cable_family.c.voltage_class_kv == voltage_class_kv)
        if conductor is not None:
            query = query.where(cable_family.c.conductor == conductor)
        query = query.order_by(cable_family.c.voltage_class_kv, cable_size.c.size_mm2)
        with self.engine.connect() as conn:
            return [
                CableSize(
                    id=row.id,
                    familyId=row.family_id,
                    standard=row.standard,
                    voltageClassKv=row.voltage_class_kv,
                    conductor=row.conductor,
                    insulation=row.insulation,
                    sizeMm2=row.size_mm2,
                    resistanceOhmPerKm=row.resistance_ohm_per_km,
                    reactanceOhmPerKm=row.reactance_ohm_per_km,
                    capacitanceUfPerKm=row.capacitance_uf_per_km,
                    ampacityADuct=row.ampacity_a_duct,
                    ampacityADirect=row.ampacity_a_direct,
                    notes=row.notes,
                )
                for row in conn.execute(query)
            ]

    def relay_curves(self) -> list[RelayCurve]:
        query = select(relay_curve).order_by(relay_curve.c.band, relay_curve.c.curve)
        with self.engine.connect() as conn:
            return [
                RelayCurve(
                    id=row.id,
                    standard=row.standard,
                    curve=row.curve,
                    label=row.label,
                    k=row.k,
                    alpha=row.alpha,
                    band=row.band,
                    datasetVersion=row.dataset_version,
                )
                for row in conn.execute(query)
            ]

    def relays(self) -> list[RelayModel]:
        query = select(relay_model).order_by(relay_model.c.model)
        with self.engine.connect() as conn:
            return [
                RelayModel(
                    id=row.id,
                    manufacturer=row.manufacturer,
                    model=row.model,
                    standard=row.standard,
                    functions=list(row.functions),
                    curves=list(row.curves),
                    datasetVersion=row.dataset_version,
                    notes=row.notes,
                )
                for row in conn.execute(query)
            ]


def build_engine(url: str | None = None):
    """Create an engine from ``DATABASE_URL``; fall back to in-memory SQLite."""
    import os

    from sqlalchemy import create_engine
    from sqlalchemy.pool import StaticPool

    target = url or os.environ.get("DATABASE_URL") or "sqlite+pysqlite://"
    if ":memory:" in target or target in {"sqlite+pysqlite://", "sqlite://"}:
        # A plain in-memory database lives per connection; one shared pool keeps the schema.
        return create_engine(target, poolclass=StaticPool, connect_args={"check_same_thread": False})
    return create_engine(target, pool_pre_ping=True)
