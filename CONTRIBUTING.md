# Contributing to Power System Analysis Tool (PSA)

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
npx playwright install chromium
npm run dev
```

Quality gates before a pull request:

```bash
npm run lint
npm run test:run
npm run build
BASE_URL=http://localhost:3000 npx playwright test
```

For the optional server tier in `services/api` (Python 3.13):

```bash
cd services/api
pip install -r requirements-dev.txt
python -m ruff check .
python -m pytest
```

The PostgreSQL round trip skips unless `DATABASE_URL` points at a database; CI supplies one.

## Coding conventions

- TypeScript strict mode is on. Avoid `any`; model new data in `src/types/index.ts`.
- `src/lib/*` contains pure engines and utilities. Keep React and DOM code out of it.
- The model stores MW, Mvar and kV. Bus angles are radians in the model; the property panel converts
  to degrees. Solvers convert to per-unit.
- React compiler lint is strict: no synchronous `setState` in effects, no ref writes during render,
  unconditional hooks.
- State updaters in `useProject` must stay pure. StrictMode calls them twice, so history and
  coalescing bookkeeping happens before `setState`.
- Keep dialogs, tabs and icon-only buttons accessible (`role`, `aria-label`, `title`).
- `services/api/psa_api/contract.py` mirrors `src/types/index.ts`. Change both in the same pull
  request and bump `CONTRACT_VERSION` when a field moves. Study results report `BusResult.angle` in
  degrees; the model `Bus.angle` stays radians.
- Catalogue rows belong to a dataset version. Publish a new version rather than editing existing
  rows, and record provenance in `services/catalog/README.md`.

## Adding or changing a study

1. Add the engine and unit tests under `src/lib/`.
2. Add a `StudyRun` variant and runner in `src/lib/studies.ts`.
3. Add tables in `src/lib/results-export.ts` and a report section if needed.
4. Add the result tab, stat cards and chart in `src/components/ResultsDialog.tsx`.
5. Wire the ribbon action in `src/components/Ribbon.tsx` and `handleAction` in
   `src/app/page.tsx`.
6. Add an end-to-end path in `playwright/tests/app.spec.ts`.
7. Document any new assumption in `docs/NUMERICAL-METHODS.md` and `AGENTS.md`.
8. If the study is also served by `services/api`, add a `StudyKind` variant there, a contract test
   and a parity assertion against the committed client fixture.

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

By contributing, you agree that your contribution to the original code is licensed under MIT.
Contributions to PSAT-derived files in `psat-converted/` remain under their upstream GPL terms;
see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
