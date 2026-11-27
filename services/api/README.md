# PSA server tier

Optional FastAPI service that runs screening power-flow studies with
[pandapower](https://www.pandapower.org/) and serves the cable and relay library
from PostgreSQL. The browser workbench keeps its own TypeScript engines; this
service exists for large studies, batch automation and shared equipment data.

The static export and the offline workbench never call it.

## Layout

| Path | Purpose |
|------|---------|
| `psa_api/contract.py` | Pydantic mirror of `src/types/index.ts` (camelCase, extra keys preserved) |
| `psa_api/adapter.py` | per-unit `PowerSystem` to pandapower network, with conversion messages |
| `psa_api/studies.py` | `StudyRun` power-flow runner and result mapping |
| `psa_api/catalog.py` | SQLAlchemy Core tables and queries for the equipment library |
| `psa_api/seed.py` | dataset version and seed rows (amperages, curve constants) |
| `psa_api/validation.py` | model checks that must fail before a study |
| `psa_api/main.py` | FastAPI routes and CORS |
| `tests/` | unit, contract, parity and PostgreSQL tests |

## Run locally

```bash
cd services/api
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn psa_api.main:app --reload --port 8000
```

Without `DATABASE_URL` the service seeds an in-memory SQLite catalogue, so the
API is usable with no database. Point `DATABASE_URL` at PostgreSQL for a durable
library:

```bash
export DATABASE_URL=postgresql+psycopg://psa:psa-local-dev@localhost:5432/psa
```

Or start the whole server mode:

```bash
POSTGRES_PASSWORD=psa-local-dev docker compose --profile server up --build
```

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/v1/health` | service, contract and solver versions, dataset count |
| GET | `/v1/catalog/datasets` | published dataset versions |
| GET | `/v1/catalog/cables` | cable sizes; filter by `voltageClassKv` and `conductor` |
| GET | `/v1/catalog/relay-curves` | IEC and IEEE inverse-time constants |
| GET | `/v1/catalog/relays` | relay models with their supported curves |
| POST | `/v1/studies/powerflow` | `PowerFlowRequest` to `StudyRun` |

`/openapi.json` is the contract of record. The request accepts a project
`PowerSystem` unchanged:

```bash
curl -s localhost:8000/v1/studies/powerflow \
  -H 'Content-Type: application/json' \
  -d '{"system": { ... }, "method": "Newton-Raphson"}'
```

## Method mapping

| Model method | pandapower algorithm |
|--------------|----------------------|
| Newton-Raphson | `nr` |
| Fast-Decoupled | `fdxb` |
| Gauss-Seidel | `gs` (typically needs more than 50 iterations) |
| DC | `rundcpp` |
| HOLAR, Hybrid | `nr` with a study-log message |

## Known differences from the client engine

The IEEE 9-bus bus voltages, angles, branch flows and losses agree with the
client to machine precision; see `tests/test_parity.py` and
`tests/fixtures/ieee9-client-nr.json`. Three deliberate differences remain:

- `BusResult.angle` is degrees in both implementations (the model `Bus.angle`
  is radians).
- Line `loading` uses the worse of the two ends. The client divides only the
  sending-end apparent power by the rating, which understates charging-heavy
  lines. On IEEE 9 bus 6-9 the client reports 7.2 % and the service 16.4 %.
- Generator results are per element from the solver, so the slack unit reports
  its solved `pg` (68.1 MW) rather than the scheduled value (71.6 MW) that the
  client echoes back.

## Tests

```bash
cd services/api
python -m pytest        # 45 tests; the PostgreSQL round trip skips without DATABASE_URL
python -m ruff check .
```

The workflow `.github/workflows/api.yml` supplies a PostgreSQL service container,
so the round trip runs in CI.

## Assumptions

- Bus voltage bases come from `bus.vbase`, then from transformer `vhigh`/`vlow`;
  anything still missing is assumed 1 kV and reported in the study log.
- Losses, flows and voltages are pandapower results; per-unit conversions happen
  once in `adapter.py` and are logged, not silently applied.
- Ampacity in the seed dataset is indicative. Sizing decisions require the
  installation-specific value.
