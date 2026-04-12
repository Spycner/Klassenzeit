# Unique Function Names Lint Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a cross-language lint script that detects duplicate function names across Python, Rust, and JS/TS files.

**Architecture:** A single stdlib-only Python script (`scripts/check_unique_fns.py`) walks the repo, extracts function names using `ast` (Python) and regex (Rust, JS/TS), collects them into one global set, and reports duplicates. Integrated into `mise run lint:py`.

**Tech Stack:** Python stdlib (`ast`, `re`, `pathlib`), mise task runner.

---

### Task 1: Create the script with Python extraction and a test

**Files:**
- Create: `scripts/check_unique_fns.py`
- Create: `scripts/tests/test_check_unique_fns.py`

- [ ] **Step 1: Write the test file**

Create `scripts/tests/__init__.py` (empty) and `scripts/tests/test_check_unique_fns.py`:

```python
"""Tests for the unique function names lint script."""

import ast
import textwrap

from scripts.check_unique_fns import extract_python_names, Location


def test_extract_python_function():
    """Verify a simple function is extracted."""
    source = textwrap.dedent("""\
        def greet():
            pass
    """)
    tree = ast.parse(source)
    results = extract_python_names(tree, "test.py")
    assert results == [Location("greet", "test.py", 1)]


def test_extract_python_async_function():
    """Verify async functions are extracted."""
    source = textwrap.dedent("""\
        async def fetch_data():
            pass
    """)
    tree = ast.parse(source)
    results = extract_python_names(tree, "test.py")
    assert results == [Location("fetch_data", "test.py", 1)]


def test_extract_python_class_method():
    """Verify class methods are extracted."""
    source = textwrap.dedent("""\
        class Foo:
            def bar(self):
                pass
    """)
    tree = ast.parse(source)
    results = extract_python_names(tree, "test.py")
    assert results == [Location("bar", "test.py", 3)]


def test_extract_python_skips_dunders():
    """Verify dunder methods are skipped."""
    source = textwrap.dedent("""\
        class Foo:
            def __init__(self):
                pass
            def __str__(self):
                pass
            def real_method(self):
                pass
    """)
    tree = ast.parse(source)
    results = extract_python_names(tree, "test.py")
    assert len(results) == 1
    assert results[0].name == "real_method"


def test_extract_python_nested_function():
    """Verify nested functions are extracted."""
    source = textwrap.dedent("""\
        def outer():
            def inner():
                pass
    """)
    tree = ast.parse(source)
    results = extract_python_names(tree, "test.py")
    names = [loc.name for loc in results]
    assert "outer" in names
    assert "inner" in names
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run pytest scripts/tests/test_check_unique_fns.py -v`

Expected: FAIL — `ModuleNotFoundError: No module named 'scripts.check_unique_fns'`

- [ ] **Step 3: Create the script with Python extraction**

Create `scripts/__init__.py` (empty) and `scripts/check_unique_fns.py`:

```python
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
import sys
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Location:
    """A function name tied to a file path and line number."""

    name: str
    file: str
    line: int


EXCLUDE_DIRS = frozenset({
    "node_modules",
    "target",
    ".venv",
    "__pycache__",
    "alembic",
    ".git",
    ".worktrees",
})


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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `uv run pytest scripts/tests/test_check_unique_fns.py -v`

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/__init__.py scripts/check_unique_fns.py scripts/tests/__init__.py scripts/tests/test_check_unique_fns.py
git commit -m "feat: add unique function name checker with Python extraction"
```

---

### Task 2: Add Rust extraction

**Files:**
- Modify: `scripts/check_unique_fns.py`
- Modify: `scripts/tests/test_check_unique_fns.py`

- [ ] **Step 1: Add Rust extraction tests**

Append to `scripts/tests/test_check_unique_fns.py`:

