# Commit types: one source of truth

**Date:** 2026-04-22
**Status:** Design approved (autopilot autonomous mode), plan pending.

## Problem

The list of conventional-commit types accepted by this repo is written out by hand in two places:

1. `.github/workflows/pr-title.yml`, where the `types:` block is passed to `amannn/action-semantic-pull-request` (lines 19 to 30).
2. `CONTRIBUTING.md`, where the "Allowed types" table pairs each type with a contributor-facing description (lines 36 to 48).

Adding or removing a type requires editing both files, and nothing in CI or pre-commit verifies that the two lists still agree. They match today by manual upkeep, not enforcement. The OPEN_THINGS entry "PR-title type list duplicates `CONTRIBUTING.md`" frames the fix as "single source of truth needed (e.g. generate the workflow from a templated config)".

A third consumer, cocogitto (the `commit-msg` hook), validates local commits using its built-in conventional-commits defaults. Those defaults happen to match today, but we do not read them from our files, so cocogitto is not part of the drift problem this PR solves. If our list ever diverges from cocogitto's, that is a separate entry.

## Goal

Replace the two hand-maintained copies with one YAML file that both the workflow and CONTRIBUTING.md derive from, plus a small checker script wired into `mise run lint` so drift is caught in CI and in pre-commit.

Concrete outcomes:

- One file owns the canonical list of types and their descriptions.
- Removing or adding a type means editing exactly one file and running `mise run gen:commit-types`.
- CI fails when the workflow YAML or the CONTRIBUTING.md table drifts from the source file.
- No observable behaviour change: the workflow accepts the same 11 types today that it accepts tomorrow.

## Non-goals

- Changing the set of accepted types.
- Replacing `amannn/action-semantic-pull-request` or changing `subjectPattern`.
- Pointing cocogitto at the same file. Cocogitto uses its own defaults; wiring it in is a separate OPEN_THINGS entry and out of scope here.
- Auto-regenerating on commit (pre-commit hook that runs `--write`). The first version ships with on-demand regeneration only. An auto-regen hook can land later if explicit regeneration proves annoying.
- An ADR. This is a small config reorganisation within existing tooling, no subsystem change.

## Design

### File layout

```text
.github/
├── commit-types.yml                # NEW: source of truth (type -> description map)
├── workflows/
│   └── pr-title.yml                # MODIFIED: wraps types block in BEGIN/END markers
scripts/
├── gen_commit_types.py             # NEW: check (default) and --write modes
└── tests/
    └── test_gen_commit_types.py    # NEW: golden-file tests for renderers and check
CONTRIBUTING.md                     # MODIFIED: wraps allowed-types table in markers
mise.toml                           # MODIFIED: gen:commit-types, check:commit-types, lint chain
```

### Source of truth

`.github/commit-types.yml` is a YAML map from type name to description, in the order they should appear in generated outputs:

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

