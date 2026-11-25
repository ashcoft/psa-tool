# Power System Analysis Tool (PSA) Development Roadmap

Living plan of record for the workbench. Baseline: **v1.2.0** · Last reviewed: **2026-11-25**.

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

## 2. Baseline scorecard

| Gate | Command | Current result |
|------|---------|----------------|
| Unit and component tests | `npm run test:run` | 269 passed, 2 skipped, 21 files |
| Coverage | `npm run test:coverage` | 64.7 % statements, 51.5 % branches, 62.1 % functions, 65.1 % lines |
| Lint | `npm run lint` | Pass |
| Type check | `tsc --noEmit` (CI) / `next build` | Pass |
| Production build | `npm run build` | Pass, static `/` route, Next.js 16.4.6 |
| End-to-end | `npx playwright test` | 22 Chromium specs, including mobile viewports |
| Dependency install | `npm install` | Pass, but Node 24 emits `EBADENGINE` for `semantic-release` (requires ≥ 26.13) |

Implemented today: one-line editor, full component catalog, load flow (NR, fast-decoupled, DC,
Gauss-Seidel), continuation power flow, OPF, short circuit, small-signal stability, time-domain
simulation, five specialty calculators, CSV/HTML/CSV/JSON reporting, project save/open and
settings persistence.

### Delivered since the previous review

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
- File → Close Project returns to an empty workspace, and new/open/close prompt before discarding
  unsaved changes.
- CAD-style workspace selection: Ctrl+A, Ctrl/Shift click, window/crossing marquee, group move and
  group delete.
- The app is branded as **Power System Analysis Tool** and the menu bar can be shown or hidden from
  the titlebar, the View ribbon group, Settings, or `Ctrl+Shift+M`.
- GitHub Pages static export deployed at <https://ashcoft.github.io/psa-tool/>.
- GHCR publishing workflow and a published `ghcr.io/ashcoft/psa-tool:1.3.0` image.

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
- No autosave, crash recovery, recent projects or `beforeunload` guard. Only settings persist.
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

- Coverage is 64.7 % overall, with the largest gaps in `useProject.ts` (34 %), `symbols/*`
  (≈ 12 %), `component-utils.ts` (38 %), `ReportDialog.tsx` (6 %) and `SettingsDialog.tsx` (31 %).
- Two skipped tests: Gauss-Seidel finite results and canvas symbol rendering.
- E2E is Chromium-only; no visual regression, no accessibility assertions, no Firefox/WebKit.
- No coverage thresholds in `vitest.config.ts`.
- `package.json` has no `engines`; `.nvmrc` is 26 but the CI test matrix includes 24 and 25, and
  `semantic-release` requires Node ≥ 26.13.
- `.gitignore` ignores `package-lock.json` even though it is tracked, which invites accidental
  lockfile drift.
- No React error boundary or global error screen; an engine exception can blank the workbench.

## 4. Milestones

```text
M0 Trust the baseline ──► M1 Model fidelity ──► M2 Study breadth ──► M3 Ergonomics ──► M4 Scale & IO
                               │                       │
                               └── golden cases ───────┘
```

### M0 — Trust the baseline (1–2 weeks)

Goal: every published claim is backed by the repository, and the quality gates cannot silently
regress.

Exit criteria: `LICENSE` present; `npm run verify` exists and passes; coverage thresholds
enforced; zero skipped tests; no dead solver modules; release tooling runs on the declared Node
version.

`LICENSE` and the `typecheck`/`verify` scripts are already delivered; the remaining items are:

| ID | Item | Effort |
|----|------|--------|
| Q-02 | Add `engines` and align the CI test matrix on Node 26; document the release requirement | S |
| Q-04 | Add coverage thresholds (start at 65 % statements / 55 % branches) and ratchet them each milestone | S |
| Q-05 | Remove `src/lib/editor-hooks.ts` and `src/lib/powerflow.ts`, or mark and test them as supported APIs | S |
| Q-06 | Fix Gauss-Seidel convergence or disable the method with an explicit warning; unskip the test | M |
| Q-07 | Add a canvas context stub and unskip symbol rendering tests | S |
| Q-08 | Add `app/error.tsx` and an error boundary around dialogs and canvas | S |
| Q-09 | Remove `package-lock.json` from `.gitignore`; verify `npm ci` reproducibility | S |
| Q-10 | Extend `useProject` tests to dirty state, clipboard and element editing; add settings migration tests | M |
| Q-11 | Add E2E coverage for every specialty tab, validation dialog, property edits and delete/undo | M |