```python
from scripts.check_unique_fns import extract_rust_names


def test_extract_rust_pub_fn():
    """Verify public Rust functions are extracted."""
    lines = [
        "pub fn reverse_chars(s: &str) -> String {",
        "    s.chars().rev().collect()",
        "}",
    ]
    results = extract_rust_names(lines, "lib.rs")
    assert results == [Location("reverse_chars", "lib.rs", 1)]


def test_extract_rust_private_fn():
    """Verify private Rust functions are extracted."""
    lines = ["fn helper() -> bool {"]
    results = extract_rust_names(lines, "lib.rs")
    assert results == [Location("helper", "lib.rs", 1)]


def test_extract_rust_skips_main():
    """Verify Rust main() is skipped."""
    lines = ["fn main() {"]
    results = extract_rust_names(lines, "main.rs")
    assert results == []


def test_extract_rust_test_fn():
    """Verify Rust test functions are extracted (not skipped)."""
    lines = [
        "#[cfg(test)]",
        "mod tests {",
        "    #[test]",
        "    fn reverses_hello() {",
        "    }",
        "}",
    ]
    results = extract_rust_names(lines, "lib.rs")
    assert results == [Location("reverses_hello", "lib.rs", 4)]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest scripts/tests/test_check_unique_fns.py::test_extract_rust_pub_fn -v`

Expected: FAIL — `ImportError: cannot import name 'extract_rust_names'`

- [ ] **Step 3: Implement Rust extraction**

Add to `scripts/check_unique_fns.py`, after the Python extraction function:

```python
import re

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
```

Note: move the `import re` to the top of the file with the other imports.

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest scripts/tests/test_check_unique_fns.py -v`

Expected: all 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/check_unique_fns.py scripts/tests/test_check_unique_fns.py
git commit -m "feat: add Rust function name extraction to unique-fns checker"
```

---

### Task 3: Add JS/TS extraction

**Files:**
- Modify: `scripts/check_unique_fns.py`
- Modify: `scripts/tests/test_check_unique_fns.py`

- [ ] **Step 1: Add JS/TS extraction tests**

Append to `scripts/tests/test_check_unique_fns.py`:

```python
from scripts.check_unique_fns import extract_js_ts_names


def test_extract_js_function_declaration():
    """Verify JS function declarations are extracted."""
    lines = ["function fetchData() {"]
    results = extract_js_ts_names(lines, "api.ts")
    assert results == [Location("fetchData", "api.ts", 1)]


def test_extract_js_export_function():
    """Verify exported function declarations are extracted."""
    lines = ["export function handleSubmit(event) {"]
    results = extract_js_ts_names(lines, "form.ts")
    assert results == [Location("handleSubmit", "form.ts", 1)]


def test_extract_js_export_default_function():
    """Verify export default function declarations are extracted."""
    lines = ["export default function HomePage() {"]
    results = extract_js_ts_names(lines, "page.tsx")
    assert results == [Location("HomePage", "page.tsx", 1)]


def test_extract_js_async_function():
    """Verify async function declarations are extracted."""
    lines = ["async function loadUser() {"]
    results = extract_js_ts_names(lines, "user.ts")
    assert results == [Location("loadUser", "user.ts", 1)]


def test_extract_js_class_method():
    """Verify class method definitions are extracted."""
    lines = [
        "class UserService {",
        "  async getUserById(id) {",
        "  }",
        "}",
    ]
    results = extract_js_ts_names(lines, "service.ts")
    assert results == [Location("getUserById", "service.ts", 2)]


def test_extract_js_skips_anonymous():
    """Verify anonymous/arrow functions are not extracted."""
    lines = [
        "const handler = () => {",
        "const process = function() {",
    ]
    results = extract_js_ts_names(lines, "util.ts")
    assert results == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest scripts/tests/test_check_unique_fns.py::test_extract_js_function_declaration -v`

Expected: FAIL — `ImportError: cannot import name 'extract_js_ts_names'`

- [ ] **Step 3: Implement JS/TS extraction**

Add to `scripts/check_unique_fns.py`:

