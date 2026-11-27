# Power System Analysis Tool (PSA) Development Roadmap

Living plan of record for the workbench. Baseline: **v1.8.1** (package version) · Last reviewed: **2026-11-26**.

This document answers three questions:

1. What is trustworthy today, and what is only a screen calculation?
2. What should be built next, in what order, and why?
3. How do we know a milestone is finished?

Priorities are `P0` (blocks trust or release), `P1` (next major capability), `P2` (quality and
workflow), and `P3` (scale and ecosystem). Effort is `S` (≤ 2 days), `M` (≈ 1 week), `L`
(2–4 weeks), `XL` (4+ weeks) for one engineer familiar with the codebase.

## 1. Product direction

The tool should be a **browser-native screening workbench** that is honest about its assumptions:
engineering units in the model, per-unit internally, deterministic solvers, and visible notes
whenever a result depends on an assumed value.

Three principles drive the sequencing:

- **Model first.** A study is only as good as the data it reads. Sequence impedances,
  generator dynamics and load behaviour matter more than another chart.
- **Surface before build.** The repository already contains engines that the UI never exposes
  (security-constrained OPF, unit commitment, voltage-collapse indices, critical clearing
  time, a second editor hook library). Wiring and validating them is cheaper than writing new
  engines.
- **No silent numbers.** Every assumption (Z0 = 0.5 Z1, Xd″ = 0.05 p.u., heuristic inertia)
  must be visible in the study log, report and validation panel until it is replaced by real
  data.
- **Client first, server optional.** The browser workbench and its TypeScript engines stay the
  default and the offline path. A FastAPI/pandapower tier adds scale, batch automation and a
  shared equipment library without becoming a prerequisite for using the tool.

## 1.1 Platform stack (decided 2026-11-26)

The server tier is no longer hypothetical. The stack is chosen and a first vertical slice is in
the repository. The decision:

| Layer | Choice | Why this and not the alternative |
|-------|--------|----------------------------------|
| API | FastAPI + Pydantic v2 | The model in `src/types/index.ts` maps to Pydantic without an adapter; Pydantic generates OpenAPI, which becomes the contract of record |
| Math | numpy + scipy | Sparse linear algebra, root finding and benchmarks that the dense TypeScript solvers do not have |
| Solver | pandapower first, PYPOWER as an independent cross-check | pandapower already covers AC/DC power flow, IEC 60909 faults and state estimation; PYPOWER stays available to validate a result without trusting a single library |
| Data | PostgreSQL 17 as the system of record for the equipment library | Shared, versioned, queryable; SQLite is the zero-configuration fallback for tests and local runs |
| Contract | camelCase JSON, versioned by `CONTRACT_VERSION` | A project file loads into both implementations unchanged; the client can consume a `StudyRun` without translation |
| Delivery | Container profile `server` in `docker-compose.yml` | The GitHub Pages static export and the offline workbench are untouched |

Where the stack does not apply, and must not be made to apply:

- **GitHub Pages.** It is a static export and cannot host an API or a database. Server mode is a
  separate deployment, not a change to the public site.
- **Interactive studies by default.** The client engines remain authoritative for the editor. The
  service is selected per deployment or per study, never silently.
- **Project storage.** Projects stay local files. Server-side project storage, authentication and
  multi-tenant catalogue editing are out of scope (see section 9).

Decided sequencing: freeze the contract and golden fixtures first (M-08 and PL-01), then the
power-flow adapter with a parity test (PL-03), then the equipment library (PL-04), and only then
client integration (PL-05). Scale work (PL-07, PL-08) follows the benchmark work in M4.

Implemented in this review, as evidence that the stack fits the model:

- `services/api` runs power flow for Newton-Raphson, fast-decoupled, Gauss-Seidel and DC through
  pandapower, with unit, contract, HTTP and PostgreSQL-dialect tests.
- On the IEEE 9-bus case, bus voltages, angles, branch flows, reactive generation and losses match
  the TypeScript engine to machine precision (`tests/test_parity.py`).
- The equipment library ships a versioned dataset (`2026.11`) of IEC 60228/60502 cable sizes and
  the IEC/IEEE inverse-time constants used by `src/lib/protection.ts`.
- `docker compose --profile server up` starts PostgreSQL and the API; the default profile still
  starts only the web app.

## 2. Baseline scorecard

| Gate | Command | Current result |
|------|---------|----------------|
| Unit and component tests | `npm run test:run` | 307 passed, 2 skipped, 22 files |
| Server tier tests | `cd services/api && python -m pytest` | 61 passed, 1 skipped (PostgreSQL round trip) |
| Server tier lint | `cd services/api && python -m ruff check .` | Pass |
| Coverage | `npm run test:coverage` | 69.97 % statements, 53.52 % branches, 67.19 % functions, 70.96 % lines |
| Lint | `npm run lint` | Pass |
| Type check | `tsc --noEmit` (CI) / `next build` | Pass |
| Production build | `npm run build` | Pass, static `/` route, Next.js 16 |
| End-to-end | `npx playwright test` | 33 Chromium specs, including mobile viewports |
| Dependency install | `npm install` | Pass, but Node 24 emits `EBADENGINE` for `semantic-release` (requires ≥ 26.13) |

