# Numerical methods and assumptions

This page records what each solver actually does. When a study depends on an assumed value, the
assumption is listed here and in the study log.

## Units

- The model stores engineering units: MW, Mvar, kV and degrees in the UI.
- Solvers convert to per-unit on `system.baseMVA` and return MW, Mvar and kA.
- Bus angles are stored in radians; the property panel converts to degrees.
- Diagram coordinates are grid units where 1 unit = 100 px at 100 % zoom.

## Load flow

`src/lib/powerflow-methods.ts` builds the admittance matrix and solves the network.

| Method | Notes |
|--------|-------|
| Newton-Raphson | Full Jacobian, PV reactive-limit enforcement and PV-to-PQ switching |
| Fast-decoupled | XB variant with resistance neglected in the Jacobian |
| DC | Linear active-power approximation |
| Gauss-Seidel | Classic iteration; convergence is weaker than NR and can produce non-finite values on stressed cases |

PV buses are converted to PQ when the generator reactive output reaches `qmin` or `qmax`. Buses
without any branch are treated as isolated and excluded from the mismatch vector. The solver does
not currently split disconnected islands; run **Check Model** before a study.

## Continuation power flow

`src/lib/cpf.ts` scales both load and non-slack generation by `1 + lambda` and traces the PV curve
with a predictor-corrector continuation. The step is halved when a solution is lost. The nose point
is the last converged loading factor below the configured maximum.

## Optimal power flow

`src/lib/opf.ts` performs merit-order/equal-incremental-cost economic dispatch with polynomial cost
curves. The AC variant verifies the dispatch with a power flow and reports voltage and branch
overloads; it does not optimise them away. The engine also contains security-constrained OPF and a
24-hour unit-commitment routine that are not yet exposed in the UI.

Piecewise generator costs exist in the engine and in the model, but the study facade currently maps
every generator to a polynomial cost.

## Short circuit

`src/lib/fault.ts` builds the bus impedance matrix and evaluates:

- three-phase faults,
- line-to-ground faults,
- line-to-line faults,
- double line-to-ground faults.

Because the model has no sequence data yet, the engine uses **Z0 = 0.5 Z1** for unbalanced faults
and a generator subtransient reactance of **Xd″ = 0.05 p.u.** to provide a ground reference. Treat
unbalanced fault currents and breaker ratings as screening values until real sequence data is
entered.

## Small-signal stability

`src/lib/stability.ts` uses a classical multimachine model with a Kron-reduced network. It forms the
state matrix and computes complex eigenvalues with a shifted QR iteration. Inertia is derived from
generator rating (`2.5` to `8` s) and damping is deterministic (`1.5` to `2` p.u.) because the model
does not yet store machine dynamic data.

## Time-domain simulation

`src/lib/timeseries.ts` integrates the classical swing equations with Euler, RK4 or trapezoidal
integration. A balanced fault at the selected bus is the standard disturbance. `checkStability`
classifies the response from speed deviation and angle bounds; `calculateCriticalClearingTime`
bisects the fault duration.

## Specialty studies

| Study | Method | Limitation |
|-------|--------|------------|
| Arc flash | Lee spherical radiation model | Screening only; not IEEE 1584-2018 |
| Motor starting | Locked-rotor current and terminal-voltage dip from the network | Static starting model |
| Harmonics | Frequency-dependent network with X ∝ h, R ∝ √h, B ∝ h | User-supplied spectrum, no harmonic load flow iteration |
| Protection | IEC/IEEE inverse-time curves | Coordination is advisory |
| Ground grid | IEEE 80 simplified equations | Uniform soil, simple grid geometry |

## Reproducibility

All engines are deterministic for a fixed model and settings. The test suite uses the demo 4-bus
system and the IEEE 9-bus sample to pin expected values. If you change an engine, add or update a
regression test and record any new assumption in `AGENTS.md`.
