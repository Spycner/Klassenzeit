# 0016: structured logging across the backend

- **Status:** Accepted
- **Date:** 2026-04-28

## Context

The prototype sprint instrumented the solver boundary with `logger.info("event.name", extra={...})` calls but the root logger emits plain text and the `extra=` payload is discarded by the default formatter. Operators on the staging VPS have no JSON access log and cannot drive an alert keyed on `duration_ms` or `violations_by_kind`. We need a JSON formatter, a per-request access log, and an env-driven default that does not break the dev-terminal experience.

## Decision

Use stdlib `logging` with a custom `JsonFormatter` (~30 lines) installed by an idempotent `configure_logging(env, log_format, log_level)` that runs once from `build_app`. Add a single `@app.middleware("http")` access middleware that emits one `http.request` event per response with method, path, status, duration_ms, and a request_id (echoed back as the `X-Request-ID` header). Two settings fields drive operator override: `KZ_LOG_FORMAT=json|text` and `KZ_LOG_LEVEL`. Default resolves to JSON when `KZ_ENV=prod`, text otherwise.

## Alternatives considered

- **`structlog`.** Cleaner ergonomics for new code, but every existing call site uses stdlib `logger.info("event", extra=...)` and the existing `caplog`-based test in `tests/scheduling/test_solver_io.py` is built around stdlib `LogRecord`. Rewriting them all for a feature-equivalent outcome was not worth it.
- **`python-json-logger`.** Drop-in formatter on top of stdlib; would have worked. Rejected because the formatter we want is small enough that adding a third-party dependency (with its own release cadence and pin) is not net-positive.
- **`loguru`.** Different system, not stdlib-compatible. `caplog` no longer applies.
- **Always-JSON across all envs.** Rejected because pytest failure dumps and `mise run dev` terminal output become unreadable. Tip: developers who want to validate JSON locally use `KZ_LOG_FORMAT=json mise run dev`.
- **`contextvars`-based request_id propagation into every `logger.info(...)`.** Useful but not free: it needs a logging filter that merges contextvar state into `record.__dict__` and per-test isolation. The four existing solver call sites already pass `school_class_id` explicitly, which is the strongest correlation key for their workflow. Deferred until the first new call site asks for automatic correlation.

## Consequences

What becomes easier:
- Operators can `jq '.event == "solver.solve.done" and .duration_ms > 500'` against staging logs.
- Adding a new structured event is one line: `logger.info("event.name", extra={...})`. No formatter change.
- Test assertions on `extra=` payloads (via `caplog`) are unchanged from current practice.

What becomes harder:
- Production emits two access lines per request (uvicorn's plain-text + our JSON). Operator can flip `--no-access-log` on the uvicorn invocation when log volume matters.
- Schema changes (renaming a top-level key like `event` to `message`) ripple through every consumer. Pin `event` as the canonical key.

When to revisit:
- A log shipper requires a specific field schema (GCP `severity`, ECS `log.level`). Add a rename-mapping option to `JsonFormatter`.
- A new call site needs request-scoped correlation without re-passing `request_id` everywhere. Add the contextvar filter then.
- Body / size logging or PII redaction is requested. Land it as a separate concern with an explicit privacy review.
