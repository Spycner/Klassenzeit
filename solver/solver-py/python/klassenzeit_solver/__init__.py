"""Python bindings for the Klassenzeit constraint solver."""

from ._rust import solve_json

__all__ = ["solve_json"]
