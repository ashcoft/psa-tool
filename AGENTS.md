# PSAT Web repository guide

## Stack and commands

- Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4.
- `npm install`, `npm run dev`, `npm run build`, `npm run lint`, `npm test`.
- End-to-end: `BASE_URL=http://localhost:3000 npx playwright test` (Chromium).

## Architecture

- `src/lib/*` contains pure numerical engines and data utilities. Keep UI code out of these modules.
- `src/lib/studies.ts` is the study facade. A new study should return a `StudyRun` variant and be
  rendered by `ResultsDialog`, exported by `results-export`, and described in `results-export` reports.
- Specialty calculators live in `src/lib/arcflash.ts`, `motor-starting.ts`, `harmonics.ts`,
  `protection.ts` and `groundgrid.ts`, and are presented by `SpecialtyDialog`.
- `src/lib/useProject.ts` owns the system state, undo/redo history and element editing actions.
- `src/components/Canvas.tsx` draws the one-line diagram and handles selection, dragging, connection
  and view transforms. Bus coordinates are grid units where 1 unit = 100 px at 100 % zoom.
- The app shell is `src/app/page.tsx`; the ribbon definition is `src/components/Ribbon.tsx` and
  actions are dispatched by `handleAction` in the page.

## Conventions

- The model stores engineering units (MW, Mvar, kV, degrees in the UI). Solvers convert to per-unit
  on `system.baseMVA` internally and return MW/Mvar/kA.
- Bus `angle` is stored in radians; the property panel converts to/from degrees.
- React compiler lint is strict: avoid `setState` synchronously in effects, do not write refs during
  render, and keep hooks unconditional. Prefer deriving state or keyed remounts.
- Keep components accessible: dialogs use `role="dialog"`, tabs use `role="tab"`, icon-only buttons
  need `title`/`aria-label`.

## Numerical assumptions

- Short circuit: generator subtransient reactance 0.05 p.u.; Z0 = 0.5 Z1 for unbalanced faults.
- Stability and time-domain: classical multimachine model, Kron-reduced network, deterministic
  inertia (2.5-8 s) and damping (1.5-2 p.u.).
- Continuation power flow: parameter continuation scaling load and non-slack generation by `1+lambda`;
  the step is halved when a solution is lost.
- Optimal power flow: merit-order/equal-incremental-cost economic dispatch with AC verification;
  branch overloads are reported rather than optimised away.
- Specialty studies are screening calculations: Lee arc-flash model, IEEE 519 harmonic limits,
  IEC/IEEE relay curves, and IEEE 80 simplified ground-grid equations.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
