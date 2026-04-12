"""Lint check: detect duplicate function names across Python, Rust, and JS/TS.

Walks the repo and extracts function/method names using ast (Python) and
regex (Rust, JS/TS). Reports any name that appears in two or more locations.
Exits 0 if clean, 1 if duplicates found.

Limitations:
- Rust/JS/TS extraction is regex-based and may false-positive on names
  inside string literals or comments.
- JS/TS does not detect arrow functions assigned to variables.
"""

from __future__ import annotations

import ast
import re
import sys
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Location:
    """A function name tied to a file path and line number."""

    name: str
    file: str
    line: int


EXCLUDE_DIRS = frozenset(
    {
        "node_modules",
        "target",
        ".venv",
        "__pycache__",
        "alembic",
        ".git",
        ".worktrees",
    }
)


def extract_python_names(tree: ast.AST, file_path: str) -> list[Location]:
    """Extract non-dunder function and method names from a Python AST."""
    results: list[Location] = []
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            name = node.name
            if name.startswith("__") and name.endswith("__"):
                continue
            results.append(Location(name, file_path, node.lineno))
    return results


_RUST_FN_RE = re.compile(r"^\s*(?:pub\s+)?(?:async\s+)?fn\s+(\w+)")


def extract_rust_names(lines: list[str], file_path: str) -> list[Location]:
    """Extract function names from Rust source lines via regex."""
    results: list[Location] = []
    for lineno, line in enumerate(lines, start=1):
        match = _RUST_FN_RE.match(line)
        if match:
            name = match.group(1)
            if name == "main":
                continue
            results.append(Location(name, file_path, lineno))
    return results


_JS_FUNCTION_RE = re.compile(r"^\s*(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s+(\w+)")
_JS_METHOD_RE = re.compile(r"^\s+(?:async\s+)?(\w+)\s*\(")
_JS_SKIP_KEYWORDS = frozenset(
    {
        "if",
        "for",
        "while",
        "switch",
        "catch",
        "return",
        "throw",
        "new",
        "await",
        "typeof",
        "instanceof",
        "delete",
        "void",
        "class",
        "const",
        "let",
        "var",
        "import",
        "export",
        "from",
        "super",
        "this",
    }
)


def extract_js_ts_names(lines: list[str], file_path: str) -> list[Location]:
    """Extract function and method names from JS/TS source lines via regex."""
    results: list[Location] = []
    for lineno, line in enumerate(lines, start=1):
        match = _JS_FUNCTION_RE.match(line)
        if match:
            results.append(Location(match.group(1), file_path, lineno))
            continue
        match = _JS_METHOD_RE.match(line)
        if match:
            name = match.group(1)
            if name not in _JS_SKIP_KEYWORDS:
                results.append(Location(name, file_path, lineno))
    return results


def find_duplicates(locations: list[Location]) -> dict[str, list[Location]]:
    """Return names that appear in two or more locations."""
    by_name: dict[str, list[Location]] = defaultdict(list)
    for loc in locations:
        by_name[loc.name].append(loc)
    return {name: locs for name, locs in by_name.items() if len(locs) > 1}


def collect_all_names(root: Path) -> list[Location]:
    """Walk the repo and extract function names from all supported languages."""
    all_locations: list[Location] = []
    for path in sorted(root.rglob("*")):
        if any(part in EXCLUDE_DIRS for part in path.parts):
            continue
        if not path.is_file():
            continue
        rel = str(path.relative_to(root))
        if path.suffix == ".py":
            try:
                tree = ast.parse(path.read_text(encoding="utf-8"))
            except SyntaxError:
                continue
            all_locations.extend(extract_python_names(tree, rel))
        elif path.suffix == ".rs":
            lines = path.read_text(encoding="utf-8").splitlines()
            all_locations.extend(extract_rust_names(lines, rel))
        elif path.suffix in {".js", ".ts", ".tsx"}:
            lines = path.read_text(encoding="utf-8").splitlines()
            all_locations.extend(extract_js_ts_names(lines, rel))
    return all_locations


def main() -> int:
    """Run the duplicate function name check and print results."""
    root = Path(__file__).resolve().parent.parent
    locations = collect_all_names(root)
    duplicates = find_duplicates(locations)
    if not duplicates:
        return 0
    for name, locs in sorted(duplicates.items()):
        print(f"Duplicate function name '{name}' found in:")
        for loc in sorted(locs, key=lambda loc: (loc.file, loc.line)):
            print(f"  {loc.file}:{loc.line}")
        print()
    print(f"Found {len(duplicates)} duplicate function name(s)")
    return 1


if __name__ == "__main__":
    sys.exit(main())