```python
_JS_FUNCTION_RE = re.compile(
    r"^\s*(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s+(\w+)"
)
_JS_METHOD_RE = re.compile(
    r"^\s+(?:async\s+)?(\w+)\s*\("
)
_JS_SKIP_KEYWORDS = frozenset({
    "if", "for", "while", "switch", "catch", "return", "throw", "new",
    "await", "typeof", "instanceof", "delete", "void", "class", "const",
    "let", "var", "import", "export", "from", "super", "this",
})


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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest scripts/tests/test_check_unique_fns.py -v`

Expected: all 15 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/check_unique_fns.py scripts/tests/test_check_unique_fns.py
git commit -m "feat: add JS/TS function name extraction to unique-fns checker"
```

---

### Task 4: Add duplicate detection and CLI entry point

**Files:**
- Modify: `scripts/check_unique_fns.py`
- Modify: `scripts/tests/test_check_unique_fns.py`

- [ ] **Step 1: Add duplicate detection tests**

Append to `scripts/tests/test_check_unique_fns.py`:

```python
from scripts.check_unique_fns import find_duplicates


def test_find_duplicates_no_dupes():
    """Verify no duplicates returns empty dict."""
    locations = [
        Location("foo", "a.py", 1),
        Location("bar", "b.py", 2),
    ]
    assert find_duplicates(locations) == {}


def test_find_duplicates_cross_language():
    """Verify duplicates across languages are detected."""
    locations = [
        Location("get_session", "db/session.py", 19),
        Location("get_session", "api/session.ts", 12),
    ]
    result = find_duplicates(locations)
    assert "get_session" in result
    assert len(result["get_session"]) == 2


def test_find_duplicates_three_locations():
    """Verify a name appearing three times is reported with all locations."""
    locations = [
        Location("validate", "a.py", 1),
        Location("validate", "b.rs", 5),
        Location("validate", "c.ts", 10),
    ]
    result = find_duplicates(locations)
    assert len(result["validate"]) == 3
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest scripts/tests/test_check_unique_fns.py::test_find_duplicates_no_dupes -v`

Expected: FAIL — `ImportError: cannot import name 'find_duplicates'`

- [ ] **Step 3: Implement duplicate detection and CLI**

Add to `scripts/check_unique_fns.py`:

```python
from collections import defaultdict


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
        for loc in sorted(locs, key=lambda l: (l.file, l.line)):
            print(f"  {loc.file}:{loc.line}")
        print()

    print(f"Found {len(duplicates)} duplicate function name(s)")
    return 1


if __name__ == "__main__":
    sys.exit(main())
```

Move the `from collections import defaultdict` to the top of the file with other imports.

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest scripts/tests/test_check_unique_fns.py -v`

Expected: all 18 tests PASS.

- [ ] **Step 5: Run the script against the repo**

Run: `uv run python scripts/check_unique_fns.py`

Expected: the script reports `reverse_chars` as a duplicate (appears in both `solver/solver-core/src/lib.rs` and `solver/solver-py/src/lib.rs`). Exit code 1.

- [ ] **Step 6: Commit**

```bash
git add scripts/check_unique_fns.py scripts/tests/test_check_unique_fns.py
git commit -m "feat: add duplicate detection and CLI to unique-fns checker"
```

---

### Task 5: Fix the existing `reverse_chars` duplicate

**Files:**
- Modify: `solver/solver-py/src/lib.rs`
- Modify: `solver/solver-py/python/klassenzeit_solver/__init__.py`
- Modify: `solver/solver-py/tests/test_bindings.py`

The PyO3 wrapper in `solver-py` re-uses the name `reverse_chars` for its thin wrapper around `solver_core::reverse_chars`. Rename the wrapper to `py_reverse_chars` internally but keep the Python-facing name as `reverse_chars` using PyO3's `#[pyo3(name = "reverse_chars")]` attribute.

Actually — that would keep the Python-visible name as `reverse_chars` but the Rust `fn` would be `py_reverse_chars`, making it unique. However, the lint script extracts Rust fn names, so this solves the duplicate.

- [ ] **Step 1: Rename the wrapper function in solver-py**

Edit `solver/solver-py/src/lib.rs`. Change:

```rust
/// Reverse the characters in a string (PyO3 wrapper).
#[pyfunction]
fn reverse_chars(s: &str) -> String {
    solver_core::reverse_chars(s)
}
```

