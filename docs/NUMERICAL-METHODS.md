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

`src/lib/cpf.ts` increases load and non-slack generation by `1 + lambda`, capping each non-slack
generator at `pmax`. It does not use a predictor-corrector step: each loading level is solved
directly with Newton-Raphson, and the step is halved when a solution is lost. The recorded nose
point is the last converged loading level. If every step converges through the endpoint, that point
is the configured endpoint, not a verified voltage-collapse point. The effective endpoint is
`max(lambdaMax, stepSize)`. If the base case converges but no positive loading level converges, no
nose point is recorded.

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
generator rating (`2.5` to `8` s) and every active generator uses a fixed damping of `1.5` p.u.
because the model does not yet store machine dynamic data.

## Time-domain simulation

`src/lib/timeseries.ts` integrates the classical swing equations with Euler, RK4 or trapezoidal
integration. A balanced fault at the selected bus is the standard disturbance. The time-domain
generator model uses a fixed damping of `2` p.u. `checkStability` classifies the response from speed
deviation and angle bounds; `calculateCriticalClearingTime` bisects the fault duration.

## Specialty studies

| Study | Method | Limitation |
|-------|--------|------------|
| Arc flash | Lee spherical radiation model | Screening only; not IEEE 1584-2018 |
| Motor starting | Locked-rotor current and terminal-voltage dip from the network | Static starting model |
| Harmonics | Frequency-dependent network with X ∝ h, R ∝ √h, B ∝ h | User-supplied spectrum, no harmonic load flow iteration |
| Protection | IEC/IEEE inverse-time curves, `t = TD * (A / (M^p - 1) + B)` | Coordination is advisory |
| Ground grid | IEEE 80 simplified equations | Uniform soil, simple grid geometry |

## Server tier (pandapower)

`services/api` runs the same per-unit model through pandapower. Conversions happen once, in
`psa_api/adapter.py`, and every fallback is written to the study log:

| Item | Rule |
|------|------|
| Bus voltage base | `bus.vbase`, else transformer `vhigh`/`vlow`, else 1 kV with a logged warning |
| Line impedance | `r_ohm_per_km = r_pu * (vbase^2 / baseMVA) / length_km`; `length_km` defaults to 1 |
| Line charging | `c_nf_per_km` from `b_pu` at `system.baseFreq` |
| Line rating | `max_i_ka = rating / (sqrt(3) * vbase)` |
| Transformer | `vk_percent` and `vkr_percent` re-referenced from the system base to the transformer rating, tap on the HV side |
| Shunt | `q_mvar = -b * baseMVA` (pandapower treats positive `q_mvar` as inductive) |
| Generators | External grid on every slack bus (with or without a generator), `gen` on PV buses with `enforce_q_lims`, fixed injection on PQ buses |
| Transformer tap | pandapower `Ratio` changer on the HV side, `tap_pos = tap - 1`, `tap_step_percent = 100` (`tap_ratio` is ignored by the solver) |
| Shunt power | Solved `res_shunt` value, scaled by the square of the bus voltage |
| Out-of-service buses | Zero voltage, angle and injection, with a study-log message |
| DC studies | Zero reactive quantities; pandapower leaves them unset |
| Failed studies | `maxMismatch` is `null`; NaN would break JSON serialization |
| Relay curves | IEC 60255-151 / IEEE C37.112 `A`, `B`, `p` constants; IEEE very inverse uses `p = 2` and `B = 0.491` |

Result differences from the client are intentional and documented in `services/api/README.md`:
line `loading` uses the worse end, the slack generator reports solved `pg`, and bus result angles are
degrees. Everything else is pinned by `services/api/tests/fixtures/ieee9-client-nr.json`, which the
client solver generated from the IEEE 9-bus sample.

## Reproducibility

All engines are deterministic for a fixed model and settings. The test suite uses the demo 4-bus
system and the IEEE 9-bus sample to pin expected values. If you change an engine, add or update a
regression test and record any new assumption in `AGENTS.md`.
