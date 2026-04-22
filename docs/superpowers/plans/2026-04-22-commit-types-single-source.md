# Commit types: one source of truth — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two hand-written lists of conventional-commit types (`.github/workflows/pr-title.yml` and `CONTRIBUTING.md`) with one YAML source file, a small Python generator/checker, and a lint-time drift check, so adding or removing a type means editing exactly one file.

**Architecture:** A `.github/commit-types.yml` file becomes the single source of truth (type → description map). A Python script at `scripts/gen_commit_types.py` has two modes: default (`check`) diffs the expected rendering against current file contents between BEGIN/END markers, and `--write` regenerates those regions. Two mise tasks (`gen:commit-types`, `check:commit-types`) wrap the script. The check joins `mise run lint` once both targets carry markers, so pre-commit and CI catch drift.

**Tech Stack:** Python 3.14 (`uv run`), PyYAML 6.x (already present), pytest for the golden-file tests, mise tasks for the entry points.

---

## File Structure

- Create: `.github/commit-types.yml` — source of truth map.
- Create: `scripts/gen_commit_types.py` — one module with renderers, a `check()` function, a `write()` function, and a CLI entry point.
- Create: `scripts/tests/test_gen_commit_types.py` — golden-file tests.
- Modify: `mise.toml` — add `gen:commit-types` and `check:commit-types` tasks; wire `check:commit-types` into `lint` in the final commit.
- Modify: `.github/workflows/pr-title.yml` — wrap the `types:` block in BEGIN/END markers.
- Modify: `CONTRIBUTING.md` — wrap the allowed-types table in BEGIN/END markers and fix the em-dash in the `style` row.

## Task 1: Failing test for `render_workflow_block`

**Files:**
- Create: `scripts/tests/test_gen_commit_types.py`

- [ ] **Step 1: Write the failing test**

```python
"""Tests for the commit-types generator."""

from __future__ import annotations

from scripts.gen_commit_types import render_workflow_block


def test_render_workflow_block_emits_literal_yaml_list() -> None:
    """The workflow renderer emits a `types: |` literal with one type per line."""
    types = {"feat": "new feature", "fix": "bug fix"}

    block = render_workflow_block(types, indent=" " * 10)

    assert block == (
        "          types: |\n"
        "            feat\n"
        "            fix\n"
    )
```

- [ ] **Step 2: Run test and verify it fails**

Run: `uv run pytest scripts/tests/test_gen_commit_types.py -v`
Expected: `ModuleNotFoundError: No module named 'scripts.gen_commit_types'` (collection error). This is the red state.

- [ ] **Step 3: Commit nothing yet.** The test is a staging point; implementation follows in Task 2.

## Task 2: Minimal `render_workflow_block`

**Files:**
- Create: `scripts/gen_commit_types.py`

- [ ] **Step 1: Implement the renderer**

```python
"""Generate and check commit-type-derived sections in repo files.

Source of truth: .github/commit-types.yml (map of type -> description).

Modes:
- default (check): compare expected rendering to file contents; exit 1 on drift.
- --write: replace the content between BEGIN/END markers with fresh output.

Targets:
- .github/workflows/pr-title.yml: the `types: |` literal block.
- CONTRIBUTING.md: the allowed-types markdown table.
"""

from __future__ import annotations


def render_workflow_block(types: dict[str, str], indent: str) -> str:
    """Render the workflow `types:` literal block.

    `indent` is the leading whitespace of the `types:` key in the surrounding
    YAML (10 spaces in `.github/workflows/pr-title.yml`). List items sit two
    spaces deeper, matching the amannn/action-semantic-pull-request format.
    """
    item_indent = indent + "  "
    lines = [f"{indent}types: |"]
    lines.extend(f"{item_indent}{name}" for name in types)
    return "\n".join(lines) + "\n"
```

- [ ] **Step 2: Run test and verify pass**

Run: `uv run pytest scripts/tests/test_gen_commit_types.py::test_render_workflow_block_emits_literal_yaml_list -v`
Expected: PASS.

- [ ] **Step 3: Do not commit yet.** The markdown renderer follows in Task 3–4; commit at the end of Task 6.

## Task 3: Failing test for `render_markdown_table`