### Roadmap progress

Status values used in the milestone tables:

- ✅ **Done** — shipped and verifiable in the repository.
- 🟡 **Partial** — some code or tests exist, but the acceptance criteria are not met.
- ⬜ **Planned** — not started.
- ⛔ **Blocked** — cannot start until a dependency is finished.

Snapshot at this review (53 tracked items):

| Milestone | Done | Partial | Planned | Started |
|-----------|------|---------|---------|---------|
| M0 — Trust the baseline | 0 | 2 | 7 | 22 % |
| M1 — Model fidelity | 0 | 2 | 7 | 22 % |
| M2 — Study breadth | 0 | 0 | 10 | 0 % |
| M3 — Workbench ergonomics | 0 | 3 | 4 | 43 % |
| M4 — Scale and interoperability | 0 | 1 | 7 | 13 % |
| M5 — Server platform and library | 0 | 4 | 5 + 1 blocked | 40 % |
| **Total** | **0** | **12** | **40** | **23 %** |

The package version is 1.8.1 while the M0 and M1 gates are still open. The release themes in
section 6 are targets, not a record of what shipped.

Implemented today: one-line editor, full component catalog, load flow (NR, fast-decoupled, DC,
Gauss-Seidel), continuation power flow, OPF, short circuit, small-signal stability, time-domain
simulation, five specialty calculators, CSV/HTML/CSV/JSON reporting, project save/open and
settings persistence. An optional server tier runs power flow through pandapower and serves a
versioned cable and relay library from PostgreSQL.

### Delivered since the previous review

- Server tier vertical slice: `services/api` (FastAPI, Pydantic v2, pandapower) with power flow,
  health, catalogue endpoints, a `StudyRun` contract mirror, 61 tests, a container image, an API
  workflow with a PostgreSQL service, and a `server` compose profile.
- Contract parity on IEEE 9: service and client agree to machine precision on bus voltages,
  angles, branch flows, reactive generation and losses; the reference is committed as
  `services/api/tests/fixtures/ieee9-client-nr.json`.
- Equipment library dataset `2026.11`: IEC 60228/60502 cable sizes, IEC 60255-151 and
  IEEE C37.112 curve constants (A, B, p form, very inverse corrected to p = 2), generic relay
  records and dataset versioning.
- `BusResult.angle` is now documented as degrees in `src/types/index.ts`; both implementations
  emit degrees while the model `Bus.angle` stays radians.
- Deterministic large-grid samples: `src/lib/large-samples.ts` builds ten-level networks from 220 V
  to 500 kV with every catalog component, at exactly 1,000 and 2,000 elements. Both converge in a
  load flow (4 and 8 iterations, 0.95-1.04 p.u.) and the 2,000-element sample loads and repaints in
  the browser in about 0.3 s, giving P-02 and P-04 a reproducible stress fixture.
- Free placement: buses and non-branch generic components can be dragged anywhere on the diagram;
  holding Alt bypasses grid snap.
- Palette drag-and-drop is explicit: the canvas shows a drop target, devices dropped away from a
  bus create a new bus at the drop point, and bus-attached components stay free when no bus is near.
- Topology-aware auto-arrange lays buses out by BFS depth from the slack bus and keeps attached
  components beside their bus.
- Moves are grouped by drag gesture (`beginMove`/`endMove`), so pauses do not split a drag and quick
  separate drags remain separate undo steps. The property panel tracks canvas drags live.
- Fixed a StrictMode bug where the first move of a drag could be lost from the undo history.
- Palette and diagram share the same IEC symbol renderer. Catalog symbols are stored on model
  elements, so wind, PV, battery, motor and transformer choices appear on the canvas as they do in
  the palette.
- Documentation set: user guide, architecture, numerical methods, deployment guide, screenshots,
  contributing, security, code of conduct, issue forms and a pull-request template.
- MIT `LICENSE` with third-party GPL notices, `typecheck`/`verify` scripts and a package-derived
  version string.
- Project files now save as `.psa` (JSON content); legacy `.json` files still open.
- Home → Close returns to an empty workspace, and new/open/close prompt before discarding
  unsaved changes.
- CAD-style workspace selection: Ctrl+A, Ctrl/Shift click, window/crossing marquee, group move and
  group delete.
- The app is branded as **Power System Analysis Tool** and the ribbon tabs are the only workspace
  navigation; the titlebar keeps the quick actions and the project name.