To:

```rust
/// Reverse the characters in a string (PyO3 wrapper).
#[pyfunction]
#[pyo3(name = "reverse_chars")]
fn py_reverse_chars(s: &str) -> String {
    solver_core::reverse_chars(s)
}
```

And update the module registration from `wrap_pyfunction!(reverse_chars, m)` to `wrap_pyfunction!(py_reverse_chars, m)`.

- [ ] **Step 2: Build and run Rust tests**

Run: `cargo clippy --workspace --all-targets -- -D warnings && cargo nextest run --workspace`

Expected: no warnings, all tests pass.

- [ ] **Step 3: Run Python tests to verify bindings still work**

Run: `uv run pytest solver/solver-py/tests/ -v`

Expected: all binding tests pass (the Python name `reverse_chars` is unchanged).

- [ ] **Step 4: Run the unique function names script**

Run: `uv run python scripts/check_unique_fns.py`

Expected: exit code 0, no duplicates found.

- [ ] **Step 5: Commit**

```bash
git add solver/solver-py/src/lib.rs
git commit -m "refactor: rename PyO3 wrapper fn to py_reverse_chars for global uniqueness"
```

---

### Task 6: Wire into mise lint pipeline and update OPEN_THINGS.md

**Files:**
- Modify: `mise.toml:151-158`
- Modify: `docs/superpowers/OPEN_THINGS.md`
- Modify: `pyproject.toml` (add scripts to testpaths)

- [ ] **Step 1: Add scripts/tests to pytest testpaths**

In `pyproject.toml`, update the testpaths line from:

```toml
testpaths    = ["backend/tests", "solver/solver-py/tests"]
```

To:

```toml
testpaths    = ["backend/tests", "solver/solver-py/tests", "scripts/tests"]
```

- [ ] **Step 2: Verify the new test path works**

Run: `uv run pytest scripts/tests/ -v`

Expected: all 18 tests pass.

- [ ] **Step 3: Add script to lint:py task**

In `mise.toml`, add `"uv run python scripts/check_unique_fns.py"` to the `[tasks."lint:py"]` run list:

```toml
[tasks."lint:py"]
description = "Lint, format-check, type-check, and dead-code scan Python"
run = [
  "uv run ruff check",
  "uv run ruff format --check",
  "uv run ty check",
  "uv run vulture backend/src",
  "uv run python scripts/check_unique_fns.py",
]
```

- [ ] **Step 4: Run full lint to verify integration**

Run: `mise run lint`

Expected: all linters pass, including the new unique function names check (exit code 0).

- [ ] **Step 5: Remove the item from OPEN_THINGS.md**

In `docs/superpowers/OPEN_THINGS.md`, remove the entire `## Linting & code quality` section (lines 42-44):

```markdown
## Linting & code quality

- **Unique function name enforcement.** The coding standard requires globally unique function names but there is no automated check. Add an AST-based Python script (stdlib only) that walks all `.py` source files and flags duplicate `def` names; pair with a grep-based pass for Rust `fn` names. Wire into `mise run lint` or a Lefthook pre-commit hook so violations are caught before they land.
```

- [ ] **Step 6: Run full test suite**

Run: `mise run test`

Expected: all tests pass (78 backend + 4 Rust + 18 script tests = 100 total... though pytest might report a different number depending on collection).

- [ ] **Step 7: Commit**

```bash
git add mise.toml pyproject.toml docs/superpowers/OPEN_THINGS.md
git commit -m "build: wire unique function names checker into lint pipeline"
```

---

### Task 7: Full verification

- [ ] **Step 1: Run full lint suite**

Run: `mise run lint`

Expected: all checks pass.

- [ ] **Step 2: Run full test suite**

Run: `mise run test`

Expected: all tests pass.

- [ ] **Step 3: Run the script standalone**

Run: `uv run python scripts/check_unique_fns.py && echo "PASS" || echo "FAIL"`

Expected: `PASS` (exit code 0, no duplicates).