**Files:**
- Modify: `scripts/tests/test_gen_commit_types.py`

- [ ] **Step 1: Update the import and append the test**

Update the import line at the top of `scripts/tests/test_gen_commit_types.py` to include `render_markdown_table`:

```python
from scripts.gen_commit_types import render_markdown_table, render_workflow_block
```

Append the new test:

```python
def test_render_markdown_table_aligns_columns_and_escapes_pipes() -> None:
    """The markdown renderer produces an aligned table and escapes pipes."""
    types = {
        "feat": "new feature",
        "fix": "bug | fix",
    }

    table = render_markdown_table(types)

    assert table == (
        "| Type   | Use for     |\n"
        "|--------|-------------|\n"
        "| `feat` | new feature |\n"
        "| `fix`  | bug \\| fix  |\n"
    )
```

- [ ] **Step 2: Run test and verify fail**

Run: `uv run pytest scripts/tests/test_gen_commit_types.py -v`
Expected: existing `render_workflow_block` test fails at collection because `render_markdown_table` is not yet defined (`ImportError`).

## Task 4: Implement `render_markdown_table`

**Files:**
- Modify: `scripts/gen_commit_types.py`

- [ ] **Step 1: Add the renderer**

Append to `scripts/gen_commit_types.py`:

```python
def _escape_pipe(value: str) -> str:
    """Escape literal `|` so it renders inside a markdown table cell."""
    return value.replace("|", "\\|")


def render_markdown_table(types: dict[str, str]) -> str:
    """Render the allowed-types markdown table.

    Column widths adapt to the longest type/description so added types keep
    the table aligned.
    """
    type_header = "Type"
    desc_header = "Use for"

    type_cells = [f"`{name}`" for name in types]
    desc_cells = [_escape_pipe(desc) for desc in types.values()]

    type_width = max(len(type_header), *(len(cell) for cell in type_cells))
    desc_width = max(len(desc_header), *(len(cell) for cell in desc_cells))

    def row(left: str, right: str) -> str:
        return f"| {left:<{type_width}} | {right:<{desc_width}} |"

    lines = [
        row(type_header, desc_header),
        f"|{'-' * (type_width + 2)}|{'-' * (desc_width + 2)}|",
    ]
    lines.extend(row(tc, dc) for tc, dc in zip(type_cells, desc_cells, strict=True))
    return "\n".join(lines) + "\n"
```

- [ ] **Step 2: Run tests and verify both pass**

Run: `uv run pytest scripts/tests/test_gen_commit_types.py -v`
Expected: both tests PASS.

## Task 5: Failing test for `check`

**Files:**
- Modify: `scripts/tests/test_gen_commit_types.py`

- [ ] **Step 1: Update imports and append the tests**

Update the import block at the top of `scripts/tests/test_gen_commit_types.py`:

```python
from pathlib import Path

import pytest

from scripts.gen_commit_types import (
    MarkerNotFoundError,
    check,
    render_markdown_table,
    render_workflow_block,
)
```

Append the three new tests (the inline `from scripts.gen_commit_types import check` imports inside each test in the draft below are redundant once the top-level import is updated; remove them):