- GitHub Pages static export deployed at <https://ashcoft.github.io/psa-tool/>.
- GHCR publishing workflow and a published `ghcr.io/ashcoft/psa-tool:1.3.0` image.
- The left component pane, right property pane and toolbar are independently collapsible from the
  pane headers, the View ribbon group or `Ctrl+B` / `Ctrl+Shift+B` / `Ctrl+Shift+T`.
  The toolbar collapses to a thin strip like the output bar.
- The component palette uses compact, ETAP-style category colours, shows no text labels and exposes
  each component name and description as a tooltip.

## 3. Gap analysis

### 3.1 Engineering model (highest risk)

| Gap | Evidence | Consequence |
|-----|----------|-------------|
| No zero-sequence data | `src/lib/fault.ts` uses `Z0 = 0.5 Z1` | Unbalanced fault currents are indicative only |
| No generator subtransient data | `src/lib/fault.ts` assumes `Xd″ = 0.05 p.u.` | Fault MVA and breaker ratings can be materially wrong |
| Classical dynamics only | `src/lib/stability.ts`, `src/lib/timeseries.ts`; inertia derived from `pmax` | No exciter, governor, PSS or load dynamics; damping is heuristic |
| Load models stored but ignored | `demandModel` exists in types, project file and property grid; no solver reads it | ZIP/constant-current studies silently behave as constant power |
| Piecewise costs not wired | `src/lib/studies.ts` maps every generator to a polynomial cost | OPF ignores `GeneratorCost.piecewise` |
| OPF is economic dispatch | `src/lib/opf.ts` verifies voltage/branch limits after dispatch | Overloads are reported, not avoided |
| Three-winding transformers are generic | `src/lib/component-catalog.ts` (`three-winding-transformer`) | No star-equivalent model, no per-winding ratings |
| DC and control components are visual only | Generic components are persisted and drawn, not solved | The catalog overstates simulation coverage |
| Islanding is not validated | `prepareNetwork` only marks buses with no branch | Radial outages can produce singular systems instead of a clear "islanded" verdict |

### 3.2 Latent engines that are not exposed

| Engine | Location | Status |
|--------|----------|--------|
| Security-constrained OPF | `solveSecurityConstrainedOPF` in `src/lib/opf.ts` | Tested, no UI or `StudyRun` |
| Unit commitment (24 h) | `solveUnitCommitment` in `src/lib/opf.ts` | Tested, no UI |
| Voltage collapse and L-index | `analyzeVoltageCollapse`, `calculateLIndex` in `src/lib/cpf.ts` | Tested, not reported |
| Critical clearing time | `calculateCriticalClearingTime` in `src/lib/timeseries.ts` | Tested, not reported |
| Time-domain contingency batch | `runContingencyStudy` in `src/lib/timeseries.ts` | Tested, no UI |
| Alternative editor hooks | `src/lib/editor-hooks.ts` (530 lines) | Dead code, no imports |
| Legacy power-flow solver | `src/lib/powerflow.ts` | Used only by its own test |

This is the cheapest source of new capability in the repository, but each engine needs the same
integration work: a `StudyRun` variant, tables, chart, report section, export and tests.

### 3.3 Workbench UX

- Multi-select, marquee and group move/delete are implemented; alignment and distribution are not.
- No autosave, crash recovery or recent projects. A `beforeunload` guard exists, but only
  settings persist.
- `theme` is a dead setting: `light`/`dark` is stored but no component consumes it.
- Specialty calculators keep results in local dialog state, so they never reach study history,
  reports or CSV export.
- Results dialog shows one run; no comparison or delta view.
- Reports export HTML/CSV/JSON, not PDF; `generateReport` does not consume `timeSeries` directly.
- Dialogs have `role="dialog"` but no focus trap, initial focus or focus restoration.
- Canvas has no keyboard navigation or accessible description of the diagram.

### 3.4 Performance and scale

- Dense `O(n³)` linear solves with no sparsity and no Web Worker; the main thread blocks.
- Canvas redraws the full diagram; no viewport culling or level of detail.
- Results tables render every row; no virtualization.
- No benchmark suite beyond the 14-bus IEEE sample; no bundle-size budget.

### 3.5 Quality and operations

- Coverage is 69.97 % statements and 53.52 % branches, with the largest gaps in `useProject.ts`,
  `reports.ts`, `symbols/*` and `results-export.ts`.
- Two skipped tests: Gauss-Seidel finite results and canvas symbol rendering.
- E2E is Chromium-only; no visual regression, no accessibility assertions, no Firefox/WebKit.
- No coverage thresholds in `vitest.config.ts`.
- `package.json` has no `engines`; `.nvmrc` is 26 but the CI test matrix includes 24 and 25, and
  `semantic-release` requires Node ≥ 26.13.
- `.gitignore` ignores `package-lock.json` even though it is tracked, which invites accidental
  lockfile drift.
- No React error boundary or global error screen; an engine exception can blank the workbench.

### 3.6 Server tier and library data

