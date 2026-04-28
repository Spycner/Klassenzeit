"""Tests for klassenzeit_backend.core.logging."""

import json
import logging
import sys
from uuid import UUID, uuid4

import pytest  # noqa: F401  # used by Task 2 fixtures (MonkeyPatch)

from klassenzeit_backend.core.logging import (
    JsonFormatter,
    _coerce,
    _resolve_request_id,  # noqa: F401  # used by Task 2 tests
    configure_logging,  # noqa: F401  # used by Task 2 tests
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
