"""Lint check: useEffect derived-state sync anti-pattern.

Frontend rule (frontend/CLAUDE.md > Hooks and state):

    No `useEffect` for derived state. Compute during render. For syncing to
    props, use `key` to remount or derive inline.

This script flags `useEffect` calls whose body is a single `setX(...)` call
(arrow expression body or arrow block body with a single statement) and whose
deps array is non-empty. The mount-gate exception (`useEffect(() => setX(true),
[])`) is allowed because the documented anti-pattern is specifically about
deriving state from non-empty deps.

Limitations (intentional narrowing, document for future widening):

- Multi-statement effect bodies are NOT flagged. If a future violation slips in
  with `useEffect(() => { setA(x); setB(y); }, [x, y])`, widen `_BLOCK_BODY_RE`
  to allow multiple statements before the closing brace and add the matching
  test fixture.
- The matcher is regex-based on whitespace-normalized source; it does not parse
  TS/JSX. False positives are mitigated by requiring the called identifier to
  match `^set[A-Z][A-Za-z0-9_]*$`, which excludes plain functions like
  `setupSomething(value)` and `setLocalStorage(key, value)`.

Exits 0 if clean, 1 if violations found.
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
FRONTEND_SRC = REPO_ROOT / "frontend" / "src"

EXCLUDE_PATHS = frozenset(
    {
        FRONTEND_SRC / "routeTree.gen.ts",
        FRONTEND_SRC / "lib" / "api-types.ts",
    }
)

_SETTER_NAME = r"set[A-Z][A-Za-z0-9_]*"
_NON_EMPTY_DEPS = r"\[\s*[^\s\]][^\]]*\]"

# Arrow expression body: `useEffect(() => setX(...), [deps])`.
# Captures the whole call so we can compute the line number from the match start.
# `,?\s*\)` at the end tolerates trailing commas in multiline call sites.
_EXPR_BODY_RE = re.compile(
    r"useEffect\s*\(\s*"
    r"\(\s*\)\s*=>\s*"
    rf"({_SETTER_NAME})\s*\([^)]*\)\s*"
    rf",\s*({_NON_EMPTY_DEPS})\s*,?\s*\)",
    re.DOTALL,
)

# Arrow block body, single statement: `useEffect(() => { setX(...); }, [deps])`.
# `[^;]*` in the setter argument allows nested parens (e.g. chained .map calls).
_BLOCK_BODY_RE = re.compile(
    r"useEffect\s*\(\s*"
    r"\(\s*\)\s*=>\s*\{\s*"
    rf"({_SETTER_NAME})\s*\([^;]*\)\s*;?\s*"
    r"\}\s*,\s*" + rf"({_NON_EMPTY_DEPS})\s*,?\s*\)",
    re.DOTALL,
)


@dataclass(frozen=True)
class Violation:
    """A useEffect derived-state-sync violation tied to a file and line."""

    file: str
    line: int
    snippet: str


def find_violations(source: str, file_path: str) -> list[Violation]:
    """Return all derived-state-sync violations in a single source string."""
    violations: list[Violation] = []
    for regex in (_EXPR_BODY_RE, _BLOCK_BODY_RE):
        for match in regex.finditer(source):
            line = source.count("\n", 0, match.start()) + 1
            snippet = match.group(0).replace("\n", " ").strip()
            violations.append(Violation(file=file_path, line=line, snippet=snippet))
    return violations


def iter_frontend_sources() -> list[Path]:
    """Yield .ts and .tsx files under frontend/src, excluding generated files."""
    if not FRONTEND_SRC.is_dir():
        return []
    files: list[Path] = []
    for ext in ("*.ts", "*.tsx"):
        files.extend(FRONTEND_SRC.rglob(ext))
    return [f for f in files if f not in EXCLUDE_PATHS]


def main() -> int:
    """Run the useEffect derived-state sync check and print results."""
    all_violations: list[Violation] = []
    for path in iter_frontend_sources():
        source = path.read_text(encoding="utf-8")
        rel = path.relative_to(REPO_ROOT)
        all_violations.extend(find_violations(source, str(rel)))

    if not all_violations:
        return 0

    print(
        "Found useEffect derived-state-sync violations. "
        "See frontend/CLAUDE.md > Hooks and state for the rule.",
        file=sys.stderr,
    )
    for v in all_violations:
        print(f"{v.file}:{v.line}: {v.snippet}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