```python
def test_check_returns_empty_when_files_match(tmp_path: Path) -> None:
    """check() returns no diffs when both targets match the source YAML."""
    source = tmp_path / "commit-types.yml"
    source.write_text('types:\n  feat: "new"\n  fix: "bug"\n', encoding="utf-8")

    workflow = tmp_path / "pr-title.yml"
    workflow.write_text(
        "jobs:\n"
        "  x:\n"
        "    steps:\n"
        "      - with:\n"
        "          # BEGIN GENERATED: commit-types\n"
        "          types: |\n"
        "            feat\n"
        "            fix\n"
        "          # END GENERATED: commit-types\n",
        encoding="utf-8",
    )

    contributing = tmp_path / "CONTRIBUTING.md"
    contributing.write_text(
        "# Contributing\n\n"
        "<!-- BEGIN GENERATED: commit-types -->\n"
        "| Type   | Use for |\n"
        "|--------|---------|\n"
        "| `feat` | new     |\n"
        "| `fix`  | bug     |\n"
        "<!-- END GENERATED: commit-types -->\n",
        encoding="utf-8",
    )

    diffs = check(source=source, workflow=workflow, contributing=contributing)

    assert diffs == []


def test_check_reports_drift_when_workflow_missing_a_type(tmp_path: Path) -> None:
    """check() returns a non-empty diff when the workflow lacks a type."""
    source = tmp_path / "commit-types.yml"
    source.write_text('types:\n  feat: "new"\n  fix: "bug"\n', encoding="utf-8")

    workflow = tmp_path / "pr-title.yml"
    workflow.write_text(
        "          # BEGIN GENERATED: commit-types\n"
        "          types: |\n"
        "            feat\n"
        "          # END GENERATED: commit-types\n",
        encoding="utf-8",
    )

    contributing = tmp_path / "CONTRIBUTING.md"
    contributing.write_text(
        "<!-- BEGIN GENERATED: commit-types -->\n"
        "| Type   | Use for |\n"
        "|--------|---------|\n"
        "| `feat` | new     |\n"
        "| `fix`  | bug     |\n"
        "<!-- END GENERATED: commit-types -->\n",
        encoding="utf-8",
    )

    diffs = check(source=source, workflow=workflow, contributing=contributing)

    assert len(diffs) == 1
    assert "pr-title.yml" in diffs[0]
    assert "fix" in diffs[0]


def test_check_errors_when_markers_missing(tmp_path: Path) -> None:
    """check() raises when a target file does not contain the markers."""
    source = tmp_path / "commit-types.yml"
    source.write_text('types:\n  feat: "new"\n', encoding="utf-8")

    workflow = tmp_path / "pr-title.yml"
    workflow.write_text("no markers here\n", encoding="utf-8")

    contributing = tmp_path / "CONTRIBUTING.md"
    contributing.write_text(
        "<!-- BEGIN GENERATED: commit-types -->\n"
        "<!-- END GENERATED: commit-types -->\n",
        encoding="utf-8",
    )

    with pytest.raises(MarkerNotFoundError):
        check(source=source, workflow=workflow, contributing=contributing)
```

- [ ] **Step 2: Run tests and verify failures**

Run: `uv run pytest scripts/tests/test_gen_commit_types.py -v`
Expected: existing two PASS, three new tests FAIL with `ImportError: cannot import name 'check'` and `MarkerNotFoundError`.

## Task 6: Implement `check`, `write`, CLI, commit the mechanism

**Files:**
- Modify: `scripts/gen_commit_types.py`
- Create: `.github/commit-types.yml`
- Modify: `mise.toml`

- [ ] **Step 1: Complete the script**

Replace `scripts/gen_commit_types.py` with the full module:

```python
"""Generate and check commit-type-derived sections in repo files.

Source of truth: .github/commit-types.yml (map of type -> description).

Modes:
- default (check): compare expected rendering to file contents; exit 1 on drift.
- --write: replace the content between BEGIN/END markers with fresh output.

Targets:
- .github/workflows/pr-title.yml: the `types: |` literal block.
- CONTRIBUTING.md: the allowed-types markdown table.
"""

from __future__ import annotations

import argparse
import difflib
import sys
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SOURCE = REPO_ROOT / ".github" / "commit-types.yml"
DEFAULT_WORKFLOW = REPO_ROOT / ".github" / "workflows" / "pr-title.yml"
DEFAULT_CONTRIBUTING = REPO_ROOT / "CONTRIBUTING.md"

WORKFLOW_BEGIN = "# BEGIN GENERATED: commit-types"
WORKFLOW_END = "# END GENERATED: commit-types"
MARKDOWN_BEGIN = "<!-- BEGIN GENERATED: commit-types -->"
MARKDOWN_END = "<!-- END GENERATED: commit-types -->"

# Indent of the `types:` key inside the amannn action's `with:` block.
WORKFLOW_INDENT = " " * 10


class MarkerNotFoundError(RuntimeError):
    """Raised when a target file is missing its BEGIN or END marker."""


def load_types(source: Path) -> dict[str, str]:
    """Load the type -> description map; validate keys are lowercase ASCII."""
    data = yaml.safe_load(source.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or "types" not in data:
        raise ValueError(f"{source}: top-level 'types' map not found")
    types = data["types"]
    if not isinstance(types, dict) or not types:
        raise ValueError(f"{source}: 'types' must be a non-empty map")
    for key in types:
        if not (isinstance(key, str) and key.islower() and key.isascii() and key.isalpha()):
            raise ValueError(f"{source}: invalid type name {key!r} (lowercase ASCII only)")
    return {str(k): str(v) for k, v in types.items()}


def _escape_pipe(value: str) -> str:
    return value.replace("|", "\\|")


def render_workflow_block(types: dict[str, str], indent: str = WORKFLOW_INDENT) -> str:
    """Render the workflow `types:` literal block."""
    item_indent = indent + "  "
    lines = [f"{indent}types: |"]
    lines.extend(f"{item_indent}{name}" for name in types)
    return "\n".join(lines) + "\n"


def render_markdown_table(types: dict[str, str]) -> str:
    """Render the allowed-types markdown table with adaptive column widths."""
    type_header = "Type"
    desc_header = "Use for"

    type_cells = [f"`{name}`" for name in types]
    desc_cells = [_escape_pipe(desc) for desc in types.values()]

    type_width = max(len(type_header), *(len(cell) for cell in type_cells))
    desc_width = max(len(desc_header), *(len(cell) for cell in desc_cells))

    def row(left: str, right: str) -> str:
        return f"| {left:<{type_width}} | {right:<{desc_width}} |"

    lines = [
        row(type_header, desc_header),
        f"|{'-' * (type_width + 2)}|{'-' * (desc_width + 2)}|",
    ]
    lines.extend(row(tc, dc) for tc, dc in zip(type_cells, desc_cells, strict=True))
    return "\n".join(lines) + "\n"


def _region_bounds(text: str, begin: str, end: str, file_path: Path) -> tuple[int, int]:
    """Return `(between_start, between_end)` offsets of the generated region."""
    begin_idx = text.find(begin)
    end_idx = text.find(end)
    if begin_idx == -1 or end_idx == -1 or end_idx < begin_idx:
        raise MarkerNotFoundError(
            f"{file_path}: missing BEGIN/END markers ({begin!r} ... {end!r})"
        )
    between_start = text.find("\n", begin_idx) + 1
    between_end = text.rfind("\n", 0, end_idx) + 1
    return between_start, between_end


def _get_between(text: str, begin: str, end: str, file_path: Path) -> str:
    start, stop = _region_bounds(text, begin, end, file_path)
    return text[start:stop]


def _replace_between(text: str, begin: str, end: str, new_between: str, file_path: Path) -> str:
    start, stop = _region_bounds(text, begin, end, file_path)
    return text[:start] + new_between + text[stop:]


def _diff(expected: str, actual: str, label: str) -> str:
    return "".join(
        difflib.unified_diff(
            actual.splitlines(keepends=True),
            expected.splitlines(keepends=True),
            fromfile=f"{label} (current)",
            tofile=f"{label} (expected)",
        )
    )


def check(
    *,
    source: Path = DEFAULT_SOURCE,
    workflow: Path = DEFAULT_WORKFLOW,
    contributing: Path = DEFAULT_CONTRIBUTING,
) -> list[str]:
    """Compare expected renderings to file contents. Return per-file diffs."""
    types = load_types(source)
    expected_workflow = render_workflow_block(types)
    expected_markdown = render_markdown_table(types)

    diffs: list[str] = []

    workflow_text = workflow.read_text(encoding="utf-8")
    current_workflow = _get_between(workflow_text, WORKFLOW_BEGIN, WORKFLOW_END, workflow)
    if current_workflow != expected_workflow:
        diffs.append(_diff(expected_workflow, current_workflow, str(workflow)))

    contrib_text = contributing.read_text(encoding="utf-8")
    current_markdown = _get_between(contrib_text, MARKDOWN_BEGIN, MARKDOWN_END, contributing)
    if current_markdown != expected_markdown:
        diffs.append(_diff(expected_markdown, current_markdown, str(contributing)))

    return diffs


def write(
    *,
    source: Path = DEFAULT_SOURCE,
    workflow: Path = DEFAULT_WORKFLOW,
    contributing: Path = DEFAULT_CONTRIBUTING,
) -> None:
    """Regenerate the marked regions in both target files."""
    types = load_types(source)
    expected_workflow = render_workflow_block(types)
    expected_markdown = render_markdown_table(types)

    workflow_text = workflow.read_text(encoding="utf-8")
    workflow.write_text(
        _replace_between(
            workflow_text, WORKFLOW_BEGIN, WORKFLOW_END, expected_workflow, workflow
        ),
        encoding="utf-8",
    )

    contrib_text = contributing.read_text(encoding="utf-8")
    contributing.write_text(
        _replace_between(
            contrib_text, MARKDOWN_BEGIN, MARKDOWN_END, expected_markdown, contributing
        ),
        encoding="utf-8",
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="Regenerate derived files.")
    args = parser.parse_args(argv)

    if args.write:
        write()
        return 0

    try:
        diffs = check()
    except MarkerNotFoundError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    if diffs:
        for diff in diffs:
            sys.stdout.write(diff)
        print(
            "\ncommit-types drift detected. Run: mise run gen:commit-types",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Create the source YAML**

Create `.github/commit-types.yml`:

```yaml
# Single source of truth for Conventional Commits types accepted by this repo.
# Regenerate derived files with: mise run gen:commit-types
# Drift between this file and .github/workflows/pr-title.yml or CONTRIBUTING.md
# is caught by mise run check:commit-types in CI and pre-commit lint.
types:
  feat: "A new feature (minor version bump)"
  fix: "A bug fix (patch version bump)"
  docs: "Documentation-only changes"
  style: "Formatting only, no code change"
  refactor: "Code change that neither fixes a bug nor adds a feature"
  perf: "Performance improvement"
  test: "Adding or correcting tests"
  build: "Build system or external dependency changes"
  ci: "CI configuration changes"
  chore: "Other changes that don't touch src or tests"
  revert: "Reverts a previous commit"