### M1 — Model fidelity (4–6 weeks)

Goal: studies read real network and machine data instead of assumed constants.

Exit criteria: sequence and dynamic fields round-trip through save/open; unbalanced faults use
real Z2/Z0; load models affect results; IEEE 9/14 results match reference values within a stated
tolerance.

| ID | Item | Effort |
|----|------|--------|
| M-01 | Project schema v2: generator sequence and dynamic data (`Xd″`, `X2`, `X0`, `H`, `D`, `Xd′`, `Tdo′`), transformer zero-sequence and vector group, line zero-sequence | L |
| M-02 | Migration and validation for v1 files; keep opening old projects lossless | M |
| M-03 | Short circuit uses real sequence data with explicit fallback flags when fields are empty | L |
| M-04 | Implement ZIP, constant-current and constant-impedance loads in NR, fast-decoupled and CPF | M |
| M-05 | Wire piecewise generator costs into OPF and surface cost curves in the UI | S |
| M-06 | Three-winding transformer star-equivalent model with per-winding ratings | L |
| M-07 | Connectivity and island validation shared by validation, load flow and contingency | M |
| M-08 | Golden-case regression tests for IEEE 9/14 against `psat-converted` reference results | M |
| M-09 | Generator capability limits reported consistently in load flow and OPF | M |

### M2 — Study breadth (6–8 weeks)

Goal: close the most requested ETAP/PSAT study gaps, preferring existing engines.

Exit criteria: each study is a `StudyRun`, appears in history, has tables, a chart where useful,
CSV and report sections, and unit plus E2E tests.

| ID | Item | Effort |
|----|------|--------|
| S-01 | **N-1 contingency study**: branch and generator outages, island detection, overload/voltage violations, severity ranking | L |
| S-02 | Surface security-constrained OPF as a redispatch study (not just a violation list) | M |
| S-03 | Surface unit commitment with a 24 h schedule chart and cost table | M |
| S-04 | Add voltage-collapse margin and L-index to the CPF report | S |
| S-05 | Add critical clearing time to time-domain results | S |
| S-06 | State estimation (WLS) with a measurement model and bad-data screening | XL |
| S-07 | Quasi-steady-state / long-term simulation for load restoration and tap-changer sequences | XL |
| S-08 | Harmonic frequency scan and IEEE 519 compliance curves | M |
| S-09 | Cable and transformer sizing/ampacity screening | M |
| S-10 | Move specialty calculators into `StudyRun` so their results are exportable and comparable | M |

### M3 — Workbench ergonomics (3–4 weeks)

Goal: make the editor comfortable for real projects and long sessions.

Exit criteria: multi-select works end to end; autosave restores after a reload; keyboard-only
users can operate dialogs and the canvas; reports can be delivered as PDF.

| ID | Item | Effort |
|----|------|--------|
| U-01 | Align and distribute commands for multi-selection | M |
| U-02 | Autosave to IndexedDB/localStorage, crash recovery prompt, recent projects, `beforeunload` guard | M |
| U-03 | Real light/dark theme driven by `settings.theme`, including canvas colours | M |
| U-04 | Results comparison: select two runs and diff bus voltages, loadings and losses | M |
| U-05 | PDF report export and a print stylesheet; include time-series and specialty sections | M |
| U-06 | Accessibility: focus trap, initial focus, `aria-live` study status, canvas keyboard navigation, contrast audit | M |
| U-07 | Command palette and a complete, discoverable shortcut map | S |

### M4 — Scale and interoperability (8+ weeks)

Goal: handle networks and workflows beyond a single demo session.

