# Structured logging implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land JSON-structured logging across the FastAPI backend: a custom stdlib `JsonFormatter`, idempotent `configure_logging`, and a per-request `http.request` access middleware. Two new env knobs (`KZ_LOG_FORMAT`, `KZ_LOG_LEVEL`) for operator override.

**Architecture:** New `klassenzeit_backend/core/logging.py` owns the formatter and the `configure_logging(*, env, log_format, log_level)` function. `Settings` gains two fields. `build_app(env)` calls `configure_logging` before router include and registers a single `@app.middleware("http")` access-log handler. Existing solver-side `logger.info("event", extra={...})` call sites are not touched; their `extra=` payload is merged into the JSON record at top level.

**Tech Stack:** Python 3.13, FastAPI, stdlib `logging`, `pydantic-settings`, pytest + `caplog`, httpx `ASGITransport` for the middleware integration test. No new third-party dependencies.

---

## File structure

| Path | Action | Purpose |
|---|---|---|
| `backend/src/klassenzeit_backend/core/logging.py` | Create | `JsonFormatter`, `_coerce`, `_resolve_request_id`, `configure_logging`. ~80 lines including docstrings. |
| `backend/src/klassenzeit_backend/core/settings.py` | Modify | Add `log_format` + `log_level` fields. |
| `backend/src/klassenzeit_backend/main.py` | Modify | Call `configure_logging` from `build_app`; register `http.request` middleware. |
| `backend/tests/core/test_logging.py` | Create | Unit tests for `JsonFormatter` + `configure_logging` idempotency + override semantics. |
| `backend/tests/test_http_access_middleware.py` | Create | Integration test: middleware emits `http.request` event with the right payload. |
| `docs/adr/0016-structured-logging.md` | Create | ADR recording library + schema choice. |
| `docs/adr/README.md` | Modify | Index the new ADR. |
| `docs/superpowers/OPEN_THINGS.md` | Modify | Strike "Structured logging (rest of backend)" entry; add deferred follow-ups. |

---

## Task 1: `JsonFormatter` + `_coerce`

**Files:**
- Create: `backend/src/klassenzeit_backend/core/logging.py`
- Test: `backend/tests/core/test_logging.py`

- [ ] **Step 1: Write the failing tests for `JsonFormatter`**

Create `backend/tests/core/test_logging.py`:

```python
"""Tests for klassenzeit_backend.core.logging."""

import json
import logging
from uuid import UUID, uuid4

import pytest

from klassenzeit_backend.core.logging import (
    JsonFormatter,
    _coerce,
    _resolve_request_id,
    configure_logging,
)


def _make_record(
    level: int = logging.INFO,
    msg: str = "test.event",
    extra: dict | None = None,
    exc_info=None,
) -> logging.LogRecord:
    record = logging.LogRecord(
        name="klassenzeit_backend.core.logging",
        level=level,
        pathname=__file__,
        lineno=10,
        msg=msg,
        args=(),
        exc_info=exc_info,
    )
    if extra:
        for key, value in extra.items():
            record.__dict__[key] = value
    return record


def test_json_formatter_emits_top_level_keys() -> None:
    record = _make_record()
    payload = json.loads(JsonFormatter().format(record))
    assert set(payload) >= {"ts", "level", "logger", "event"}
    assert payload["level"] == "INFO"
    assert payload["logger"] == "klassenzeit_backend.core.logging"
    assert payload["event"] == "test.event"
    assert payload["ts"].endswith("+00:00")


def test_json_formatter_merges_extra_payload() -> None:
    record = _make_record(extra={"a": 1, "b": "two"})
    payload = json.loads(JsonFormatter().format(record))
    assert payload["a"] == 1
    assert payload["b"] == "two"


def test_json_formatter_excludes_reserved_keys() -> None:
    record = _make_record()
    payload = json.loads(JsonFormatter().format(record))
    assert "pathname" not in payload
    assert "created" not in payload
    assert "msg" not in payload
    assert "args" not in payload


def test_json_formatter_serialises_uuid_via_str_fallback() -> None:
    uid = uuid4()
    record = _make_record(extra={"id": uid})
    payload = json.loads(JsonFormatter().format(record))
    assert payload["id"] == str(uid)
    assert UUID(payload["id"]) == uid


def test_json_formatter_includes_exc_info_on_error() -> None:
    try:
        raise RuntimeError("boom")
    except RuntimeError:
        import sys

        record = _make_record(level=logging.ERROR, msg="solver.fail", exc_info=sys.exc_info())
    payload = json.loads(JsonFormatter().format(record))
    assert payload["exc_class"] == "RuntimeError"
    assert payload["exc_message"] == "boom"
    assert "Traceback" in payload["exc_stack"]


def test_coerce_returns_jsonable_values_unchanged() -> None:
    assert _coerce(1) == 1
    assert _coerce("x") == "x"
    assert _coerce([1, 2, 3]) == [1, 2, 3]


def test_coerce_falls_back_to_str_for_non_jsonable() -> None:
    uid = uuid4()
    assert _coerce(uid) == str(uid)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
mise run test:py -- backend/tests/core/test_logging.py -v
```

