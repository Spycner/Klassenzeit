"""Smoke tests for the klassenzeit_solver PyO3 bindings.

These tests assert the binding contract (types, values, error propagation),
not solver logic. Solver logic is tested in Rust via solver-core.
"""

from klassenzeit_solver import reverse_chars


def test_reverse_chars_basic() -> None:
    assert reverse_chars("hello") == "olleh"


def test_reverse_chars_empty() -> None:
    assert reverse_chars("") == ""


def test_reverse_chars_unicode() -> None:
    assert reverse_chars("äöü") == "üöä"


def test_reverse_chars_returns_str() -> None:
    assert isinstance(reverse_chars("abc"), str)
