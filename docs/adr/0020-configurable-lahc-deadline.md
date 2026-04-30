# 0020: Configurable LAHC deadline on the solver JSON adapter

Status: Accepted (2026-04-30)

## Context

`solver_core::solve()` carries a 200 ms LAHC active default. The JSON adapter `solve_json` was a one-liner over `solve()` so every caller, including the backend test suite, paid the 200 ms wall-clock per solve. The CI Python-test step takes 20 minutes; per-test profiling and the dot-progress trace point to the schedule POSTs (each bounded below by the LAHC deadline) plus per-test database setup as the dominant cost. See `docs/superpowers/specs/2026-04-30-profile-slow-tests-design.md`.

## Decision

Add `solve_json_with_config(json, deadline_ms: Option<u64>)` to `solver_core` and a matching PyO3 binding (`klassenzeit_solver.solve_json_with_config`). The existing `solve_json(json)` becomes a one-line delegate over `solve_json_with_config(json, Some(200))` so production callers keep their 200 ms LAHC pass without any wire change. `deadline_ms = None` skips LAHC entirely (greedy-only). Backend reads `KZ_SOLVE_DEADLINE_MS` from Settings and threads it into the binding; `backend/.env.test` sets it to 0 so the test suite never waits on LAHC.

## Alternatives

- Settings-only on the backend. Force the deadline through every backend call site without exposing it on the binding. Rejected: notebooks and scripts also benefit from the explicit knob, and the binding is the natural surface for it.
- Generalise to a `SolveConfigDict` argument. Open-ended kwargs on the binding. Rejected: only `deadline_ms` is a useful test override today; the rest of `SolveConfig` is either not test-relevant or already filed as a deferral. Adding a kwarg per test-relevant knob is the right granularity until a second one shows up. The OPEN_THINGS deferrals "Configurable LAHC deadline" and "Promote `SolveConfig.max_iterations` to a production knob" remain separate.

## Consequences

- Backend test suite no longer pays the 200 ms LAHC wall-clock per schedule POST. Local schedule-route tests drop from ~0.4 s to ~0.05 s; CI savings are larger because the 200 ms wait is wall-clock and accumulates across serialised long-tail tests.
- Production callers (`POST /api/classes/{id}/schedule` in dev/prod) keep the 200 ms LAHC default. No wire change.
- ADR 0014 (`SolveConfig`) and ADR 0015 (LAHC) remain authoritative for the public Rust types; this ADR only covers the JSON adapter additive surface.
- Closes the OPEN_THINGS deferral "Configurable LAHC deadline" for the test path. The user-facing query parameter (`?deadline_ms=`) on the schedule route stays a deferral; only the env-var path is wired.
