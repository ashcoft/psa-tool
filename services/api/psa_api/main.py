"""FastAPI application: power-flow studies and the equipment library."""

from __future__ import annotations

import os
from contextlib import asynccontextmanager

import pandapower as pp
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .catalog import Catalog, build_engine
from .contract import (
    CONTRACT_VERSION,
    CableSize,
    DatasetVersion,
    HealthResponse,
    PowerFlowRequest,
    PowerFlowStudy,
    RelayCurve,
    RelayModel,
)
from .studies import run_power_flow
from .validation import SystemValidationError, validate_system

SERVICE_NAME = "psa-api"


@asynccontextmanager
async def lifespan(app: FastAPI):
    engine = build_engine()
    catalog = Catalog(engine)
    catalog.ensure_seeded()
    app.state.catalog = catalog
    yield
    engine.dispose()


app = FastAPI(
    title="Power System Analysis Tool API",
    version=__version__,
    summary="Screening power-flow studies and the cable/relay equipment library.",
    lifespan=lifespan,
)

origin_env = os.environ.get("PSA_CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in origin_env.split(",") if origin.strip()],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


def get_catalog() -> Catalog:
    return app.state.catalog


@app.get("/v1/health", response_model=HealthResponse)
def health(catalog: Catalog = Depends(get_catalog)) -> HealthResponse:
    datasets = catalog.datasets()
    return HealthResponse(
        status="ok",
        service=SERVICE_NAME,
        version=__version__,
        contractVersion=CONTRACT_VERSION,
        solver={"engine": "pandapower", "version": pp.__version__},
        catalog={
            "datasets": len(datasets),
            "current": datasets[0].id if datasets else None,
        },
    )


@app.get("/v1/catalog/datasets", response_model=list[DatasetVersion])
def catalog_datasets(catalog: Catalog = Depends(get_catalog)) -> list[DatasetVersion]:
    return catalog.datasets()


@app.get("/v1/catalog/cables", response_model=list[CableSize])
def catalog_cables(
    voltageClassKv: float | None = Query(default=None, gt=0),
    conductor: str | None = Query(default=None, max_length=8),
    catalog: Catalog = Depends(get_catalog),
) -> list[CableSize]:
    return catalog.cables(voltage_class_kv=voltageClassKv, conductor=conductor)


@app.get("/v1/catalog/relay-curves", response_model=list[RelayCurve])
def catalog_relay_curves(catalog: Catalog = Depends(get_catalog)) -> list[RelayCurve]:
    return catalog.relay_curves()


@app.get("/v1/catalog/relays", response_model=list[RelayModel])
def catalog_relays(catalog: Catalog = Depends(get_catalog)) -> list[RelayModel]:
    return catalog.relays()


@app.post("/v1/studies/powerflow", response_model=PowerFlowStudy)
def run_power_flow_study(request: PowerFlowRequest) -> PowerFlowStudy:
    try:
        validate_system(request.system)
    except SystemValidationError as error:
        raise HTTPException(status_code=422, detail={"messages": error.messages}) from error

    return run_power_flow(
        request.system,
        method=request.method,
        tolerance=request.tolerance,
        max_iterations=request.maxIterations,
    )