| Gap | Evidence | Consequence |
|-----|----------|-------------|
| The contract is maintained twice | `src/types/index.ts` and `services/api/psa_api/contract.py` are separate files | A field added on one side silently disappears from the other until a parity test fails |
| Only power flow is served | `services/api/psa_api/studies.py`; fault, CPF, OPF, stability and time domain exist only in `src/lib` | The API covers one of six `StudyKind` values |
| Catalogue rows are screening values in code | `services/api/psa_api/seed.py` | No migrations, no write path, no CT/breaker/fuse tables, no vendor data, no provenance beyond the dataset row |
| No client integration | Nothing in `src/` calls `/v1`; no cable or relay picker consumes the catalogue | The library is reachable by API only |
| No authentication or authorisation | `services/api/psa_api/main.py` has open endpoints | Server mode is only safe behind a private network |
| Result definitions differ in two places | Line `loading` uses the worse end server-side, the sending end client-side; slack `pg` is solved server-side, scheduled client-side | Comparisons need a documented tolerance and a note in the study log |
| No scale evidence | Tests cover IEEE 9 and a 2-bus analytic case only | Nothing yet justifies server-side solving for large networks |
| Schema is created at startup | `Catalog.ensure_schema` calls `metadata.create_all` | No versioned migrations, no rollback path, no backup runbook |

## 4. Milestones

```text
M0 Trust the baseline ──► M1 Model fidelity ──► M2 Study breadth ──► M3 Ergonomics ──► M4 Scale & IO
                               │                       │                                   │
                               └── golden cases ───────┘                                   ▼
                                                                              M5 Server platform & library
```

### M0 — Trust the baseline (1–2 weeks) · 0 done / 2 partial / 7 planned

Goal: every published claim is backed by the repository, and the quality gates cannot silently
regress.

Exit criteria: `LICENSE` present; `npm run verify` exists and passes; coverage thresholds
enforced; zero skipped tests; no dead solver modules; release tooling runs on the declared Node
version.

`LICENSE` and the `typecheck`/`verify` scripts are already delivered; the remaining items are:

| ID | Item | Effort | Status | Evidence |
|----|------|--------|--------|----------|
| Q-02 | Add `engines` and align the CI test matrix on Node 26; document the release requirement | S | ⬜ Planned | `package.json` has no `engines`; `.nvmrc` is 26. |
| Q-04 | Add coverage thresholds (start at 68 % statements / 51 % branches) and ratchet them each milestone | S | ⬜ Planned | `vitest.config.ts` has no coverage thresholds. |
| Q-05 | Remove `src/lib/editor-hooks.ts` and `src/lib/powerflow.ts`, or mark and test them as supported APIs | S | ⬜ Planned | `editor-hooks.ts` and `powerflow.ts` are still present. |
| Q-06 | Fix Gauss-Seidel convergence or disable the method with an explicit warning; unskip the test | M | ⬜ Planned | Gauss-Seidel test is still `it.skip`. |
| Q-07 | Add a canvas context stub and unskip symbol rendering tests | S | ⬜ Planned | Symbol canvas test is still `it.skip`. |
| Q-08 | Add `app/error.tsx` and an error boundary around dialogs and canvas | S | ⬜ Planned | No `src/app/error.tsx` or error boundary. |
| Q-09 | Remove `package-lock.json` from `.gitignore`; verify `npm ci` reproducibility | S | ⬜ Planned | `package-lock.json` is still in `.gitignore`. |
| Q-10 | Extend `useProject` tests to dirty state, clipboard and element editing; add settings migration tests | M | 🟡 Partial | 9 placement/drag tests; dirty state, clipboard, editing and settings migration untested. |
| Q-11 | Add E2E coverage for every specialty tab, validation dialog, property edits and delete/undo | M | 🟡 Partial | 29 Chromium specs; specialty tabs, validation and property edits not covered end to end. |

### M1 — Model fidelity (4–6 weeks) · 0 done / 2 partial / 7 planned

Goal: studies read real network and machine data instead of assumed constants.

Exit criteria: sequence and dynamic fields round-trip through save/open; unbalanced faults use
real Z2/Z0; load models affect results; IEEE 9/14 results match reference values within a stated
tolerance.

