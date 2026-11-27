"""PostgreSQL coverage.

DDL and query compilation always run. The round-trip test runs when
``DATABASE_URL`` points at PostgreSQL, which the API workflow provides through a
service container; locally the suite stays green without a server.
"""

from __future__ import annotations

import os
import time

import pytest
from sqlalchemy import create_engine, select, text
from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateTable

from psa_api.catalog import Catalog, build_engine, cable_size, metadata, relay_curve

# A disposable database, not the API's own catalogue: the round trip creates and drops a schema.
TEST_URL = os.environ.get("PSA_TEST_DATABASE_URL", "")
postgres_only = pytest.mark.skipif(
    not TEST_URL.startswith("postgresql"),
    reason="set PSA_TEST_DATABASE_URL to a disposable PostgreSQL database",
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
def test_postgres_round_trip_in_an_isolated_schema() -> None:
    engine = create_engine(TEST_URL, pool_pre_ping=True)
    schema = f"psa_test_{int(time.time() * 1_000_000)}"
    with engine.begin() as conn:
        conn.execute(text(f'CREATE SCHEMA "{schema}"'))
    try:
        scoped = engine.execution_options(schema_translate_map={None: schema})
        catalog = Catalog(scoped)
        catalog.ensure_seeded()

        assert len(catalog.cables()) == 15
        assert len(catalog.relay_curves()) == 6
        assert len(catalog.relays()) == 5
        assert len(catalog.cables(voltage_class_kv=10.0)) == 7
    finally:
        # The application schema is never touched; only this test's schema is dropped.
        with engine.begin() as conn:
            conn.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
        engine.dispose()


def test_component_settings_encode_special_characters(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("POSTGRES_HOST", "db")
    monkeypatch.setenv("POSTGRES_USER", "psa")
    monkeypatch.setenv("POSTGRES_PASSWORD", "p@ss:word")
    monkeypatch.setenv("POSTGRES_DB", "psa")

    engine = build_engine()
    rendered = engine.url.render_as_string(hide_password=False)

    assert engine.url.password == "p@ss:word"
    assert "p%40ss%3Aword" in rendered


def test_missing_password_is_reported(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("POSTGRES_HOST", "db")
    monkeypatch.setenv("POSTGRES_PASSWORD", "")

    with pytest.raises(RuntimeError, match="POSTGRES_PASSWORD"):
        build_engine()