Keys are lowercase ASCII. Descriptions avoid em-dashes (user's global prose rule).

### Generator / checker script

`scripts/gen_commit_types.py` is a Python 3 module with one CLI entry point. Two behaviours:

- Default (no flag) = `check`. Parse the YAML, render the expected workflow types block and the expected markdown table, compare byte-for-byte against the current content between the markers in each target file. Exits 0 on match, exits 1 with a unified-style diff on drift. No writes.
- `--write` = regenerate. Replace the content between the markers with the freshly rendered block. Idempotent; running `--write` twice produces identical output.

Renderers and markers:

- **Workflow block.** In `pr-title.yml`, comment markers wrap the `types:` literal list:
  ```yaml
          # BEGIN GENERATED: commit-types
          types: |
            feat
            fix
            ...
          # END GENERATED: commit-types
  ```
  Indentation matches the surrounding YAML (10 spaces inside the `with:` block).

- **Markdown table.** In `CONTRIBUTING.md`, HTML comment markers wrap the table:
  ```markdown
  <!-- BEGIN GENERATED: commit-types -->
  | Type       | Use for                                         |
  |------------|-------------------------------------------------|
  | `feat`     | A new feature (minor version bump)              |
  ...
  <!-- END GENERATED: commit-types -->
  ```
  Column widths adapt to the longest type (`refactor`) and the longest description, so the rendered table stays aligned when a type is added later.

Pipes (`|`) in descriptions are escaped to `\|` defensively. Non-lowercase keys or duplicate keys raise a descriptive error.

Library dependency: `yaml` (PyYAML). If not available under `uv run python`, add it with `uv add --dev pyyaml` (never hand-edit `pyproject.toml` per the project rule).

### Mise tasks

New tasks in `mise.toml`:

- `gen:commit-types` runs `uv run python scripts/gen_commit_types.py --write`.
- `check:commit-types` runs `uv run python scripts/gen_commit_types.py`.

`mise run lint` gains `check:commit-types` as a dependency, so the check runs in:

- pre-commit (lefthook chains `mise run lint`).
- CI lint workflow (already invokes `mise run lint`).

### Testing

`scripts/tests/test_gen_commit_types.py` covers three slices:

1. `render_workflow_block()` on a minimal `{ "feat": ..., "fix": ... }` map returns the expected YAML literal with exact indentation and trailing newline.
2. `render_markdown_table()` on the same map returns the expected markdown, including padding and escape for a description containing `|`.
3. `check(source_yaml, workflow_path, contributing_path)` returns pass when both files match and a non-empty diff when they do not.

Golden strings are inline in the test, not external fixtures; the map is two entries so diffs stay readable.

## Alternatives considered

- **Delete the `types:` block from the workflow and rely on the action default.** Cheapest, but fragile (default can change in a minor bump) and does not fix the structural drift problem, it just hides one copy.
- **Validator-only script.** Detects drift without generation. Lighter, but leaves "which file is canonical" undefined, and adding a type still requires editing both files.
- **Generator with pre-commit autoformat.** Option B plus auto-regeneration on every commit. Extra moving piece; skip for now.

Chose Option B (generator + check) because OPEN_THINGS explicitly suggests this shape, the complexity is low (~30 lines of Python, one YAML file, one test), and it gives a clean answer to the dedup question with minimal new infrastructure.

## Rollout

Three commits:

1. `build(scripts): add commit-types generator and source-of-truth config` introduces `.github/commit-types.yml`, `scripts/gen_commit_types.py`, the pytest test, and the two new `mise` tasks. No downstream file touches yet, and `check:commit-types` is not yet part of `mise run lint`, so the commit is self-contained.
2. `ci(pr-title): load allowed types from .github/commit-types.yml` adds the BEGIN/END markers in the workflow and regenerates the block.
3. `docs(contributing): generate allowed-types table from commit-types.yml` adds markers in CONTRIBUTING.md, regenerates the table, fixes the em-dash in the `style` row, and wires `check:commit-types` into `mise run lint`. Wiring the lint dependency here (rather than in commit 2) avoids a lint failure between commits, because the check requires every configured target to have markers.

Splitting the dedup targets into their own commits keeps each review diff obvious: commit 1 is the mechanism, commits 2 and 3 are the two consumers adopting it one at a time.

## Success criteria

- `mise run check:commit-types` exits 0 on master after the PR lands.
- Removing a type from `.github/commit-types.yml` locally and running the check exits non-zero with a readable diff.
- `mise run gen:commit-types` updates both derived files and the subsequent check passes.
- `mise run lint` includes the new check.
- All existing CI workflows on the PR are green.

## Risks

- A future `amannn/action-semantic-pull-request` minor bump changes how it parses `types: |`. Mitigation: regeneration preserves the existing working format. Rollback: revert the workflow commit.
- PyYAML not installed under `uv run`. Mitigation: add via `uv add --dev pyyaml` in the same commit as the script.
- `mise run lint` runs slightly longer in pre-commit. Mitigation: the check is a single YAML parse + two string compares, measured in single-digit milliseconds.