| ID | Item | Effort | Status | Evidence |
|----|------|--------|--------|----------|
| M-01 | Project schema v2: generator sequence and dynamic data (`Xd″`, `X2`, `X0`, `H`, `D`, `Xd′`, `Tdo′`), transformer zero-sequence and vector group, line zero-sequence | L | ⬜ Planned | Generator, transformer and line types carry no sequence or dynamic fields. |
| M-02 | Migration and validation for v1 files; keep opening old projects lossless | M | ⬜ Planned | No project schema migration beyond version checks. |
| M-03 | Short circuit uses real sequence data with explicit fallback flags when fields are empty | L | ⬜ Planned | `fault.ts` still uses `Z0 = 0.5 Z1` and `Xd″ = 0.05 p.u.`. |
| M-04 | Implement ZIP, constant-current and constant-impedance loads in NR, fast-decoupled and CPF | M | ⬜ Planned | `demandModel` is stored but no solver reads it. |
| M-05 | Wire piecewise generator costs into OPF and surface cost curves in the UI | S | 🟡 Partial | `opf.ts` evaluates piecewise costs; `studies.ts` still maps every generator to polynomial. |
| M-06 | Three-winding transformer star-equivalent model with per-winding ratings | L | ⬜ Planned | Three-winding transformer is a diagram-only generic component. |
| M-07 | Connectivity and island validation shared by validation, load flow and contingency | M | ⬜ Planned | Validation only flags buses without a branch; no shared island analysis. |
| M-08 | Golden-case regression tests for IEEE 9/14 against committed client results and PSAT reference values | M | 🟡 Partial | IEEE 9 client fixture exists in `services/api/tests/fixtures/ieee9-client-nr.json`; no IEEE 14 fixture and no PSAT reference values. |
| M-09 | Generator capability limits reported consistently in load flow and OPF | M | ⬜ Planned | Capability limits are not reported consistently by load flow and OPF. |

### M2 — Study breadth (6–8 weeks) · 0 done / 0 partial / 10 planned

Goal: close the most requested ETAP/PSAT study gaps, preferring existing engines.

Exit criteria: each study is a `StudyRun`, appears in history, has tables, a chart where useful,
CSV and report sections, and unit plus E2E tests.

| ID | Item | Effort | Status | Evidence |
|----|------|--------|--------|----------|
| S-01 | **N-1 contingency study**: branch and generator outages, island detection, overload/voltage violations, severity ranking | L | ⬜ Planned | No N-1 contingency engine or UI. |
| S-02 | Surface security-constrained OPF as a redispatch study (not just a violation list) | M | ⬜ Planned | `solveSecurityConstrainedOPF` is tested but not exposed. |
| S-03 | Surface unit commitment with a 24 h schedule chart and cost table | M | ⬜ Planned | `solveUnitCommitment` is tested but not exposed. |
| S-04 | Add voltage-collapse margin and L-index to the CPF report | S | ⬜ Planned | `analyzeVoltageCollapse` and `calculateLIndex` are not in the CPF report. |
| S-05 | Add critical clearing time to time-domain results | S | ⬜ Planned | `calculateCriticalClearingTime` is not in time-domain results. |
| S-06 | State estimation (WLS) with a measurement model and bad-data screening | XL | ⬜ Planned | No state-estimation engine. |
| S-07 | Quasi-steady-state / long-term simulation for load restoration and tap-changer sequences | XL | ⬜ Planned | No quasi-steady-state simulation. |
| S-08 | Harmonic frequency scan and IEEE 519 compliance curves | M | ⬜ Planned | `analyzeHarmonics` reports spectra but has no frequency scan or IEEE 519 curves. |
| S-09 | Cable and transformer sizing/ampacity screening | M | ⬜ Planned | No sizing screen; cable R/X and ampacity rows now exist in the catalogue (PL-04) and need the UI (PL-05). |
| S-10 | Move specialty calculators into `StudyRun` so their results are exportable and comparable | M | ⬜ Planned | Specialty calculators still keep results in dialog-local state. |

### M3 — Workbench ergonomics (3–4 weeks) · 0 done / 3 partial / 4 planned

Goal: make the editor comfortable for real projects and long sessions.

Exit criteria: multi-select works end to end; autosave restores after a reload; keyboard-only
users can operate dialogs and the canvas; reports can be delivered as PDF.

| ID | Item | Effort | Status | Evidence |
|----|------|--------|--------|----------|
| U-01 | Align and distribute commands for multi-selection | M | ⬜ Planned | Multi-select and group move exist; align and distribute do not. |
| U-02 | Autosave to IndexedDB/localStorage, crash recovery prompt, recent projects, `beforeunload` guard | M | 🟡 Partial | `beforeunload` guard is implemented; autosave, recovery and recent projects are not. |
| U-03 | Real light/dark theme driven by `settings.theme`, including canvas colours | M | ⬜ Planned | `settings.theme` is stored but no component consumes it. |
| U-04 | Results comparison: select two runs and diff bus voltages, loadings and losses | M | ⬜ Planned | Results dialog shows one run; no comparison view. |
| U-05 | PDF report export and a print stylesheet; include time-series and specialty sections | M | ⬜ Planned | Reports export HTML/CSV/JSON only; no PDF or print stylesheet. |
| U-06 | Accessibility: focus trap, initial focus, `aria-live` study status, canvas keyboard navigation, contrast audit | M | 🟡 Partial | Dialogs use `role="dialog"`; no focus trap, initial focus, `aria-live` or canvas keyboard navigation. |
| U-07 | Command palette and a complete, discoverable shortcut map | S | 🟡 Partial | Shortcut dialog exists; no command palette and the shortcut map is incomplete. |

