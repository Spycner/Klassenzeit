# Structured logging across the backend

**Date:** 2026-04-28
**Status:** Design approved (autopilot autonomous mode), plan pending.

## Problem

`docs/superpowers/OPEN_THINGS.md` ("Toolchain & build friction" section) names the gap directly:

> **Structured logging (rest of backend).** The prototype sprint wraps the solver boundary with `logger.info` calls; broader JSON logging across the FastAPI app and test output still needs a library choice, a schema, and wiring. `solver-py` logging gets the same treatment once the Rust worker is real.

Today the backend has four `logger.info("event.name", extra={...})` call sites in `scheduling/solver_io.py`, `scheduling/routes/schedule.py`, and `scheduling/routes/lessons.py`. The root logger's default formatter emits plain text (`INFO:klassenzeit_backend.scheduling.solver_io:solver.solve.done`) and the `extra=` payload is *dropped on the floor* unless an explicit format string lists every key. Operators on the staging VPS see uvicorn's plain-text access log and nothing else.

Without a JSON formatter, even our existing structured event emissions (`solver.solve.start`, `solver.solve.done`, `solver.solve.error`, `schedule.persist.done`) cannot drive an alert keyed on `duration_ms > N` or `violations_by_kind.no_qualified_teacher > 0` because the `extra=` keys never reach the formatted line. The infrastructure is the missing piece.

## Goal

Land one PR titled "feat(backend): emit JSON-structured logs across the app" on branch `feat/structured-logging-backend`. Three production files change:

1. `backend/src/klassenzeit_backend/core/logging.py` (new) — `JsonFormatter` plus `configure_logging(*, env, log_format, log_level)`.
2. `backend/src/klassenzeit_backend/core/settings.py` — two new fields: `log_format: Literal["text", "json"] | None = None` and `log_level: str = "INFO"`.
3. `backend/src/klassenzeit_backend/main.py` — call `configure_logging(...)` from `build_app(env)` before router include; register an `http.request` access middleware that emits one event per response.

Two new test files cover the new behaviour:

- `backend/tests/core/test_logging.py` — formatter shape, idempotent `configure_logging`, exception payload.
- `backend/tests/test_http_access_middleware.py` — middleware emits the right event with method, path, status, duration_ms, request_id; `X-Request-ID` header round-trips.

ADR 0016 records the load-bearing decisions (stdlib over structlog, custom formatter over python-json-logger, env-driven default, deferred items).

After the PR: operators with `KZ_ENV=prod` see one JSON line per request, plus the four already-emitted solver events become parseable JSON automatically. Devs (`KZ_ENV=dev` default) still see plain text in their terminal.

## Non-goals

- **`contextvars`-based request-id propagation into every in-request log.** Threads the middleware-generated `request_id` through any subsequent `logger.info(...)` call inside the same request scope. Defer until the first new call site asks for automatic correlation; the four existing solver call sites already pass `school_class_id` explicitly, which is the strongest correlation key for their workflow.
- **Replacing or muting uvicorn's `--access-log`.** Production will see two access lines per request (uvicorn plain text + our JSON `http.request`) until an operator flips `--no-access-log` on the uvicorn invocation. Acceptable cost for a smaller-diff PR; documented in the spec for the operator.
- **Request / response body or `Content-Length` logging.** PII risk + tee-stream complexity. Reserved for a follow-up that has explicit privacy review.
- **Solver-py / Rust-side structured logging.** OPEN_THINGS already pinpoints this as a follow-up ("`solver-py` logging gets the same treatment once the Rust worker is real").
- **GCP / ECS / CloudWatch field renames.** No log shipper is wired up; choose schema mapping when the shipper lands.
- **Plumbing `KZ_LOG_LEVEL` into uvicorn's loggers.** Out of scope; only the root logger and `klassenzeit_backend.*` namespace are configured. Uvicorn's `--log-level` flag stays the operator's lever for uvicorn-internal verbosity.
- **Migrating every CRUD route handler to log on success and error.** This PR is infrastructure; the four existing call sites are the only instrumentation that ships. Once `JsonFormatter` is in place, future call sites are one line each, but they are out of scope here.
- **Frontend rendering or wire-format propagation.** No `ScheduleResponse` change. No frontend change.

## Design

### Settings additions

Two new fields on `klassenzeit_backend.core.settings.Settings`:

```python
class Settings(BaseSettings):
    ...
    log_format: Literal["text", "json"] | None = None
    log_level: str = "INFO"
```

`log_format=None` (the default) resolves to `"json"` if `env == "prod"` else `"text"`. Operator override via `KZ_LOG_FORMAT=json` or `KZ_LOG_FORMAT=text`. The override exists so a dev can validate JSON output locally with `KZ_LOG_FORMAT=json mise run dev`.

`log_level` accepts the standard logging level names (`"DEBUG"`, `"INFO"`, `"WARNING"`, `"ERROR"`). Set on the root logger and on `klassenzeit_backend` directly.

### `core/logging.py`

Single new module, ~60 lines total, owning two public callables and one private formatter.

