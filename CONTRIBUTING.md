# Contributing to PSAT Web

Thanks for helping improve the workbench. This project is a browser port of PSAT, so numerical
correctness and honest assumptions matter more than feature count.

## Before you start

- Read [AGENTS.md](AGENTS.md) for the repository conventions and numerical assumptions.
- Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before adding a study.
- For a bug, open an issue with the sample project or steps that reproduce it.
- For a large feature, open an issue first so the design can be discussed.

## Setup

Requirements: Node.js 26 (see `.nvmrc`) and npm.

```bash
npm ci
npm run dev
```

Quality gates before a pull request:

```bash
npm run lint
npm run test:run
npm run build
BASE_URL=http://localhost:3000 npx playwright test
```

## Coding conventions

- TypeScript strict mode is on. Avoid `any`; model new data in `src/types/index.ts`.
- `src/lib/*` contains pure engines and utilities. Keep React and DOM code out of it.
- The model stores engineering units (MW, Mvar, kV, degrees). Solvers convert to per-unit.
- Bus angles are radians in the model; the property panel converts to degrees.
- React compiler lint is strict: no synchronous `setState` in effects, no ref writes during render,
  unconditional hooks.
- State updaters in `useProject` must stay pure. StrictMode calls them twice, so history and
  coalescing bookkeeping happens before `setState`.
- Keep dialogs, tabs and icon-only buttons accessible (`role`, `aria-label`, `title`).

## Adding or changing a study

1. Add the engine and unit tests under `src/lib/`.
2. Add a `StudyRun` variant and runner in `src/lib/studies.ts`.
3. Add tables in `src/lib/results-export.ts` and a report section if needed.
4. Add the result tab, stat cards and chart in `src/components/ResultsDialog.tsx`.
5. Wire the ribbon action in `src/components/Ribbon.tsx` and `handleAction` in
   `src/app/page.tsx`.
6. Add an end-to-end path in `playwright/tests/app.spec.ts`.
7. Document any new assumption in `docs/NUMERICAL-METHODS.md` and `AGENTS.md`.

## Commit messages

The repository uses [Conventional Commits](https://www.conventionalcommits.org/) and
semantic-release:

- `fix: ...` → patch release
- `feat: ...` → minor release
- `feat!: ...` or `BREAKING CHANGE:` → major release
- `docs:`, `test:`, `chore:` → no release

Keep commits focused. Do not mix refactors with numerical changes.

## Pull requests

- Target `main` from a topic branch.
- Describe the problem, the change and the verification you ran.
- Include screenshots for canvas or dialog changes.
- Update `README.md`, `ROADMAP.md` or `docs/` when behaviour or assumptions change.
- Do not commit `node_modules`, `.next`, `coverage`, secrets or generated test results.

## License

By contributing, you agree that your contribution is licensed under GPL-3.0.
