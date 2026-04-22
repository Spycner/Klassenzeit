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
    """Escape literal `|` so it renders inside a markdown table cell."""
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
        raise MarkerNotFoundError(f"{file_path}: missing BEGIN/END markers ({begin!r} ... {end!r})")
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
        _replace_between(workflow_text, WORKFLOW_BEGIN, WORKFLOW_END, expected_workflow, workflow),
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
    """Run the CLI: default checks drift, `--write` regenerates the regions."""
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