Expected: collection failure (`ImportError: cannot import name 'JsonFormatter' from 'klassenzeit_backend.core.logging'`).

- [ ] **Step 3: Create the module with the formatter**

Create `backend/src/klassenzeit_backend/core/logging.py`:

```python
"""Structured logging configuration for the backend.

`configure_logging` installs a JSON formatter (or a plain-text formatter) on
the root stream handler, scoped to a single call per process via an
idempotency guard. Existing `logger.info("event.name", extra={...})` call
sites stay untouched; their `extra` payload is merged into the JSON record
at top level by `JsonFormatter`.
"""

from __future__ import annotations

import json
import logging
import sys
import traceback
import uuid
from datetime import UTC, datetime
from typing import Any, Final, Literal

# LogRecord built-in attributes; everything else on record.__dict__ came
# from the caller's extra= dict and gets merged into the output payload.
_RESERVED: Final[frozenset[str]] = frozenset(
    {
        "name",
        "msg",
        "args",
        "levelname",
        "levelno",
        "pathname",
        "filename",
        "module",
        "exc_info",
        "exc_text",
        "stack_info",
        "lineno",
        "funcName",
        "created",
        "msecs",
        "relativeCreated",
        "thread",
        "threadName",
        "processName",
        "process",
        "message",
        "taskName",
        "asctime",
    }
)

_REQUEST_ID_MAX_LEN: Final[int] = 64


def _coerce(value: Any) -> Any:
    """Best-effort coerce a non-JSON-serialisable value to a string."""
    try:
        json.dumps(value)
    except TypeError:
        return str(value)
    return value


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


def _resolve_request_id(inbound: str | None) -> str:
    """Return a usable request id from an inbound header value, or generate one."""
    if inbound is None:
        return uuid.uuid4().hex
    if len(inbound) == 0 or len(inbound) > _REQUEST_ID_MAX_LEN:
        return uuid.uuid4().hex
    return inbound


_configured: bool = False


def configure_logging(
    *,
    env: Literal["dev", "test", "prod"],
    log_format: Literal["text", "json"] | None,
    log_level: str,
) -> None:
    """Idempotently install the chosen formatter on a single stream handler.

    `log_format=None` resolves to `"json"` when `env == "prod"`, else
    `"text"`. Subsequent calls in the same process are no-ops so test
    fixtures that rebuild the FastAPI app do not stack handlers.
    """
    global _configured
    if _configured:
        return
    resolved: Literal["text", "json"] = log_format or (
        "json" if env == "prod" else "text"
    )
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

- [ ] **Step 4: Run tests to verify they pass**

```bash
mise run test:py -- backend/tests/core/test_logging.py -v
```

Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/klassenzeit_backend/core/logging.py backend/tests/core/test_logging.py
git commit -m "feat(backend): add JsonFormatter and configure_logging"
```

---

## Task 2: `configure_logging` idempotency + override coverage

**Files:**
- Modify: `backend/tests/core/test_logging.py`

- [ ] **Step 1: Append the configuration tests**

Append to `backend/tests/core/test_logging.py`:

```python
@pytest.fixture(autouse=True)
def _reset_configured_flag(monkeypatch: pytest.MonkeyPatch) -> None:
    """Reset the module-level idempotency guard before each test in this file."""
    import klassenzeit_backend.core.logging as logging_module

    monkeypatch.setattr(logging_module, "_configured", False)


def test_configure_logging_is_idempotent() -> None:
    configure_logging(env="dev", log_format="text", log_level="INFO")
    handlers_after_first = list(logging.getLogger().handlers)
    configure_logging(env="dev", log_format="text", log_level="INFO")
    handlers_after_second = list(logging.getLogger().handlers)
    assert handlers_after_first == handlers_after_second
    assert len(handlers_after_second) == 1


def test_configure_logging_resolves_default_format_per_env() -> None:
    configure_logging(env="prod", log_format=None, log_level="INFO")
    handler = logging.getLogger().handlers[0]
    assert isinstance(handler.formatter, JsonFormatter)


def test_configure_logging_dev_default_uses_text_formatter() -> None:
    configure_logging(env="dev", log_format=None, log_level="INFO")
    handler = logging.getLogger().handlers[0]
    assert not isinstance(handler.formatter, JsonFormatter)


def test_configure_logging_explicit_text_overrides_prod_default() -> None:
    configure_logging(env="prod", log_format="text", log_level="INFO")
    handler = logging.getLogger().handlers[0]
    assert not isinstance(handler.formatter, JsonFormatter)


def test_configure_logging_sets_root_and_namespace_levels() -> None:
    configure_logging(env="dev", log_format="text", log_level="DEBUG")
    assert logging.getLogger().level == logging.DEBUG
    assert logging.getLogger("klassenzeit_backend").level == logging.DEBUG


def test_resolve_request_id_passes_valid_inbound_through() -> None:
    assert _resolve_request_id("abc123") == "abc123"


def test_resolve_request_id_generates_when_missing() -> None:
    rid = _resolve_request_id(None)
    assert len(rid) == 32
    UUID(rid)


def test_resolve_request_id_regenerates_on_oversized_inbound() -> None:
    rid = _resolve_request_id("x" * 100)
    assert rid != "x" * 100
    assert len(rid) == 32


def test_resolve_request_id_regenerates_on_empty_inbound() -> None:
    rid = _resolve_request_id("")
    assert len(rid) == 32
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
mise run test:py -- backend/tests/core/test_logging.py -v
```

Expected: all 16 tests pass (7 from Task 1 + 9 here).

- [ ] **Step 3: Commit**

```bash
git add backend/tests/core/test_logging.py
git commit -m "test(backend): cover configure_logging idempotency and request-id resolver"
```

---

## Task 3: Settings additions

**Files:**
- Modify: `backend/src/klassenzeit_backend/core/settings.py`
- Modify: `backend/tests/core/test_settings.py`

- [ ] **Step 1: Inspect the existing settings test for the patterns used**

```bash
sed -n '1,50p' backend/tests/core/test_settings.py
```

Note the env-overriding fixture style (likely `monkeypatch.setenv`).

- [ ] **Step 2: Append failing tests for the new fields**

Append to `backend/tests/core/test_settings.py`:

```python
def test_settings_log_format_defaults_to_none(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("KZ_DATABASE_URL", "postgresql://x:y@h/db")
    monkeypatch.delenv("KZ_LOG_FORMAT", raising=False)
    get_settings.cache_clear()
    settings = get_settings()
    assert settings.log_format is None


def test_settings_log_format_accepts_json(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("KZ_DATABASE_URL", "postgresql://x:y@h/db")
    monkeypatch.setenv("KZ_LOG_FORMAT", "json")
    get_settings.cache_clear()
    settings = get_settings()
    assert settings.log_format == "json"


def test_settings_log_format_accepts_text(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("KZ_DATABASE_URL", "postgresql://x:y@h/db")
    monkeypatch.setenv("KZ_LOG_FORMAT", "text")
    get_settings.cache_clear()
    settings = get_settings()
    assert settings.log_format == "text"


def test_settings_log_level_defaults_to_info(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("KZ_DATABASE_URL", "postgresql://x:y@h/db")
    monkeypatch.delenv("KZ_LOG_LEVEL", raising=False)
    get_settings.cache_clear()
    settings = get_settings()
    assert settings.log_level == "INFO"


def test_settings_log_level_overrides(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("KZ_DATABASE_URL", "postgresql://x:y@h/db")
    monkeypatch.setenv("KZ_LOG_LEVEL", "DEBUG")
    get_settings.cache_clear()
    settings = get_settings()
    assert settings.log_level == "DEBUG"
```

If `pytest`, `get_settings`, and the env-override pattern are imported differently from the existing file, adapt to match — do not invent. Read `backend/tests/core/test_settings.py` head before appending.

- [ ] **Step 3: Run tests to verify they fail**

```bash
mise run test:py -- backend/tests/core/test_settings.py -v
```

Expected: the five new tests fail with `AttributeError: 'Settings' object has no attribute 'log_format'` (or similar).

- [ ] **Step 4: Add the settings fields**

In `backend/src/klassenzeit_backend/core/settings.py`, after the `login_lockout_minutes` field, before the `class Config` / blank trailing space, add:

```python
    # Logging
    log_format: Literal["text", "json"] | None = None
    log_level: str = "INFO"
```

The `Literal` import already exists in this file (verify via `rg "from typing import" backend/src/klassenzeit_backend/core/settings.py`); if it does not, add it.

- [ ] **Step 5: Run tests to verify they pass**

```bash
mise run test:py -- backend/tests/core/test_settings.py -v
```

Expected: all settings tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/src/klassenzeit_backend/core/settings.py backend/tests/core/test_settings.py
git commit -m "feat(backend): add log_format and log_level settings"
```

---

## Task 4: Wire `configure_logging` from `build_app`

**Files:**
- Modify: `backend/src/klassenzeit_backend/main.py`
- Modify: `backend/tests/test_main.py`

- [ ] **Step 1: Append a failing wiring test**

Append to `backend/tests/test_main.py`:

```python
def test_build_app_calls_configure_logging(monkeypatch: pytest.MonkeyPatch) -> None:
    """build_app(env=...) must call configure_logging before returning."""
    import pytest

    import klassenzeit_backend.core.logging as logging_module
    import klassenzeit_backend.main as main_module

    calls: list[dict] = []

    def fake_configure_logging(**kwargs: object) -> None:
        calls.append(kwargs)

    monkeypatch.setattr(main_module, "configure_logging", fake_configure_logging)
    monkeypatch.setattr(logging_module, "_configured", False)

    main_module.build_app(env="dev")
    assert len(calls) == 1
    assert calls[0]["env"] == "dev"
    assert "log_format" in calls[0]
    assert "log_level" in calls[0]
```

Add the `import pytest` at the top of `backend/tests/test_main.py` if not already present.

- [ ] **Step 2: Run test to verify it fails**

```bash
mise run test:py -- backend/tests/test_main.py::test_build_app_calls_configure_logging -v
```

Expected: `AttributeError: module 'klassenzeit_backend.main' has no attribute 'configure_logging'`.

- [ ] **Step 3: Wire `configure_logging` into `build_app`**

In `backend/src/klassenzeit_backend/main.py`, replace the imports block top-of-file with:

```python
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from sqlalchemy.ext.asyncio import async_sessionmaker

from klassenzeit_backend.auth.rate_limit import LoginRateLimiter
from klassenzeit_backend.auth.routes import auth_router
from klassenzeit_backend.core.logging import configure_logging
from klassenzeit_backend.core.settings import get_settings
from klassenzeit_backend.db.engine import build_engine
from klassenzeit_backend.scheduling.routes import scheduling_router
from klassenzeit_backend.testing.mount import include_testing_router_if_enabled
```

Then, inside `build_app(env)`, before the `new_app = FastAPI(...)` line, add:

```python
    settings = get_settings()
    configure_logging(
        env=settings.env,
        log_format=settings.log_format,
        log_level=settings.log_level,
    )
```

The `env` parameter passed to `build_app` and `settings.env` may differ in pathological cases (only when callers pass an explicit `env` while `KZ_ENV` is set to something else); we still defer to `settings.env` because that is the value the rest of the app reads.

- [ ] **Step 4: Run test to verify it passes**

```bash
mise run test:py -- backend/tests/test_main.py -v
```

Expected: all main tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/klassenzeit_backend/main.py backend/tests/test_main.py
git commit -m "feat(backend): wire configure_logging from build_app"
```

---

## Task 5: `http.request` access middleware

**Files:**
- Modify: `backend/src/klassenzeit_backend/main.py`
- Create: `backend/tests/test_http_access_middleware.py`

- [ ] **Step 1: Write the failing middleware tests**

Create `backend/tests/test_http_access_middleware.py`:

```python
"""Tests for the http.request access middleware in main.build_app."""

import logging
import re

import pytest
from httpx import ASGITransport, AsyncClient

from klassenzeit_backend.main import build_app


async def test_access_middleware_emits_http_request_event(
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.INFO, logger="klassenzeit_backend.http.access")
    app = build_app(env="dev")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/health")

    assert response.status_code == 200
    records = [
        r for r in caplog.records if r.name == "klassenzeit_backend.http.access"
    ]
    assert len(records) == 1
    record = records[0]
    assert record.message == "http.request"
    assert record.__dict__["method"] == "GET"
    assert record.__dict__["path"] == "/api/health"
    assert record.__dict__["status"] == 200
    assert isinstance(record.__dict__["duration_ms"], float)
    assert record.__dict__["duration_ms"] >= 0.0
    assert isinstance(record.__dict__["request_id"], str)
    assert len(record.__dict__["request_id"]) > 0


async def test_access_middleware_propagates_inbound_request_id(
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.INFO, logger="klassenzeit_backend.http.access")
    app = build_app(env="dev")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            "/api/health", headers={"X-Request-ID": "client-corr-1"}
        )

    assert response.headers["X-Request-ID"] == "client-corr-1"
    record = next(
        r for r in caplog.records if r.name == "klassenzeit_backend.http.access"
    )
    assert record.__dict__["request_id"] == "client-corr-1"


async def test_access_middleware_generates_request_id_on_absence(
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.INFO, logger="klassenzeit_backend.http.access")
    app = build_app(env="dev")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/health")

    rid = response.headers["X-Request-ID"]
    assert re.fullmatch(r"[0-9a-f]{32}", rid) is not None
    record = next(
        r for r in caplog.records if r.name == "klassenzeit_backend.http.access"
    )
    assert record.__dict__["request_id"] == rid


async def test_access_middleware_caps_oversized_request_id(
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.INFO, logger="klassenzeit_backend.http.access")
    app = build_app(env="dev")
    transport = ASGITransport(app=app)
    oversized = "x" * 100
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            "/api/health", headers={"X-Request-ID": oversized}
        )

    rid = response.headers["X-Request-ID"]
    assert rid != oversized
    assert re.fullmatch(r"[0-9a-f]{32}", rid) is not None
    record = next(
        r for r in caplog.records if r.name == "klassenzeit_backend.http.access"
    )
    assert record.__dict__["request_id"] == rid


async def test_access_middleware_records_duration_under_one_second_for_health_check(
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.INFO, logger="klassenzeit_backend.http.access")
    app = build_app(env="dev")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.get("/api/health")

    record = next(
        r for r in caplog.records if r.name == "klassenzeit_backend.http.access"
    )
    assert 0.0 <= record.__dict__["duration_ms"] < 1000.0
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
mise run test:py -- backend/tests/test_http_access_middleware.py -v
```

Expected: all five tests fail (no `http.request` log record captured because the middleware does not exist yet).

- [ ] **Step 3: Add the middleware**

In `backend/src/klassenzeit_backend/main.py`, replace the `import os` line at the top with:

```python
import logging
import os
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
```

Then add an import for `_resolve_request_id`:

```python
from klassenzeit_backend.core.logging import configure_logging
```

becomes

```python
from klassenzeit_backend.core.logging import _resolve_request_id, configure_logging
```

Also import `Request` and `Response` from FastAPI:

```python
from fastapi import APIRouter, FastAPI, Request, Response
```

Add a module-level access logger after the imports:

```python
_ACCESS_LOGGER = logging.getLogger("klassenzeit_backend.http.access")
```

Inside `build_app`, after `include_testing_router_if_enabled(new_app, env)` and before `return new_app`, add:

```python
    @new_app.middleware("http")
    async def log_http_request(request: Request, call_next):  # type: ignore[no-untyped-def]
        request_id = _resolve_request_id(request.headers.get("x-request-id"))
        request.state.request_id = request_id
        started = time.monotonic()
        response: Response = await call_next(request)
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

If `ty` complains about the `# type: ignore[no-untyped-def]` pragma (recall: `ty` does not honor `# type: ignore`), drop the pragma and instead annotate `call_next` properly: `from typing import Awaitable, Callable` and `call_next: Callable[[Request], Awaitable[Response]]`.

- [ ] **Step 4: Run tests to verify they pass**

```bash
mise run test:py -- backend/tests/test_http_access_middleware.py -v
```

Expected: all 5 tests pass.

- [ ] **Step 5: Run the broader suite to ensure no regression**

```bash
mise run test:py -- backend/tests/test_health.py backend/tests/test_main.py backend/tests/scheduling/test_solver_io.py -v
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/src/klassenzeit_backend/main.py backend/tests/test_http_access_middleware.py
git commit -m "feat(backend): emit http.request structured access log"
```

---

## Task 6: ADR 0016

**Files:**
- Create: `docs/adr/0016-structured-logging.md`
- Modify: `docs/adr/README.md`

- [ ] **Step 1: Verify the next ADR number is 0016**

```bash
ls docs/adr/*.md | sort | tail -5
```

Expected: highest existing is `0015-solver-lahc-stochastic-search.md`. If a different ADR has landed since this plan was written, advance the number and the filename accordingly.