### M4 — Scale and interoperability (8+ weeks) · 0 done / 1 partial / 7 planned

Goal: handle networks and workflows beyond a single demo session.

Exit criteria: 500-bus load flow completes in a worker under the agreed budget; large diagrams
stay interactive; projects can move between Power System Analysis Tool and other tools.

| ID | Item | Effort | Status | Evidence |
|----|------|--------|--------|----------|
| P-01 | Sparse Y-bus and sparse linear solve; move studies to a Web Worker with progress and cancel | XL | ⬜ Planned | Dense `O(n³)` solves on the main thread. |
| P-02 | Canvas viewport culling, level of detail and batched rendering | L | ⬜ Planned | Canvas redraws the full diagram; the 2,000-element sample is the stress fixture. |
| P-03 | Virtualized result tables and charts for large series | M | ⬜ Planned | Result tables render every row. |
| P-04 | Benchmark suite for 100/500/1000 buses with CI budgets | M | ⬜ Planned | No benchmark suite or CI budgets; deterministic 1,000/2,000-element fixtures now exist for it. |
| P-05 | Import PSAT `.m`, MATPOWER and PTI RAW; export MATPOWER | XL | ⬜ Planned | No MATPOWER, PSAT or PTI RAW import. |
| P-06 | Batch/CLI or server-side study runner for automation | L | ⬜ Planned | No batch or server-side runner; delivery path is PL-08. |
| P-07 | Optional error reporting, structured study logs and performance telemetry (opt-in) | M | ⬜ Planned | No structured study logs or opt-in telemetry. |
| P-08 | CSP headers, dependency audit, SBOM and a documented security policy | M | 🟡 Partial | `SECURITY.md` exists; no CSP headers, SBOM or dependency audit gate. |

### M5 — Server platform and library (6–8 weeks) · 0 done / 4 partial / 5 planned / 1 blocked

Goal: make the FastAPI + pandapower + PostgreSQL tier a supported, tested part of the product,
with the equipment library as its first user-facing feature.

Exit criteria: the contract is generated and checked, not hand-maintained; every served
`StudyKind` reproduces the client result on the committed golden fixtures or documents the
difference; the workbench can pick a cable size and a relay curve from the library and records
the dataset version in the project file; PostgreSQL is provisioned by migrations with a backup
runbook; the static export still works with no server.

| ID | Item | Effort | Status | Evidence |
|----|------|--------|--------|----------|
| PL-01 | Freeze the contract: generate JSON Schema from Pydantic, check `src/types/index.ts` against it, bump `CONTRACT_VERSION` on change | M | 🟡 Partial | `contract.py` mirrors the types and the IEEE 9 fixture is shared; no generated schema or drift check. |
| PL-02 | Harden the service skeleton: settings, CORS allow-list, structured errors, container image, CI workflow with PostgreSQL | M | 🟡 Partial | `services/api` serves health, catalogue and power flow; `.github/workflows/api.yml` runs tests with a PostgreSQL service; no rate limits, request logging or auth. |
| PL-03 | pandapower power-flow adapter with method mapping and parity gate | M | 🟡 Partial | NR, fast-decoupled, Gauss-Seidel and DC implemented; IEEE 9 parity to machine precision; fault, CPF, OPF, stability and time domain are not served. |
| PL-04 | Equipment library in PostgreSQL: cable, relay, curve tables, dataset versioning, read API | M | 🟡 Partial | Schema, seed `2026.11`, `/v1/catalog/*` endpoints and tests exist; no migrations, CT/breaker tables, write path or vendor data. |
| PL-05 | Client integration: cable and relay pickers, dataset pin in the project file, `settings.solverBackend` with client fallback, provenance in the study log | L | ⬜ Planned | No code in `src/` calls `/v1`. |
| PL-06 | Serve the short-circuit study with real sequence data (IEC 60909 via pandapower), aligned with M-01 and M-03 | L | ⬜ Planned | Fault study is client-only and still assumes `Z0 = 0.5 Z1` and `Xd″ = 0.05 p.u.`. |
| PL-07 | PYPOWER or scipy sparse cross-check and 100/500/1000-bus benchmarks; feed the budgets into P-04 | M | ⬜ Planned | Only IEEE 9 and a 2-bus analytic case are measured. |
| PL-08 | Batch and CLI runner over the API for automation and regression suites (delivers P-06) | L | ⬜ Planned | No CLI, queue or job endpoint. |
| PL-09 | Catalogue write path, authentication, audit trail and per-dataset permissions | L | ⛔ Blocked | Requires the decision to support multi-user catalogue editing (section 9). |
| PL-10 | Operations: versioned migrations, backup and restore, dataset promotion runbook, SBOM, health probes | M | ⬜ Planned | Schema is created with `metadata.create_all` at startup; no migrations or backups. |

