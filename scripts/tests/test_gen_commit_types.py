"""Tests for the commit-types generator."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from scripts.gen_commit_types import (
    MarkerNotFoundError,
    check,
    render_markdown_table,
    render_workflow_block,
)

if TYPE_CHECKING:
    from pathlib import Path


def test_render_workflow_block_emits_literal_yaml_list() -> None:
    """The workflow renderer emits a `types: |` literal with one type per line."""
    types = {"feat": "new feature", "fix": "bug fix"}

    block = render_workflow_block(types, indent=" " * 10)

    assert block == ("          types: |\n            feat\n            fix\n")


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
        "<!-- BEGIN GENERATED: commit-types -->\n<!-- END GENERATED: commit-types -->\n",
        encoding="utf-8",
    )

    with pytest.raises(MarkerNotFoundError):
        check(source=source, workflow=workflow, contributing=contributing)