```python
"""Structured logging configuration for the backend.

`configure_logging` installs a JSON formatter (or a plain-text formatter) on
the root stream handler, scoped to a single call per process via an
idempotency guard. Existing `logger.info("event.name", extra={...})` call
sites stay untouched; their `extra` payload is merged into the JSON record at
top level by `JsonFormatter`.
"""

from __future__ import annotations

import json
import logging
import sys
import traceback
from datetime import UTC, datetime
from typing import Any, Final, Literal

# LogRecord built-in attributes; everything else on record.__dict__ came from
# the caller's extra= dict and gets merged into the output payload.
_RESERVED: Final[frozenset[str]] = frozenset({
    "name", "msg", "args", "levelname", "levelno", "pathname", "filename",
    "module", "exc_info", "exc_text", "stack_info", "lineno", "funcName",
    "created", "msecs", "relativeCreated", "thread", "threadName",
    "processName", "process", "message", "taskName", "asctime",
})


class JsonFormatter(logging.Formatter):
    """Render `LogRecord` as a single JSON object per line."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": datetime.fromtimestamp(record.created, UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "event": record.getMessage(),
        }
        if record.exc_info:
            exc_type, exc_value, exc_tb = record.exc_info
            payload["exc_class"] = exc_type.__name__ if exc_type else None
            payload["exc_message"] = str(exc_value) if exc_value else None
            payload["exc_stack"] = "".join(
                traceback.format_exception(exc_type, exc_value, exc_tb)
            )
        for key, value in record.__dict__.items():
            if key in _RESERVED or key.startswith("_"):
                continue
            payload[key] = _coerce(value)
        return json.dumps(payload, default=str, ensure_ascii=False)


def _coerce(value: Any) -> Any:
    """Best-effort coerce a non-JSON-serialisable value to a string."""
    try:
        json.dumps(value)
    except TypeError:
        return str(value)
    return value


_configured: bool = False


def configure_logging(
    *,
    env: Literal["dev", "test", "prod"],
    log_format: Literal["text", "json"] | None,
    log_level: str,
) -> None:
    """Idempotently install the chosen formatter on a single stream handler.

    `log_format=None` resolves to `"json"` when `env == "prod"`, else `"text"`.
    Subsequent calls in the same process are no-ops so test fixtures that
    rebuild the FastAPI app do not stack handlers.
    """
    global _configured
    if _configured:
        return
    resolved = log_format or ("json" if env == "prod" else "text")
    handler = logging.StreamHandler(sys.stdout)
    if resolved == "json":
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(
            logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s")
        )
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(log_level)
    logging.getLogger("klassenzeit_backend").setLevel(log_level)
    _configured = True
```

The `_coerce` helper exists because `extra={"thing": uuid4()}` would otherwise raise `TypeError: Object of type UUID is not JSON serializable`. Falling back to `str(value)` is the documented stdlib pattern for `json.dumps(default=str)`; the wrap is here because we want per-key fallbacks rather than failing the entire record.

`_configured` is a module-level boolean. Tests that need to re-configure in isolation (rare) reach in via `klassenzeit_backend.core.logging._configured = False`. Production never resets it.

### `main.py` integration

Two additions:

1. Inside `build_app(env)`, before the first `include_router` call:

   ```python
   settings = get_settings()
   configure_logging(
       env=settings.env,
       log_format=settings.log_format,
       log_level=settings.log_level,
   )
   ```

2. A `@new_app.middleware("http")` access logger that wraps every request:

   ```python
   _ACCESS_LOGGER = logging.getLogger("klassenzeit_backend.http.access")

   @new_app.middleware("http")
   async def log_http_request(request, call_next):
       request_id = _resolve_request_id(request.headers.get("x-request-id"))
       request.state.request_id = request_id
       started = time.monotonic()
       response = await call_next(request)
       duration_ms = (time.monotonic() - started) * 1000.0
       response.headers["X-Request-ID"] = request_id
       _ACCESS_LOGGER.info(
           "http.request",
           extra={
               "method": request.method,
               "path": request.url.path,
               "status": response.status_code,
               "duration_ms": duration_ms,
               "request_id": request_id,
           },
       )
       return response
   ```

   `_resolve_request_id` accepts a header value, validates length <= 64 chars, falls back to `uuid4().hex` on absence or overflow. This guards against a misbehaving client passing a 100KB request_id.

### Tests

Two new files. No fixtures cross-contaminate; each test resets `_configured` in a `pytest.fixture(autouse=True)` inside its own module so tests can call `configure_logging` and observe handler state without leaking into other modules.

`backend/tests/core/test_logging.py`:

