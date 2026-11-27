"""PostgreSQL coverage.

DDL and query compilation always run. The round-trip test runs when
``DATABASE_URL`` points at PostgreSQL, which the API workflow provides through a
service container; locally the suite stays green without a server.
"""

from __future__ import annotations

import os

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateTable

from psa_api.catalog import Catalog, cable_size, metadata, relay_curve

DATABASE_URL = os.environ.get("DATABASE_URL", "")
postgres_only = pytest.mark.skipif(
    not DATABASE_URL.startswith("postgresql"),
    reason="set DATABASE_URL to a PostgreSQL instance to run the round trip",
)


def test_postgres_ddl_compiles_for_every_table() -> None:
    dialect = postgresql.dialect()
    for table in metadata.sorted_tables:
        ddl = str(CreateTable(table).compile(dialect=dialect))
        assert f"CREATE TABLE {table.name}" in ddl
        assert "CREATE TABLE" in ddl


def test_postgres_queries_compile() -> None:
    dialect = postgresql.dialect()
    statements = [
        select(cable_size).where(cable_size.c.size_mm2 > 95),
        select(relay_curve).where(relay_curve.c.band == "IEC").order_by(relay_curve.c.k),
    ]
    for statement in statements:
        compiled = str(statement.compile(dialect=dialect))
        assert "SELECT" in compiled
        assert "WHERE" in compiled


@postgres_only
def test_postgres_round_trip() -> None:
    engine = create_engine(DATABASE_URL, pool_pre_ping=True)
    metadata.drop_all(engine)
    catalog = Catalog(engine)
    catalog.ensure_seeded()

    assert len(catalog.cables()) == 15
    assert len(catalog.relay_curves()) == 6
    assert len(catalog.relays()) == 5
    assert len(catalog.cables(voltage_class_kv=10.0)) == 7

    metadata.drop_all(engine)
    engine.dispose()