Exit criteria: 500-bus load flow completes in a worker under the agreed budget; large diagrams
stay interactive; projects can move between Power System Analysis Tool and other tools.

| ID | Item | Effort |
|----|------|--------|
| P-01 | Sparse Y-bus and sparse linear solve; move studies to a Web Worker with progress and cancel | XL |
| P-02 | Canvas viewport culling, level of detail and batched rendering | L |
| P-03 | Virtualized result tables and charts for large series | M |
| P-04 | Benchmark suite for 100/500/1000 buses with CI budgets | M |
| P-05 | Import PSAT `.m`, MATPOWER and PTI RAW; export MATPOWER | XL |
| P-06 | Batch/CLI or server-side study runner for automation | L |
| P-07 | Optional error reporting, structured study logs and performance telemetry (opt-in) | M |
| P-08 | CSP headers, dependency audit, SBOM and a documented security policy | M |

## 5. Prioritized backlog (next 20 items)

| Rank | ID | Item | Why now | Effort |
|------|----|------|---------|--------|
| 2 | Q-02 | Node/engine alignment | Release and CI run on different Node versions today | S |
| 3 | Q-05 | Remove dead solver and editor hooks | 1 000+ lines of untested, misleading code | S |
| 4 | Q-10 | Test `useProject` | Core editing state is the least covered module | M |
| 5 | Q-06 | Resolve Gauss-Seidel | A shipped method can return NaN | M |
| 6 | Q-08 | Error boundary | An engine exception can blank the app | S |
| 7 | M-01 | Schema v2 sequence/dynamic data | Prerequisite for trustworthy faults and dynamics | L |
| 8 | M-03 | Real sequence-data faults | Removes the two biggest hidden assumptions | L |
| 9 | M-04 | Load models | Makes an advertised property real | M |
| 10 | M-07 | Shared island validation | Prevents singular systems and false results | M |
| 11 | S-01 | N-1 contingency study | Highest-value missing ETAP study | L |
| 12 | S-02 | Surface SC-OPF | Engine already exists | M |
| 13 | S-03 | Surface unit commitment | Engine already exists | M |
| 14 | S-04 | Voltage-collapse margin in CPF | Engine already exists | S |
| 15 | S-05 | Critical clearing time | Engine already exists | S |
| 16 | S-10 | Specialty results as `StudyRun` | Unifies history, export and reports | M |
| 17 | U-02 | Autosave and recovery | Prevents data loss in long sessions | M |
| 18 | U-01 | Align and distribute | Finishes the CAD-style selection workflow | M |
| 19 | P-01 | Worker and sparse solve | Required for realistic network sizes | XL |
| 20 | I-01 | MATPOWER/PSAT import | Removes manual re-entry as the main adoption barrier | XL |

## 6. Proposed release sequence

Versions are proposals; `semantic-release` still decides the actual bump from commit types.

| Release | Theme | Representative scope | Gate |
|---------|-------|----------------------|------|
| v1.2.x | Baseline fixes | Q-02…Q-09 | `verify` green, zero skips |
| v1.3.0 | Trusted results | M-01…M-04, M-07, S-04, S-05 | Schema v2 migration, golden IEEE cases |
| v1.4.0 | Study breadth | S-01…S-03, S-08…S-10 | Each study exported and E2E tested |
| v1.5.0 | Workbench | U-01…U-07 | Keyboard-only and recovery tests |
| v2.0.0 | Scale and IO | P-01…P-08 | Benchmarks and import/export acceptance |

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

## 9. Non-goals for the next two releases

- Electromagnetic transient (EMT) simulation or real-time/HIL.
- Full IEEE 1584-2018 arc-flash modelling (requires electrode and enclosure data).
- Multi-user cloud collaboration, authentication or server-side project storage.
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

## 11. Keeping this document current

- Update the baseline scorecard when a release is tagged.
- Move completed items into the release table and remove them from the backlog.
- Add newly discovered debt with an ID rather than a prose note.
- Record every new solver assumption in `AGENTS.md` in the same pull request.
- Review the roadmap at the start of each milestone and after any incident.
