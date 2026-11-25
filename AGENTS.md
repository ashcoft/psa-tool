# Power System Analysis Tool (PSA) repository guide

## Stack and commands

- Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4.
- `npm ci`, `npm run dev`, `npm run build`, `npm run lint`, `npm test`.
- `npm run verify` runs lint, type check, unit tests and the production build.
- End-to-end: `BASE_URL=http://localhost:3000 npx playwright test` (Chromium).
- `npm run build:pages` produces the static export for GitHub Pages with base path `/psa-tool`.

## Architecture

- `src/lib/*` contains pure numerical engines and data utilities. Keep UI code out of these modules.
- `src/lib/studies.ts` is the study facade. A new study should return a `StudyRun` variant and be
  rendered by `ResultsDialog`, exported by `results-export`, and described in `results-export` reports.
- Specialty calculators live in `src/lib/arcflash.ts`, `motor-starting.ts`, `harmonics.ts`,
  `protection.ts` and `groundgrid.ts`, and are presented by `SpecialtyDialog`.
- `src/lib/component-catalog.ts` is the source of truth for the AC/DC/Instrument/Control/Other
  palettes. Definitions either map to a real model element (`bus`, `line`, `transformer`,
  `generator`, `load`, `shunt`) or become a `GenericComponent` stored in `system.components`.
  Generic components are persisted, drawn on the canvas, dragged to any position (Alt bypasses grid
  snap) and edited in the property panel. Dropping a device away from a bus creates a bus at the
  drop point. Model elements keep an optional `symbol` IEC type from the catalog so the palette and
  the diagram render the same symbol.
- `src/lib/useProject.ts` owns the system state, undo/redo history and element editing actions.
  `autoArrange` lays buses out by BFS depth from the slack bus and keeps bus-attached components
  beside their bus.
- `src/components/Canvas.tsx` draws the one-line diagram and handles selection, dragging, connection
  and view transforms. Bus coordinates are grid units where 1 unit = 100 px at 100 % zoom. Buses and
  non-branch generic components are draggable; branch-like components stay anchored to their bus
  midpoint.
- The app shell is `src/app/page.tsx`; the ribbon definition is `src/components/Ribbon.tsx` and
  actions are dispatched by `handleAction` in the page.
- Workspace panes are toggled by `settings.showSidebar`, `showProperties` and `showToolbar`
  (`Ctrl+B`, `Ctrl+Shift+B`, `Ctrl+Shift+T`). The toolbar collapses to a thin strip like the output
  bar. Palette tiles are icon-only, category-coloured and use `title`/`aria-label` for names.

## Conventions

- The model stores MW, Mvar and kV; bus angles are radians and the property panel shows degrees.
  Solvers convert to per-unit on `system.baseMVA` internally and return MW/Mvar/kA.
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
  deployment actions. The site is served at <https://ashcoft.github.io/psa-tool/>.
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

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
