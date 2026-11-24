# PSAT Web - Power System Analysis Toolbox

A browser-based power system analysis workbench derived from the MATLAB-based
[PSAT](https://faraday1.ucd.ie/psat.html). The interface follows the ETAP style:
a ribbon, a one-line diagram editor, a component browser, a property grid, a
study-case history and tabular/chart results.

![PSAT Web](https://img.shields.io/badge/version-1.1.0-blue.svg)
![License](https://img.shields.io/badge/license-GPL--3.0-green.svg)
![React](https://img.shields.io/badge/React-19-61dafb.svg)
![Next.js](https://img.shields.io/badge/Next.js-16-000000.svg)

## Capabilities

### One-line diagram editor
- Ribbon with Home, Components, Analysis, Results and Tools tabs
- Component palette with search and drag-and-drop placement
- Project tree for buses, lines, transformers, generators, loads and shunts
- Select, pan, zoom (cursor-centred), fit, grid and snap-to-grid
- Click-to-connect line and transformer tools
- Context menu, duplicate, copy/paste, delete and undo/redo
- Full property editing with validation feedback
- IEEE-style bus, generator, load, shunt and transformer symbols
- Result overlays for voltage limits and branch loading

### Studies
- **Load flow**: Newton-Raphson (full Jacobian), fast-decoupled, DC and
  Gauss-Seidel. PV reactive-limit enforcement, bus/branch/generator tables,
  voltage profile and violation report.
- **Continuation power flow**: PV curve, nose point, critical bus and loading
  margin.
- **Optimal power flow**: merit-order economic dispatch with polynomial cost
  curves, AC power-flow verification and branch overload reporting.
- **Short circuit**: three-phase, line-to-ground, line-to-line and double
  line-to-ground faults from the bus impedance matrix. Results in kA, fault
  MVA, CT ratings and breaker/relay requirements.
- **Small-signal stability**: Kron-reduced multimachine model, complex shifted
  QR eigenvalues, damping ratios, mode classification and eigenvalue plot.
- **Time-domain simulation**: classical swing equations, balanced-fault
  disturbance, Euler/RK4/trapezoidal integration, rotor-angle and bus-voltage
  plots plus transient stability assessment.
- **Specialty studies** (Tools tab):
  - Arc flash screening (Lee method) with incident energy, boundary and PPE category
  - Motor starting with locked-rotor current, terminal voltage and voltage dip
  - Harmonic distortion with a 6-pulse spectrum and IEEE 519 THD check
  - Protection coordination with IEC/IEEE inverse-time curves and TCC plots
  - Ground grid screening (IEEE 80) with conductor sizing, GPR and touch/step voltages

### Results and reporting
- Study-case history for the current session
- Sortable-looking result tables with engineering units
- SVG charts (voltage profile, PV curve, dispatch, fault currents, eigenvalue
  scatter, time-domain traces)
- CSV export of every study, and HTML/CSV/JSON report export
- Print support

### Project management
- JSON project save/open with validation and normalization
- Sample systems: Demo 4-bus, IEEE 9-bus, IEEE 14-bus and a distribution feeder
- Settings persisted in the browser (solver, tolerances, simulation, overlays)
- Model check with clickable issues

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+N` / `Ctrl+O` / `Ctrl+S` | New / open / save project |
| `Ctrl+Z` / `Ctrl+Y` | Undo / redo |
| `Ctrl+C` / `Ctrl+V` / `Ctrl+X` / `Ctrl+D` | Copy / paste / cut / duplicate |
| `Delete` | Delete the selected element |
| `F5` | Load flow |
| `F6` | Continuation power flow |
| `F7` | Short circuit |
| `F8` | Optimal power flow |
| `F9` | Time-domain simulation |
| `F10` | Open results |
| `Ctrl+0` | Fit diagram to window |
| `Ctrl++` / `Ctrl+-` | Zoom in / out |
| `Esc` | Cancel the current tool or dialog |

## Getting started

Requirements: Node.js 20+ and npm.

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
npm run start      # production server
npm test           # unit and component tests (Vitest)
npm run lint       # ESLint
npx playwright test  # end-to-end tests (Chromium)
```

Playwright uses `BASE_URL` (default `http://localhost:3456`). To run the e2e
suite against an already running development server:

```bash
BASE_URL=http://localhost:3000 npx playwright test
```

### Docker

```bash
docker build -t psat-web .
docker-compose up -d
```

## Architecture

```
src/
├── app/                 # Next.js App Router (page shell, global styles)
├── components/          # UI
│   ├── TitleBar.tsx     # Project name, menus and quick access
│   ├── Ribbon.tsx       # ETAP-style ribbon definition and renderer
│   ├── Toolbar.tsx      # Study toolbar (method, run buttons, model state)
│   ├── Sidebar.tsx      # Component palette and project tree
│   ├── Canvas.tsx       # One-line diagram renderer and interaction
│   ├── PropertiesPanel.tsx
│   ├── ResultsDialog.tsx / ReportDialog.tsx / Chart.tsx
│   ├── SettingsDialog.tsx / SampleDialog.tsx / InfoDialogs.tsx
│   └── OutputWindow.tsx
├── lib/
│   ├── powerflow-methods.ts  # Ybus, NR, fast-decoupled, DC, Gauss-Seidel
│   ├── cpf.ts                # Parameter-continuation PV curve
│   ├── opf.ts                # Economic dispatch and OPF variants
│   ├── fault.ts              # Zbus short-circuit engine
│   ├── stability.ts          # Modal analysis and complex QR solver
│   ├── timeseries.ts         # Classical time-domain simulation
│   ├── studies.ts            # Study runner facade
│   ├── results-export.ts     # Tables, CSV and report sections
│   ├── project.ts            # Serialization, validation, statistics
│   ├── samples.ts            # Ready-to-run systems
│   ├── settings.ts           # Persisted application settings
│   └── useProject.ts         # Project state, history and editing actions
└── types/               # Shared TypeScript data structures
```

## Numerical notes

- The network model stores engineering units (MW, Mvar, kV) and converts to
  per-unit on the system MVA base inside the solvers.
- Bus diagram coordinates are stored in grid units; one unit is 100 px at
  100 % zoom.
- The short-circuit engine assumes a generator subtransient reactance of
  0.05 p.u. to provide a ground reference, and Z0 = 0.5 Z1 for unbalanced
  faults because zero-sequence data is not part of the model.
- The stability and time-domain studies use a classical multimachine model
  with a Kron-reduced network and deterministic inertia/damping values.
- Continuation power flow scales both load and non-slack generation by
  `1 + lambda` and halves the step when a solution is lost.

## Available scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the development server |
| `npm run build` | Build for production |
| `npm run start` | Start the production server |
| `npm test` | Run the Vitest suite |
| `npm run test:run` | Run the Vitest suite once |
| `npm run test:coverage` | Coverage report |
| `npm run lint` | ESLint |
| `npm run release` | semantic-release (normally run by CI) |

## Releases

Releases are automated with [semantic-release](https://github.com/semantic-release/semantic-release)
and driven by [Conventional Commits](https://www.conventionalcommits.org/).
The `Release` workflow runs on every push to `main`; commit messages determine
the version bump (`fix:` patch, `feat:` minor, `feat!:`/`BREAKING CHANGE:` major).

## Original PSAT

This project is a web-based port of the original
[PSAT - Power System Analysis Toolbox](https://faraday1.ucd.ie/psat.html)
developed by Federico Milano.

Original PSAT is Copyright (C) 2002-2016 Federico Milano and is free software
under the GNU General Public License v3.

## License

GPL-3.0. See the LICENSE file for details.