| name | what it asserts |
|---|---|
| `test_json_formatter_emits_top_level_keys` | `JsonFormatter().format(record)` parses to a dict with `ts`, `level`, `logger`, `event`. |
| `test_json_formatter_merges_extra_payload` | `extra={"a": 1, "b": "two"}` shows up at top level, no namespacing. |
| `test_json_formatter_excludes_reserved_keys` | A record built from a real `logger.info(...)` call does not leak `pathname` or `created` into the payload. |
| `test_json_formatter_serialises_uuid_via_str_fallback` | `extra={"id": uuid4()}` survives, becomes a string. |
| `test_json_formatter_includes_exc_info_on_error` | `logger.error("boom", exc_info=exc)` renders `exc_class`, `exc_message`, `exc_stack`. |
| `test_configure_logging_is_idempotent` | Two consecutive calls leave exactly one handler on the root logger. |
| `test_configure_logging_resolves_default_format_per_env` | `env="prod"` + `log_format=None` selects JSON; `env="dev"` + `log_format=None` selects text. |
| `test_configure_logging_respects_explicit_override` | `env="prod"` + `log_format="text"` keeps text formatter. |

`backend/tests/test_http_access_middleware.py`:

| name | what it asserts |
|---|---|
| `test_access_middleware_emits_http_request_event` | `TestClient.get("/api/health")` produces one record on `klassenzeit_backend.http.access` with `event == "http.request"` and the five fields populated. |
| `test_access_middleware_propagates_inbound_request_id` | `headers={"X-Request-ID": "abc123"}` is preserved in the captured record and echoed in the response header. |
| `test_access_middleware_generates_request_id_on_absence` | No inbound header → `request_id` is a 32-char hex string and the response carries it back. |
| `test_access_middleware_caps_oversized_request_id` | `headers={"X-Request-ID": "x" * 100}` → middleware drops and regenerates; response carries the new id. |
| `test_access_middleware_records_duration_under_one_second_for_health_check` | `duration_ms` is non-negative and below 1000 for `/api/health`. |

`tests/scheduling/test_solver_io.py:test_run_solve_round_trips_and_logs` is unchanged: `caplog` captures `LogRecord` objects pre-formatter, and the assertion is on `record.__dict__["foo"]` which the formatter respects.

### ADR 0016

A short ADR captures: stdlib over structlog/loguru (existing call sites + `caplog` compat), custom `JsonFormatter` over `python-json-logger` (no external dep, schema fits in 30 lines), top-level merging of `extra=` keys, env-driven default for `log_format`, deferral of contextvars and uvicorn access-log replacement.

### Commit split

Branch `feat/structured-logging-backend`, in order:

1. `docs: add structured-logging design spec` (this file)
2. `docs: add structured-logging implementation plan`
3. `feat(backend): add JsonFormatter and configure_logging`
4. `feat(backend): wire configure_logging from build_app`
5. `feat(backend): emit http.request structured access log`
6. `docs(adr): record structured-logging library and schema choice`
7. `docs: track structured-logging follow-ups in OPEN_THINGS`

TDD ordering inside commits 3 and 5 is enforced by `superpowers:test-driven-development` (red first via tests for the new module / middleware, then implementation, then refactor for readability).

## Risks

- **Test fragility around `configure_logging` re-runs.** Multiple `build_app` calls in the same pytest session would hit the idempotency short-circuit, which is the desired behaviour, but a test that asserts on `logging.getLogger().handlers` count has a hidden coupling to import order. Mitigation: assert on `JsonFormatter` instance via `isinstance`, not on handler count. The idempotency unit test owns the count assertion.
- **Performance overhead of the middleware.** One `time.monotonic()` before, one after, one `logger.info` after the response. Sub-microsecond per request; negligible vs. database round-trips.
- **`X-Request-ID` injection.** Cap to 64 chars in `_resolve_request_id`; oversized headers regenerate. No further validation (e.g. UUID format) so clients can use their own correlation IDs.
- **Pydantic Settings parsing of `log_level`.** Accepts any string; if an operator typos `KZ_LOG_LEVEL=INF` Python's `logging.getLogger().setLevel("INF")` raises `ValueError`. Stdlib's behaviour is the right error; we do not coerce or default-on-typo.
- **Uvicorn double-access-line.** Production will emit one uvicorn access line plus one of our JSON `http.request` events per request. Acceptable for the prototype; operator can flip `--no-access-log` on the uvicorn invocation when log volume matters.
- **Existing tests that capture print output.** None found via `rg "capfd|capsys" backend/tests/`; `caplog` is the only capture in use, and it captures records pre-formatter.

## Success criteria

- `mise run lint` and `mise run test:py` are green.
- `tests/core/test_logging.py` covers formatter shape, idempotent setup, and override semantics.
- `tests/test_http_access_middleware.py` covers event emission, request_id round-trip, and oversized-input rejection.
- `tests/scheduling/test_solver_io.py:test_run_solve_round_trips_and_logs` passes unmodified.
- Manual check: `KZ_LOG_FORMAT=json mise run dev` followed by `curl http://localhost:8000/api/health` emits one valid JSON line on stdout containing `event: "http.request"`, `path: "/api/health"`, `status: 200`.
- Manual check: default `mise run dev` (env=dev) emits plain text.
- ADR 0016 lands in `docs/adr/`.
- `docs/superpowers/OPEN_THINGS.md` "Toolchain & build friction" entry is replaced with the deferred follow-ups list (contextvars propagation, uvicorn replacement, body logging, solver-py mirror, schema mapping).