- [ ] **Step 2: Write the ADR**

Create `docs/adr/0016-structured-logging.md`:

```markdown
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
- Schema changes (renaming a top-level key like `event` → `message`) ripple through every consumer. Pin `event` as the canonical key.

When to revisit:
- A log shipper requires a specific field schema (GCP `severity`, ECS `log.level`). Add a rename-mapping option to `JsonFormatter`.
- A new call site needs request-scoped correlation without re-passing `request_id` everywhere. Add the contextvar filter then.
- Body / size logging or PII redaction is requested. Land it as a separate concern with an explicit privacy review.
```

- [ ] **Step 3: Index the ADR**

In `docs/adr/README.md`, append after the line for `0015-solver-lahc-stochastic-search.md`:

```markdown
- [0016: structured logging across the backend](0016-structured-logging.md)
```

If `README.md` uses a different format for the index (numbered list, table), match that format. Read the current state first.

- [ ] **Step 4: Run lint to confirm the markdown passes**

```bash
mise run lint
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add docs/adr/0016-structured-logging.md docs/adr/README.md
git commit -m "docs(adr): record structured-logging library and schema choice"
```

---

## Task 7: OPEN_THINGS housekeeping

**Files:**
- Modify: `docs/superpowers/OPEN_THINGS.md`

- [ ] **Step 1: Replace the existing structured-logging entry**

In `docs/superpowers/OPEN_THINGS.md`, find the bullet under "Toolchain & build friction" that reads:

> **Structured logging (rest of backend).** The prototype sprint wraps the solver boundary with `logger.info` calls; broader JSON logging across the FastAPI app and test output still needs a library choice, a schema, and wiring. `solver-py` logging gets the same treatment once the Rust worker is real.

Replace it with:

```markdown
- **Structured logging follow-ups.** ✅ JSON formatter + `http.request` middleware shipped 2026-04-28 (ADR 0016). Remaining items: (a) `contextvars`-based request_id propagation so any in-request `logger.info` automatically carries the request_id without re-passing; (b) replace or mute uvicorn's `--access-log` so production emits one access line per request, not two; (c) request / response body or `Content-Length` logging (needs PII review); (d) GCP / ECS / CloudWatch field renames once a log shipper is wired; (e) `solver-py` Rust-side structured logging once the Rust worker is real; (f) instrumenting CRUD route handlers on success and error.
```

- [ ] **Step 2: Run lint**

```bash
mise run lint
```

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/OPEN_THINGS.md
git commit -m "docs: track structured-logging follow-ups in OPEN_THINGS"
```

---

## Task 8: Full suite and manual verification

**Files:** none (verification step).

- [ ] **Step 1: Full lint + test sweep**

```bash
mise run lint && mise run test:py
```

Expected: both green.

- [ ] **Step 2: Manual JSON sanity check**

```bash
KZ_LOG_FORMAT=json KZ_ENV=dev mise run dev
```

In a second terminal:

```bash
curl -s http://localhost:8000/api/health | jq
```

The dev terminal should print one JSON line ending with `"event": "http.request"`, `"path": "/api/health"`, `"status": 200`. Confirm `X-Request-ID` is in the response by:

```bash
curl -i http://localhost:8000/api/health 2>&1 | grep -i x-request-id
```

Expected: `X-Request-ID: <32-char hex>` in the response.

- [ ] **Step 3: Manual text-mode sanity check**

Restart `mise run dev` without `KZ_LOG_FORMAT`. The terminal should print human-readable text (the existing format we have today) for the `http.request` event.

- [ ] **Step 4: Stop the dev server**

```bash
# Ctrl-C
```

No commit for this task; verification only.

---

## Self-review (run before pushing)

- **Spec coverage check.** Spec sections vs. tasks:
  - Settings additions → Task 3
  - `core/logging.py` (`JsonFormatter`, `configure_logging`, `_coerce`, `_resolve_request_id`) → Tasks 1, 2
  - `main.py` integration (`configure_logging` call + middleware) → Tasks 4, 5
  - Tests for both new modules → Tasks 1, 2, 5
  - ADR 0016 → Task 6
  - OPEN_THINGS housekeeping → Task 7
  - Manual verification commands → Task 8
- **Placeholder scan.** No "TBD", "implement later", or "similar to Task N" — all code blocks are concrete.
- **Type consistency.** `_resolve_request_id` signature, `JsonFormatter.format` shape, `configure_logging` keyword args match across all tests and the implementation.