Dependencies inside M5: PL-05 needs PL-01 and PL-04; PL-08 needs PL-03; PL-09 needs an explicit
scope decision; PL-10 is required before any shared deployment.

## 5. Prioritized backlog (next 24 items)

| Rank | ID | Item | Why now | Effort | Status |
|------|----|------|---------|--------|--------|
| 1 | Q-02 | Node/engine alignment | Release and CI run on different Node versions today | S | ⬜ Planned |
| 2 | Q-05 | Remove dead solver and editor hooks | 1 000+ lines of untested, misleading code | S | ⬜ Planned |
| 3 | Q-06 | Resolve Gauss-Seidel | A shipped method can return NaN client-side and needs a large budget server-side | M | ⬜ Planned |
| 4 | Q-10 | Test `useProject` | Core editing state is the least covered module | M | 🟡 Partial |
| 5 | Q-08 | Error boundary | An engine exception can blank the app | S | ⬜ Planned |
| 6 | M-08 | Golden-case regression tests for IEEE 9/14 | Every server and client comparison depends on it | M | 🟡 Partial |
| 7 | PL-01 | Freeze the contract and generate its schema | Stops the two type files from drifting | M | 🟡 Partial |
| 8 | PL-03 | Power-flow parity gate for the adapter | Turns "pandapower fits" into a checked claim | M | 🟡 Partial |
| 9 | PL-04 | Library schema and read API | The first server feature users can see | M | 🟡 Partial |
| 10 | PL-05 | Client integration for cable and relay data | The library is otherwise API-only | L | ⬜ Planned |
| 11 | M-01 | Schema v2 sequence/dynamic data | Prerequisite for trustworthy faults and dynamics | L | ⬜ Planned |
| 12 | M-03 | Real sequence-data faults | Removes the two biggest hidden assumptions | L | ⬜ Planned |
| 13 | PL-06 | Serve the short-circuit study | Server fault study is limited by M-01 and M-03 | L | ⬜ Planned |
| 14 | M-04 | Load models | Makes an advertised property real | M | ⬜ Planned |
| 15 | M-07 | Shared island validation | Prevents singular systems and false results | M | ⬜ Planned |
| 16 | S-01 | N-1 contingency study | Highest-value missing ETAP study | L | ⬜ Planned |
| 17 | S-02 | Surface SC-OPF | Engine already exists | M | ⬜ Planned |
| 18 | S-03 | Surface unit commitment | Engine already exists | M | ⬜ Planned |
| 19 | S-04 | Voltage-collapse margin in CPF | Engine already exists | S | ⬜ Planned |
| 20 | S-05 | Critical clearing time | Engine already exists | S | ⬜ Planned |
| 21 | S-10 | Specialty results as `StudyRun` | Unifies history, export and reports | M | ⬜ Planned |
| 22 | U-02 | Autosave and recovery | Prevents data loss in long sessions | M | 🟡 Partial |
| 23 | P-01 | Worker and sparse solve | Required for realistic network sizes | XL | ⬜ Planned |
| 24 | I-01 | MATPOWER/PSAT import | Removes manual re-entry as the main adoption barrier | XL | ⬜ Planned |

## 6. Proposed release sequence

Versions are proposals; `semantic-release` still decides the actual bump from commit types.

| Release | Theme | Representative scope | Gate |
|---------|-------|----------------------|------|
| v1.2.x | Baseline fixes | Q-02…Q-09 | `verify` green, zero skips |
| v1.3.0 | Trusted results | M-01…M-04, M-07, S-04, S-05 | Schema v2 migration, golden IEEE cases |
| v1.4.0 | Study breadth | S-01…S-03, S-08…S-10 | Each study exported and E2E tested |
| v1.5.0 | Workbench | U-01…U-07 | Keyboard-only and recovery tests |
| v2.0.0 | Scale and IO | P-01…P-08 (P-06 via PL-08) | Benchmarks and import/export acceptance |
| v2.1.0 | Server tier and equipment library | PL-01…PL-04, PL-05, PL-07, PL-10 | Contract generated and checked, parity green, library pickers used by the workbench, migrations and backup runbook |
| v2.2.0 | Server study breadth | PL-06, PL-08 | Fault study served with real sequence data; batch runner shipped |

## 7. Quality gates

Every milestone must keep these true:

- `npm run verify` passes on Node 26.
- No skipped tests. If a numerical method is known to fail, it is disabled in the UI with an
  explicit message, not silently skipped.
- Every new study has: engine unit tests, `StudyRun` variant, table export, report section, a
  chart when the data is visual, and at least one E2E path.
- Coverage never decreases; target 75 % statements and 65 % branches by v1.4.0.
- Any assumed value used by a solver appears in the study log and in `AGENTS.md` under
  "Numerical assumptions".
