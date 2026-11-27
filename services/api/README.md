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
pip install -r requirements-dev.txt   # resolves requirements.lock
uvicorn psa_api.main:app --reload --port 8000
```

`POSTGRES_PASSWORD` is required by the `server` profile; compose passes it through and the API
refuses to start without it, and the repository stores no default. Without any database setting the
service seeds an in-memory SQLite catalogue, so the API is usable with no database. Point it at
PostgreSQL for a durable library:

```bash
export POSTGRES_HOST=localhost POSTGRES_USER=psa POSTGRES_DB=psa
export POSTGRES_PASSWORD='change-me'   # never committed; URL-escaped by SQLAlchemy
```

`DATABASE_URL` still works and takes precedence. When `POSTGRES_HOST` is set the service builds the
SQLAlchemy URL with `URL.create`, so passwords containing `@`, `:`, `/` or `%` connect correctly.

Or start the whole server mode:

```bash
POSTGRES_PASSWORD=change-me docker compose --profile server up --build
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
  is radians; the adapter converts the slack angle with `math.degrees`).
- Transformer taps are applied through pandapower's `Ratio` tap changer, because
  `tap_ratio` is not used by the solver.
- Generator reactive limits are enforced (`enforce_q_lims=True`); a unit at its
  limit reports `at limit` and its bus becomes PQ.
- DC studies report zero reactive quantities (pandapower leaves them unset
  instead of zero).
- Shunt reactive power is the solved value, scaled by the square of the bus
  voltage.
- Out-of-service and isolated buses report zero voltage, angle and injection,
  and a study-log message.
- A failed study reports `maxMismatch: null`; NaN would break JSON. The client
  keeps `Number.NaN` in memory but never serializes it.
- Line `loading` uses the worse of the two ends. The client divides only the
  sending-end apparent power by the rating, which understates charging-heavy
  lines. On IEEE 9 bus 6-9 the client reports 7.2 % and the service 16.4 %.
- Generator results are per element from the solver, so the slack unit reports
  its solved `pg` (68.1 MW) rather than the scheduled value (71.6 MW) that the
  client echoes back.

## Tests

```bash
cd services/api
python -m pytest        # 61 tests; the PostgreSQL round trip skips without PSA_TEST_DATABASE_URL
python -m ruff check .
```

`requirements.txt` pins the direct dependencies. `requirements.lock` and
`requirements-dev.lock` are hash-pinned full resolutions (pip-compile) for Linux and CPython 3.13;
the image installs the runtime lock and CI installs the dev lock, both with
`--require-hashes --only-binary :all:`. Windows developers should install `requirements-dev.txt`,
because the lock includes `uvloop`, which has no Windows wheel. The workflow
`.github/workflows/api.yml` supplies a PostgreSQL service container, so the round trip runs in CI.

## Assumptions

- Bus voltage bases come from `bus.vbase`, then from transformer `vhigh`/`vlow`;
  anything still missing is assumed 1 kV and reported in the study log.
- Losses, flows and voltages are pandapower results; per-unit conversions happen
  once in `adapter.py` and are logged, not silently applied.
- Ampacity in the seed dataset is indicative. Sizing decisions require the
  installation-specific value.
