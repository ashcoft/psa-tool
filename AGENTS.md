# Power System Analysis Tool (PSA) repository guide

## Stack and commands

- Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4.
- `npm ci`, `npm run dev`, `npm run build`, `npm run lint`, `npm test`.
- `npm run verify` runs lint, type check, unit tests and the production build.
- End-to-end: `BASE_URL=http://localhost:3000 npx playwright test` (Chromium).
- `npm run build:pages` produces the static export for GitHub Pages with base path `/psa-tool`.
- Optional server tier in `services/api`: FastAPI + Pydantic v2, numpy/scipy, pandapower, PostgreSQL.
  `cd services/api && pip install -r requirements-dev.txt`, then `python -m pytest` and
  `python -m ruff check .`; run with `uvicorn psa_api.main:app --port 8000`.
- Server mode deployment: `docker compose --profile server up --build` (web, api, db); the default
  profile still starts only the web app.

## Architecture

- `src/lib/*` contains pure numerical engines and data utilities. Keep UI code out of these modules.
- `src/lib/studies.ts` is the study facade. A new study should return a `StudyRun` variant and be
  rendered by `ResultsDialog`, exported by `results-export`, and described in `results-export` reports.
- Specialty calculators live in `src/lib/arcflash.ts`, `motor-starting.ts`, `harmonics.ts`,
  `protection.ts` and `groundgrid.ts`, and are presented by `SpecialtyDialog`.
- `src/lib/component-catalog.ts` is the source of truth for the AC/DC/Instrument/Control/Other
  palettes. Instrument meters and numbered protection relays use badge symbols from
  `src/lib/symbols/measurement.ts` and `src/lib/symbols/protection.ts`. Definitions either map to a real model element (`bus`, `line`, `transformer`,
  `generator`, `load`, `shunt`) or become a `GenericComponent` stored in `system.components`.
  Generic components are persisted, drawn on the canvas, dragged to any position (Alt bypasses grid
  snap) and edited in the property panel. Dropping a device away from a bus creates a bus at the
  drop point. Model elements keep an optional `symbol` IEC type from the catalog so the palette and
  the diagram render the same symbol.
- `src/lib/large-samples.ts` deterministically generates the 1,000- and 2,000-element grid samples
  from ten voltage levels (220 V to 500 kV). It places one of every catalog definition and then
  fills to an exact element count; keep it deterministic and use it as the large-diagram fixture
  for rendering and solver work. `src/lib/samples.ts` registers the two samples.
- `src/lib/useProject.ts` owns the system state, undo/redo history and element editing actions.
  `autoArrange` lays buses out by BFS depth from the slack bus and keeps bus-attached components
  beside their bus.
- `src/components/Canvas.tsx` draws the one-line diagram and handles selection, dragging, connection
  and view transforms. Bus coordinates are grid units where 1 unit = 100 px at 100 % zoom. Buses and
  non-branch generic components are draggable; branch-like components stay anchored to their bus
  midpoint. Study results are drawn on the diagram (bus pu voltage, directional branch MW flows and
  bus fault currents in kA); `ResultsDialog` opens only from Results/F10, and Report from the Report
  action. Overlays are tied to the system object the study ran on, so any edit or undo hides them.
- The app shell is `src/app/page.tsx`; the ribbon definition is `src/components/Ribbon.tsx` and
  actions are dispatched by `handleAction` in the page.
- Workspace panes are toggled by `settings.showSidebar`, `showProperties` and `showToolbar`
  (`Ctrl+B`, `Ctrl+Shift+B`, `Ctrl+Shift+T`). The toolbar collapses to a thin strip like the output
  bar. Palette tiles are icon-only, category-coloured and use `title`/`aria-label` for names;
  touch screens show the names under the icons because they have no hover. On narrow screens the
  panes render as overlay drawers and start closed.
- `services/api/psa_api/contract.py` mirrors `src/types/index.ts` in camelCase and is versioned by
  `CONTRACT_VERSION`. Change both files in the same pull request and bump the version when a field
  moves. `services/api/psa_api/adapter.py` converts the per-unit model to pandapower and logs every
  assumption in the study `messages`; `studies.py` builds the `StudyRun`.