```

- [ ] **Step 3: Add the mise tasks (do not wire into lint yet)**

Append to `mise.toml` immediately after the `[tasks.lint]` block, before `[tasks."lint:rust"]`:

```toml
[tasks."gen:commit-types"]
description = "Regenerate commit-types-derived sections in pr-title.yml and CONTRIBUTING.md"
run = "uv run python scripts/gen_commit_types.py --write"

[tasks."check:commit-types"]
description = "Verify pr-title.yml and CONTRIBUTING.md match .github/commit-types.yml"
run = "uv run python scripts/gen_commit_types.py"
```

- [ ] **Step 4: Run the full test suite**

Run: `uv run pytest scripts/tests/test_gen_commit_types.py -v`
Expected: all five tests PASS.

- [ ] **Step 5: Run lint**

Run: `mise run lint`
Expected: PASS (the check is not yet wired into lint, so no regression).

- [ ] **Step 6: Commit**

```bash
git add scripts/gen_commit_types.py scripts/tests/test_gen_commit_types.py .github/commit-types.yml mise.toml
git commit -m "build(scripts): add commit-types generator and source-of-truth config"
```

## Task 7: Add markers to `pr-title.yml` and regenerate

**Files:**
- Modify: `.github/workflows/pr-title.yml`

- [ ] **Step 1: Wrap the `types:` block in markers**

Replace lines 18–30 of `.github/workflows/pr-title.yml` (the `with:` body up to `requireScope:`) so the `types:` literal sits between markers:

```yaml
        with:
          # BEGIN GENERATED: commit-types
          types: |
            feat
            fix
            docs
            style
            refactor
            perf
            test
            build
            ci
            chore
            revert
          # END GENERATED: commit-types
          requireScope: false
