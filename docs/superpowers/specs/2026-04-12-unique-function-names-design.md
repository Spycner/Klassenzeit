# Unique Function Names Lint Check Design

## Goal

Enforce the coding standard's "unique function names globally" rule with an automated lint check that catches duplicate function names across Python, Rust, and JS/TS source files.

## Decisions

- **Scope:** all source and test files across all languages (Python, Rust, JS/TS)
- **Dunder handling:** skip `__*__` names (protocol methods, not subject to uniqueness)
- **Rust `main()`:** skip (convention across binaries)
- **No other exclusions:** test functions are checked in all languages
- **Script location:** `scripts/check_unique_fns.py`
- **Integration:** added to `mise run lint:py` task
- **Dependencies:** stdlib only

## Script Behavior

`scripts/check_unique_fns.py` walks the repo and extracts function names with file:line locations.

### Extraction by language

**Python (`.py`):** `ast.parse` + `ast.walk`, collecting `FunctionDef` and `AsyncFunctionDef` node names. Skips names matching `__*__`.

**Rust (`.rs`):** Regex `fn\s+(\w+)` on each line. Skips `main`.

**JS/TS (`.js`, `.ts`, `.tsx`):** Regex for `function\s+(\w+)` declarations and method definitions `(\w+)\s*\(` in class bodies. Best-effort — sufficient for catching obvious collisions. Does not catch arrow functions assigned to variables.

### Duplicate detection

All names from all languages are collected into a single `dict[str, list[Location]]`. Any name appearing 2+ times is reported.

### Excluded directories

`node_modules/`, `target/`, `.venv/`, `__pycache__/`, `alembic/`

### Exit codes

- `0` — no duplicates
- `1` — duplicates found

### Output format

```
Duplicate function name 'get_session' found in:
  backend/src/klassenzeit_backend/db/session.py:19
  frontend/src/api/session.ts:12

Found 1 duplicate function name(s)
```

## Integration

Add to `[tasks."lint:py"]` run list in `mise.toml`:

```
uv run python scripts/check_unique_fns.py
```

Runs as part of `mise run lint` → `lint:py` alongside ruff, ty, vulture. Also runs in CI via the existing lint job and in pre-commit via lefthook.

## Limitations

- Rust extraction is regex-based — could false-positive on `fn` in string literals or comments. Acceptable for zero dependencies.
- JS/TS extraction is regex-based — catches `function` declarations and class methods but not arrow functions (`const foo = () => {}`). Can be improved when the frontend lands.
- Does not understand re-exports or type-only declarations — checks definition sites only.

## File Changes

| File | Change |
|------|--------|
| `scripts/check_unique_fns.py` | New — the lint script |
| `mise.toml` | Add script to `lint:py` run list |