- The equipment library lives in Postgres (`services/api/psa_api/catalog.py` and `seed.py`), with
  SQLite as a zero-configuration fallback. Every row belongs to a `dataset_version`; publish a new
  version instead of editing rows in place.
- Client and service results are checked against `services/api/tests/fixtures/ieee9-client-nr.json`.
  Document any intentional difference in `services/api/README.md` instead of hiding it.

## Conventions

- The model stores MW, Mvar and kV; bus angles are radians and the property panel shows degrees.
  Solvers convert to per-unit on `system.baseMVA` internally and return MW/Mvar/kA. Study results
  report `BusResult.angle` in degrees in both implementations.
- React compiler lint is strict: avoid `setState` synchronously in effects, do not write refs during
  render, and keep hooks unconditional. Prefer deriving state or keyed remounts.
- Keep `useProject` state updaters pure. StrictMode invokes them twice, so history coalescing and
  `lastCommit` bookkeeping happen in the event handler before `setState`.
- Drag history is gesture-based: `Canvas` calls `beginMove` on mouse-down and `endMove` on mouse-up,
  while `moveBus`/`moveComponent` only update coordinates.
- Keep components accessible: dialogs use `role="dialog"`, tabs use `role="tab"`, icon-only buttons
  need `title`/`aria-label`.

## Documentation and deployment

- `docs/` holds the user guide, architecture, numerical methods and deployment guides. Update them
  with behaviour or assumption changes.
- `README.md` is the project landing page; `ROADMAP.md` is the plan of record.
- `.github/workflows/pages.yml` builds the static export and deploys it with the Pages artifact and
  deployment actions. The release workflow dispatches it with the release commit SHA, so the site
  matches the latest release; pushes to `main` do not deploy on their own. The site is served at
  <https://ashcoft.github.io/psa-tool/>.
- `.github/workflows/docker-publish.yml` publishes the container to GHCR on `main`, version tags and
  manual dispatch.

## Numerical assumptions

- Short circuit: generator subtransient reactance 0.05 p.u.; Z0 = 0.5 Z1 for unbalanced faults.
- Stability and time-domain: classical multimachine model, Kron-reduced network, deterministic
  inertia (2.5-8 s), small-signal damping 1.5 p.u. and time-domain damping 2 p.u.
- Continuation power flow: parameter continuation scaling load and non-slack generation by `1+lambda`,
  capped at each generator's `pmax`; each step is solved with Newton-Raphson and the step is halved
  when a solution is lost. The last point may be the configured maximum, not a verified collapse.
- Optimal power flow: merit-order/equal-incremental-cost economic dispatch with AC verification;
  branch overloads are reported rather than optimised away.
- Specialty studies are screening calculations: Lee arc-flash model, IEEE 519 harmonic limits,
  IEC/IEEE relay curves, and IEEE 80 simplified ground-grid equations.
- Relay curves use the IEC 60255-151 / IEEE C37.112 form `t = TD * (A / (M^p - 1) + B)`. The
  constants in `src/lib/protection.ts` and the catalogue store `A = k`, `p = alpha`, `B = b`; IEEE
  very inverse is `p = 2`, not 1.
- Server tier (pandapower): bus voltage bases come from `bus.vbase`, then transformer `vhigh`/`vlow`,
  then 1 kV with a study-log message. Line charging is converted from the model susceptance to
  `c_nf_per_km` at `system.baseFreq`. Ampacity and cable impedance rows in dataset `2026.11` are
  screening values (IEC 60228 conductor resistance, indicative XLPE ampacity).
- Result definitions differ in two places by decision: line `loading` uses the worse of the two ends
  on the server and the sending end in the client; the slack generator reports solved `pg` on the
  server and scheduled `pg` in the client.
- Server sidebar behaviours that are easy to regress: transformer taps go through pandapower's
  `Ratio` changer (`tap_ratio` is ignored), `enforce_q_lims=True` is required for reactive limits,
  shunt power is read from `res_shunt` (scaled by V squared), out-of-service buses report zeros, and
  a failed study reports `maxMismatch: null` because NaN cannot be serialized.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