- A 500-bus load flow completes within 2 s in a worker by v2.0.0; UI interactions stay responsive
  during a study.
- `cd services/api && python -m ruff check . && python -m pytest` passes, including the
  PostgreSQL round trip when `DATABASE_URL` is set.
- The Pydantic contract and `src/types/index.ts` change in the same pull request, and
  `CONTRACT_VERSION` moves when a field is added, removed or redefined.
- Any `StudyKind` served over HTTP reproduces the committed client fixture within the stated
  tolerance, or the difference is documented in `services/api/README.md` and in the study log.
- Catalogue rows carry a dataset version and a provenance note; a project records the dataset
  version it was solved against.
- The static export (`npm run build:pages`) still builds and runs with no API and no database.

## 8. Risks and mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Model fidelity work expands indefinitely | Delays every study | Time-box M1; ship schema v2 plus faults first, defer full dynamic models |
| Existing latent engines are subtly wrong | New studies inherit bugs | Treat them as untrusted until covered by golden cases and UI tests |
| Dense solvers hit a wall | Large projects unusable | Benchmark early, add worker before sparse solver if UI blocking is the first pain |
| Canvas rewrite destabilizes editing | Regressions in the core workflow | Keep the current Canvas API; add multi-select behind incremental tests |
| Catalog promises more than the solvers deliver | User trust | Label generic components as "diagram-only" in the palette and property panel |
| Solo-maintainer bandwidth | Roadmap stalls | Keep changes small, one study per release, automate release notes and coverage |
| Import formats are inconsistent | Import effort balloons | Start with MATPOWER and PSAT `.m`; defer CIM until the model supports it |
| Two numerical implementations drift | Client and service disagree, users lose trust | Golden fixtures with a parity gate (M-08, PL-03); contract changes land together; document differences |
| Server mode erodes the offline promise | Static users lose features or the build breaks | Server features are opt-in with a client fallback; `build:pages` is a release gate |
| Server operations exceed maintainer bandwidth | Deployments rot, data is lost | Container profile, one database, migrations and a backup runbook before any shared deployment; no auth or multi-tenant work until scoped |
| Catalogue data is unlicensed or wrong | Legal exposure and bad sizing advice | Ship standards constants and marked screening values only; require provenance and permission for vendor data |
| Postgres is unavailable on the public deployment | Confusion about what GitHub Pages can do | Document the two deployment modes; never add server calls to the default client path |
| Server-side solver choice hides assumptions | Users cannot tell which engine ran | Study log records engine, version, method mapping and dataset version |

## 9. Non-goals for the next two releases

- Electromagnetic transient (EMT) simulation or real-time/HIL.
- Full IEEE 1584-2018 arc-flash modelling (requires electrode and enclosure data).
- Authentication, multi-tenant catalogue editing (PL-09) and server-side project storage. Server
  mode is read-only equipment data plus studies, assumed to run behind a trusted network until
  PL-09 is scoped.
- Running the workbench itself server-side or replacing the TypeScript engines; the server tier is
  additive and optional.
- Market clearing, ancillary-service optimisation or production-cost modelling beyond the
  existing unit-commitment engine.
- GIS or geographic one-line diagrams.

## 10. First sprint (ordered)

1. Add `LICENSE`, `engines`, `.nvmrc` alignment and `typecheck`/`verify` scripts.
2. Delete `src/lib/editor-hooks.ts` and `src/lib/powerflow.ts`; update coverage.
3. Add `useProject` hook tests and settings migration tests.
4. Decide Gauss-Seidel: repair convergence or gate it in the UI; remove the skip.
5. Add a canvas context stub and unskip symbol rendering.
6. Add an error boundary and a friendly study-failure screen.
7. Add coverage thresholds at the current floor and a ratchet note.
8. Write the N-1 contingency design note (types, island detection, reuse of `solveNewtonRaphson`).
9. Implement `src/lib/contingency.ts` with unit tests on the demo and IEEE 9-bus systems.
10. Integrate N-1 into `studies.ts`, `results-export.ts`, `ResultsDialog` and the Analysis ribbon.
11. Generate the JSON Schema from `services/api/psa_api/contract.py` and add a drift check against
    `src/types/index.ts`; commit it next to the IEEE 9 fixture.
12. Add the IEEE 14-bus fixture to the parity suite, so M-08 and the server gate share one source.
13. Publish a second catalogue dataset with CT/breaker tables, and pin a dataset version in the
    project file.

## 11. Keeping this document current

- Update the baseline scorecard when a release is tagged.
- Move completed items into the release table and remove them from the backlog.
- Add newly discovered debt with an ID rather than a prose note.
- Record every new solver assumption in `AGENTS.md` in the same pull request.
- Record catalogue data provenance in `services/catalog/README.md` when rows are added.
- Review the roadmap at the start of each milestone and after any incident.
