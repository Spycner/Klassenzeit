"""Python bindings for the Klassenzeit constraint solver."""

from ._rust import solve_json, solve_json_with_config

__all__ = ["solve_json", "solve_json_with_config"]