```

The marker comments must be at the same indent level as `types:` (10 spaces). Everything else in the file is untouched.

- [ ] **Step 2: Confirm the workflow region matches the renderer's output**

Running `mise run gen:commit-types` now would fail because `CONTRIBUTING.md` still has no markers (Task 8). Instead, verify the workflow region is already byte-identical to what the renderer would produce:

```bash
uv run python -c '
from scripts.gen_commit_types import (
    WORKFLOW_BEGIN, WORKFLOW_END, _get_between, load_types, render_workflow_block,
    DEFAULT_WORKFLOW, DEFAULT_SOURCE,
)
types = load_types(DEFAULT_SOURCE)
expected = render_workflow_block(types)
actual = _get_between(DEFAULT_WORKFLOW.read_text(encoding="utf-8"), WORKFLOW_BEGIN, WORKFLOW_END, DEFAULT_WORKFLOW)
assert expected == actual, "workflow region drifted"
print("workflow region matches renderer output")
'
```
Expected: `workflow region matches renderer output`.

- [ ] **Step 3: Run the existing test suite**

Run: `uv run pytest scripts/tests/test_gen_commit_types.py -v`
Expected: PASS.

- [ ] **Step 4: Run lint**

Run: `mise run lint`
Expected: PASS (the check is not wired into lint yet).

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/pr-title.yml
git commit -m "ci(pr-title): load allowed types from .github/commit-types.yml"
```

## Task 8: Add markers to `CONTRIBUTING.md`, regenerate, wire into lint

**Files:**
- Modify: `CONTRIBUTING.md`
- Modify: `mise.toml`

- [ ] **Step 1: Wrap the allowed-types table in markers**

In `CONTRIBUTING.md`, find the existing block that starts with `**Allowed types:**` and ends with the `| \`revert\` ...` table row (roughly lines 34–48). Keep the `**Allowed types:**` heading and blank line. Wrap the table itself in HTML comment markers; exact column widths do not matter because Step 2 regenerates the content between the markers.

Target shape:

```markdown
**Allowed types:**

<!-- BEGIN GENERATED: commit-types -->
| Type       | Use for                                     |
|------------|---------------------------------------------|
| `feat`     | placeholder, will be regenerated            |
<!-- END GENERATED: commit-types -->
```

(Any syntactically valid markdown between the markers is fine. A one-row placeholder like above is simplest; the generator overwrites it in Step 2.)

- [ ] **Step 2: Regenerate both targets**

Run: `mise run gen:commit-types`
Expected: `CONTRIBUTING.md` rewritten with generator-computed column widths; `pr-title.yml` unchanged.

- [ ] **Step 3: Verify check passes**

Run: `mise run check:commit-types`
Expected: exits 0 with no diff output.

- [ ] **Step 4: Wire the check into `mise run lint`**

In `mise.toml`, find `[tasks.lint]`:

```toml
[tasks.lint]
description = "Run all linters"
depends = ["lint:rust", "lint:py", "fe:lint"]
```

Add `check:commit-types` to the `depends` list, keeping alphabetical-ish grouping:

```toml
[tasks.lint]
description = "Run all linters"
depends = ["lint:rust", "lint:py", "fe:lint", "check:commit-types"]
```

- [ ] **Step 5: Run lint**

Run: `mise run lint`
Expected: PASS, with `check:commit-types` visible in the runner output.

- [ ] **Step 6: Drift test (manual, revert after)**

Manually delete `  fix: "A bug fix (patch version bump)"` from `.github/commit-types.yml`, then:

```bash
mise run check:commit-types
```
Expected: exits 1 with a unified diff showing the missing `fix` line in both targets.

Restore the deleted line:

```bash
git checkout -- .github/commit-types.yml
```

Re-run `mise run check:commit-types`. Expected: exits 0.

- [ ] **Step 7: Run the full project test suite**

Run: `mise run test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add CONTRIBUTING.md mise.toml
git commit -m "docs(contributing): generate allowed-types table from commit-types.yml"
```

## Post-implementation checklist

- [ ] `mise run check:commit-types` exits 0.
- [ ] `mise run gen:commit-types` is idempotent (running twice leaves both files unchanged).
- [ ] `mise run lint` includes and passes the new check.
- [ ] `uv run pytest scripts/tests/test_gen_commit_types.py -v` shows five passing tests.
- [ ] `.github/commit-types.yml`, `scripts/gen_commit_types.py`, `scripts/tests/test_gen_commit_types.py` are committed.
- [ ] `.github/workflows/pr-title.yml` carries BEGIN/END markers.
- [ ] `CONTRIBUTING.md` carries BEGIN/END markers and no longer has the em-dash in the `style` row.
- [ ] No leftover temporary edits from the Task 8 drift test.
