# Apply-github-settings Wrapper Script Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `scripts/apply-github-settings.sh` + pytest harness that applies `docs/superpowers/repo-settings.json` and `docs/superpowers/branch-protection.json` in the correct order, diffs the readback for drift, and is exposed as `mise run repo:apply-settings`.

**Architecture:** One bash script, one `jq` normalization filter, one pytest file that stubs `gh` / `jq` on `PATH`. Mise task forwards flags. Three docs updates. Three commits: script+tests, mise task, docs.

**Tech Stack:** bash, `gh` CLI, `jq`, pytest (via `uv run pytest`), mise.

**Spec:** `docs/superpowers/specs/2026-04-22-apply-github-settings-script-design.md`

---

## File Structure

Files created:
- `scripts/apply-github-settings.sh` — executable entrypoint. Handles flag parsing, preflight, repo resolution, ordered `gh api` calls, readback + diff.
- `scripts/lib/normalize-branch-protection.jq` — stand-alone jq filter that normalizes branch-protection JSON (drops read-only fields, unwraps `{"enabled": bool}` objects, sorts context arrays).
- `scripts/tests/test_apply_github_settings.py` — pytest that stubs `gh` + `jq` via `PATH` manipulation and asserts script behaviour.

Files modified:
- `mise.toml` — add `[tasks."repo:apply-settings"]`.
- `README.md` — add task to the commands table.
- `CONTRIBUTING.md` — add "Applying repo settings" subsection.
- `docs/superpowers/OPEN_THINGS.md` — replace the wrapper-script bullet with the deferred `--check` drift-mode follow-up.

Sequential constraint: Tasks 1–8 share `scripts/apply-github-settings.sh`. They must run in order, one subagent at a time. Tasks 9 (mise) and 10 (docs) touch different files and can either run in parallel after Task 8 completes, or stay sequential. Given their size, keep them sequential for simplicity.

---

## Task 1: Add the jq normalization filter

**Files:**
- Create: `scripts/lib/normalize-branch-protection.jq`

- [ ] **Step 1: Create the filter file**

Create `scripts/lib/normalize-branch-protection.jq` with exactly this content:

```jq
# Normalize a GitHub branch-protection JSON document so a PUT payload and the
# response from GET /repos/:owner/:repo/branches/:branch/protection can be
# diffed for drift detection.
#
# Invoked as:  jq -S -f scripts/lib/normalize-branch-protection.jq <file>

# Drop URL fields GitHub adds on GET but that are absent on PUT.
del(.url)
| walk(if type == "object" and has("url") then del(.url) else . end)

# Unwrap {"enabled": bool} wrappers GitHub uses on GET for boolean toggles
# where PUT accepts a bare bool.
| (if .required_linear_history? | type == "object"
     then .required_linear_history = .required_linear_history.enabled
     else . end)
| (if .allow_force_pushes? | type == "object"
     then .allow_force_pushes = .allow_force_pushes.enabled
     else . end)
| (if .allow_deletions? | type == "object"
     then .allow_deletions = .allow_deletions.enabled
     else . end)
| (if .block_creations? | type == "object"
     then .block_creations = .block_creations.enabled
     else . end)
| (if .required_conversation_resolution? | type == "object"
     then .required_conversation_resolution = .required_conversation_resolution.enabled
     else . end)
| (if .lock_branch? | type == "object"
     then .lock_branch = .lock_branch.enabled
     else . end)
| (if .allow_fork_syncing? | type == "object"
     then .allow_fork_syncing = .allow_fork_syncing.enabled
     else . end)

# Sort context array so readback ordering does not flag drift.
| (if .required_status_checks.contexts?
     then .required_status_checks.contexts |= sort
     else . end)
```

- [ ] **Step 2: Smoke-test the filter against both shapes**

Run from repo root:

```bash
jq -S -f scripts/lib/normalize-branch-protection.jq \
  docs/superpowers/branch-protection.json > /tmp/kz-expected.norm.json
cat /tmp/kz-expected.norm.json
```

Expected: a sorted JSON document. `required_status_checks.contexts` appears in sorted order (`["Lint", "Test", "Validate PR title is conventional-commits compliant"]` — already sorted because `L < T < V`). No error.

Now simulate a GET-shape readback. Write `/tmp/kz-readback-like.json`:

```bash
cat > /tmp/kz-readback-like.json <<'EOF'
{
  "url": "https://api.github.com/repos/owner/repo/branches/master/protection",
  "required_status_checks": {
    "url": "https://api.github.com/repos/.../required_status_checks",
    "strict": true,
    "contexts": ["Validate PR title is conventional-commits compliant", "Lint", "Test"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 0,
    "require_last_push_approval": false
  },
  "restrictions": null,
  "required_linear_history": {"enabled": true},
  "allow_force_pushes": {"enabled": false},
  "allow_deletions": {"enabled": false},
  "block_creations": {"enabled": false},
  "required_conversation_resolution": {"enabled": true},
  "lock_branch": {"enabled": false},
  "allow_fork_syncing": {"enabled": false}
}
EOF
jq -S -f scripts/lib/normalize-branch-protection.jq /tmp/kz-readback-like.json > /tmp/kz-actual.norm.json
diff /tmp/kz-expected.norm.json /tmp/kz-actual.norm.json
```

Expected: no diff output, exit 0. This validates the filter unwraps `{"enabled": bool}`, sorts contexts, and drops both top-level and nested `url` fields.

- [ ] **Step 3: Commit the filter on its own**

Hold off on committing. The filter is used by Task 8; ship it in the same commit as the script.

---

## Task 2: Pytest scaffold + mock `gh` helper

**Files:**
- Create: `scripts/tests/test_apply_github_settings.py`

- [ ] **Step 1: Write the test file skeleton + `mock_gh` fixture**

Create `scripts/tests/test_apply_github_settings.py`:

```python
"""Tests for scripts/apply-github-settings.sh.

Strategy: prepend a tmp dir to PATH that contains a mock `gh` binary. The mock
records every invocation to a log file and returns scripted responses based on
a per-test response map. The real `gh` is not invoked; real `jq` is still on
PATH and used as-is by the script.
"""

from __future__ import annotations

import json
import os
import shutil
import stat
import subprocess
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SCRIPT = REPO_ROOT / "scripts" / "apply-github-settings.sh"
BRANCH_PROTECTION_JSON = REPO_ROOT / "docs" / "superpowers" / "branch-protection.json"


def _write_mock_gh(bin_dir: Path, log_path: Path, responses_dir: Path) -> None:
    """Write an executable mock `gh` into bin_dir that logs argv + stdin
    and prints responses from responses_dir keyed by a request signature."""
    mock = bin_dir / "gh"
    mock.write_text(
        f"""#!/usr/bin/env bash
# Mock gh — logs invocation and returns a canned response.
set -e
LOG={log_path!s}
RESP_DIR={responses_dir!s}
echo "gh $*" >> "$LOG"
# If --input is present, append the input file's path to the log for assertions.
for arg in "$@"; do
  case "$arg" in
    --input) NEXT_IS_INPUT=1 ;;
    *) if [[ "${{NEXT_IS_INPUT:-0}}" == "1" ]]; then
         echo "  input: $arg" >> "$LOG"
         NEXT_IS_INPUT=0
       fi ;;
  esac
done

# Routing:
#   gh auth status     → exit 0 silently
#   gh repo view --json ... → print owner/repo + default branch
#   gh api --method PATCH /repos/... → print '{{}}'
#   gh api --method PUT  /repos/.../branches/.../protection → print '{{}}'
#   gh api /repos/.../branches/.../protection → print readback from RESP_DIR/readback.json
case "$1" in
  auth) exit 0 ;;
  repo)
    # gh repo view --json nameWithOwner,defaultBranchRef --jq ...
    echo "pgoell/Klassenzeit master"
    ;;
  api)
    method=""
    url=""
    for a in "$@"; do
      case "$a" in
        --method) next=method ;;
        /repos/*) url="$a" ;;
        *) if [[ "${{next:-}}" == "method" ]]; then method="$a"; next=""; fi ;;
      esac
    done
    if [[ "$method" == "PATCH" || "$method" == "PUT" ]]; then
      echo '{{}}'
    else
      cat "$RESP_DIR/readback.json"
    fi
    ;;
  *)
    echo "mock gh: unexpected command: $*" >&2
    exit 99 ;;
esac
"""
    )
    mock.chmod(mock.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


@pytest.fixture
def mock_gh(tmp_path: Path) -> dict[str, Path]:
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    log_path = tmp_path / "gh.log"
    log_path.touch()
    responses_dir = tmp_path / "responses"
    responses_dir.mkdir()
    # Default readback = identical to branch-protection.json (modulo extras the
    # jq filter strips). Individual tests can overwrite this file.
    readback = json.loads(BRANCH_PROTECTION_JSON.read_text())
    readback["url"] = "https://api.github.com/mock/protection"
    # Simulate the GET-shape wrappers for boolean toggles:
    for key in (
        "required_linear_history",
        "allow_force_pushes",
        "allow_deletions",
        "block_creations",
        "required_conversation_resolution",
        "lock_branch",
        "allow_fork_syncing",
    ):
        if key in readback and isinstance(readback[key], bool):
            readback[key] = {"enabled": readback[key]}
    (responses_dir / "readback.json").write_text(json.dumps(readback, indent=2))
    _write_mock_gh(bin_dir, log_path, responses_dir)
    return {"bin_dir": bin_dir, "log": log_path, "responses": responses_dir}


def run_script(
    mock_gh: dict[str, Path],
    *args: str,
    expect_exit: int | None = None,
) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env["PATH"] = f"{mock_gh['bin_dir']}:{env['PATH']}"
    result = subprocess.run(
        ["bash", str(SCRIPT), *args],
        cwd=str(REPO_ROOT),
        env=env,
        capture_output=True,
        text=True,
    )
    if expect_exit is not None:
        assert result.returncode == expect_exit, (
            f"expected exit {expect_exit}, got {result.returncode}\n"
            f"stdout:\n{result.stdout}\nstderr:\n{result.stderr}"
        )
    return result


def read_log(mock_gh: dict[str, Path]) -> list[str]:
    return mock_gh["log"].read_text().splitlines()
```

- [ ] **Step 2: Run pytest to verify collection**

```bash
mise exec -- uv run pytest scripts/tests/test_apply_github_settings.py --collect-only
```

Expected: "0 tests collected" (no test functions yet) and no import errors. If imports fail, fix them before continuing.

- [ ] **Step 3: Do not commit yet**

This file is part of the same commit as the script (see Task 8's commit step).

---

## Task 3: Script skeleton — shebang, flag parsing, help

**Files:**
- Create: `scripts/apply-github-settings.sh`
- Modify: `scripts/tests/test_apply_github_settings.py` (add failing tests first)

- [ ] **Step 1: Write failing tests for flag parsing**

Append to `scripts/tests/test_apply_github_settings.py`:

```python
def test_help_flag_exits_zero_and_prints_usage(mock_gh):
    result = run_script(mock_gh, "--help", expect_exit=0)
    assert "Usage" in result.stdout or "usage" in result.stdout


def test_unknown_flag_exits_2(mock_gh):
    result = run_script(mock_gh, "--badflag", expect_exit=2)
    assert "unknown" in result.stderr.lower() or "usage" in result.stderr.lower()


def test_positional_args_rejected(mock_gh):
    result = run_script(mock_gh, "somearg", expect_exit=2)
    assert result.returncode == 2
```

- [ ] **Step 2: Run the new tests to confirm they fail**

```bash
mise exec -- uv run pytest scripts/tests/test_apply_github_settings.py -v
```

Expected: all three fail with `FileNotFoundError` or exit 127 (script does not exist yet).

- [ ] **Step 3: Create the script with flag parsing only**

Create `scripts/apply-github-settings.sh`:

```bash
#!/usr/bin/env bash
# Apply GitHub repo + branch-protection settings from docs/superpowers/*.json.
# See docs/superpowers/specs/2026-04-22-apply-github-settings-script-design.md
# for rationale.
set -euo pipefail

cd "$(dirname "$0")/.."

DRY_RUN=0
SKIP_VERIFY=0

usage() {
  cat <<'EOF'
Usage: scripts/apply-github-settings.sh [--dry-run] [--skip-verify] [--help]

Applies docs/superpowers/repo-settings.json via PATCH /repos/:owner/:repo, then
docs/superpowers/branch-protection.json via PUT /repos/:owner/:repo/branches/:default/protection.
Reads branch protection back and diffs the normalized result against the source
JSON. Exits non-zero on drift.

Flags:
  --dry-run       Print the gh api commands that would run, do not mutate.
  --skip-verify   Apply settings but skip the readback + drift diff.
  --help          Show this message and exit.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --skip-verify) SKIP_VERIFY=1; shift ;;
    --help|-h) usage; exit 0 ;;
    --*) echo "unknown flag: $1" >&2; usage >&2; exit 2 ;;
    *)   echo "unexpected positional argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

echo "apply-github-settings: TODO implement (flags parsed: dry_run=$DRY_RUN skip_verify=$SKIP_VERIFY)"
```

Make it executable:

```bash
chmod +x scripts/apply-github-settings.sh
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
mise exec -- uv run pytest scripts/tests/test_apply_github_settings.py -v
```

Expected: the three flag-parsing tests pass. Any pre-existing test still fails with the TODO stub — expected, later tasks address it.

- [ ] **Step 5: Do not commit yet**

---

## Task 4: Preflight checks — gh / jq presence, gh auth

**Files:**
- Modify: `scripts/apply-github-settings.sh`
- Modify: `scripts/tests/test_apply_github_settings.py`

- [ ] **Step 1: Write failing tests**

Append to the test file:

```python
def test_missing_gh_exits_2(tmp_path, monkeypatch):
    # Build an isolated PATH that contains jq but NOT gh.
    isolated = tmp_path / "bin"
    isolated.mkdir()
    real_jq = shutil.which("jq")
    assert real_jq, "jq must be installed for this test suite"
    (isolated / "jq").symlink_to(real_jq)
    env = os.environ.copy()
    env["PATH"] = str(isolated)
    result = subprocess.run(
        ["bash", str(SCRIPT)],
        cwd=str(REPO_ROOT),
        env=env,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 2, result.stderr
    assert "gh" in result.stderr.lower()


def test_missing_jq_exits_2(tmp_path, monkeypatch):
    isolated = tmp_path / "bin"
    isolated.mkdir()
    real_gh = shutil.which("gh") or "/usr/bin/true"  # symlink target; content irrelevant for this test
    (isolated / "gh").symlink_to(real_gh)
    env = os.environ.copy()
    env["PATH"] = str(isolated)
    result = subprocess.run(
        ["bash", str(SCRIPT)],
        cwd=str(REPO_ROOT),
        env=env,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 2, result.stderr
    assert "jq" in result.stderr.lower()
```

- [ ] **Step 2: Run the new tests to verify they fail**

```bash
mise exec -- uv run pytest scripts/tests/test_apply_github_settings.py::test_missing_gh_exits_2 scripts/tests/test_apply_github_settings.py::test_missing_jq_exits_2 -v
```

Expected: both fail (script currently exits 0 from its TODO stub).

- [ ] **Step 3: Add the preflight block to the script**

Replace the final `echo "apply-github-settings: TODO …"` line in `scripts/apply-github-settings.sh` with a preflight block, inserted right after the flag-parsing `while` loop:

```bash
# --- Preflight ----------------------------------------------------------------
command -v gh >/dev/null || { echo "gh is required; install https://cli.github.com/" >&2; exit 2; }
command -v jq >/dev/null || { echo "jq is required" >&2; exit 2; }
gh auth status >/dev/null 2>&1 || {
  echo "gh is not authenticated; run 'gh auth login'" >&2
  exit 3
}

echo "apply-github-settings: TODO post-preflight"
```

- [ ] **Step 4: Run tests and verify the preflight tests pass**

```bash
mise exec -- uv run pytest scripts/tests/test_apply_github_settings.py -v
```

Expected: preflight tests pass. Flag-parsing tests still pass.

- [ ] **Step 5: Do not commit yet**

---

## Task 5: Resolve owner / repo / default branch + dry-run output

**Files:**
- Modify: `scripts/apply-github-settings.sh`
- Modify: `scripts/tests/test_apply_github_settings.py`

- [ ] **Step 1: Write failing tests**

```python
def test_dry_run_prints_planned_commands_and_does_not_apply(mock_gh):
    result = run_script(mock_gh, "--dry-run", expect_exit=0)
    assert "would run" in result.stdout.lower()
    assert "PATCH" in result.stdout
    assert "PUT" in result.stdout
    assert "/repos/pgoell/Klassenzeit" in result.stdout
    # No actual apply calls were made
    log = read_log(mock_gh)
    assert not any("--method PATCH" in line for line in log), log
    assert not any("--method PUT" in line for line in log), log


def test_dry_run_calls_resolve_but_not_apply(mock_gh):
    run_script(mock_gh, "--dry-run", expect_exit=0)
    log = read_log(mock_gh)
    assert any("repo view" in line for line in log), log
```

- [ ] **Step 2: Run the new tests to verify they fail**

```bash
mise exec -- uv run pytest scripts/tests/test_apply_github_settings.py -v
```

Expected: the two new tests fail.

- [ ] **Step 3: Add repo resolution + dry-run to the script**

Replace the TODO line in `scripts/apply-github-settings.sh` with:

```bash
# --- Resolve repo -------------------------------------------------------------
REPO_INFO=$(gh repo view --json nameWithOwner,defaultBranchRef \
  --jq '.nameWithOwner + " " + .defaultBranchRef.name' 2>/dev/null) || {
  echo "could not resolve current repo via 'gh repo view'; is this a GitHub repo clone?" >&2
  exit 4
}
OWNER_REPO=${REPO_INFO% *}
DEFAULT_BRANCH=${REPO_INFO##* }

REPO_SETTINGS=docs/superpowers/repo-settings.json
BRANCH_PROTECTION=docs/superpowers/branch-protection.json

echo "target: $OWNER_REPO (branch: $DEFAULT_BRANCH)"

# --- Apply or describe --------------------------------------------------------
if [[ "$DRY_RUN" == "1" ]]; then
  echo "→ would run: gh api --method PATCH /repos/$OWNER_REPO --input $REPO_SETTINGS"
  echo "→ would run: gh api --method PUT  /repos/$OWNER_REPO/branches/$DEFAULT_BRANCH/protection --input $BRANCH_PROTECTION"
  echo "✔ dry run complete, no changes made"
  exit 0
fi

echo "apply-github-settings: TODO apply step"
```

- [ ] **Step 4: Run tests**

```bash
mise exec -- uv run pytest scripts/tests/test_apply_github_settings.py -v
```

Expected: dry-run tests pass. Preflight tests still pass.

- [ ] **Step 5: Do not commit yet**

---

## Task 6: Apply order — PATCH then PUT

**Files:**
- Modify: `scripts/apply-github-settings.sh`
- Modify: `scripts/tests/test_apply_github_settings.py`

- [ ] **Step 1: Write failing tests**

```python
def test_apply_order_is_repo_settings_then_protection(mock_gh):
    run_script(mock_gh, "--skip-verify", expect_exit=0)
    log = read_log(mock_gh)
    patch_idx = next(
        (i for i, line in enumerate(log) if "--method PATCH" in line), None
    )
    put_idx = next(
        (i for i, line in enumerate(log) if "--method PUT" in line), None
    )
    assert patch_idx is not None, log
    assert put_idx is not None, log
    assert patch_idx < put_idx, log


def test_apply_passes_correct_input_files(mock_gh):
    run_script(mock_gh, "--skip-verify", expect_exit=0)
    log_text = mock_gh["log"].read_text()
    assert "docs/superpowers/repo-settings.json" in log_text
    assert "docs/superpowers/branch-protection.json" in log_text


def test_apply_calls_correct_endpoints(mock_gh):
    run_script(mock_gh, "--skip-verify", expect_exit=0)
    log_text = mock_gh["log"].read_text()
    assert "/repos/pgoell/Klassenzeit" in log_text
    assert "/repos/pgoell/Klassenzeit/branches/master/protection" in log_text
```

- [ ] **Step 2: Run tests to verify failure**

```bash
mise exec -- uv run pytest scripts/tests/test_apply_github_settings.py -v
```

Expected: the three new tests fail; earlier tests still pass.

- [ ] **Step 3: Replace the TODO with the apply block**

Swap the final `echo "apply-github-settings: TODO apply step"` line in `scripts/apply-github-settings.sh` for:

```bash
echo "→ applying repo-level settings"
gh api --method PATCH "/repos/$OWNER_REPO" --input "$REPO_SETTINGS" >/dev/null

echo "→ applying branch protection"
gh api --method PUT "/repos/$OWNER_REPO/branches/$DEFAULT_BRANCH/protection" \
  --input "$BRANCH_PROTECTION" >/dev/null

if [[ "$SKIP_VERIFY" == "1" ]]; then
  echo "✔ applied (verify skipped)"
  exit 0
fi

echo "apply-github-settings: TODO verify step"
```

- [ ] **Step 4: Run tests**

```bash
mise exec -- uv run pytest scripts/tests/test_apply_github_settings.py -v
```

Expected: apply-order tests pass; dry-run tests still pass.

- [ ] **Step 5: Do not commit yet**

---

## Task 7: Readback + drift diff

**Files:**
- Modify: `scripts/apply-github-settings.sh`
- Modify: `scripts/tests/test_apply_github_settings.py`

- [ ] **Step 1: Write failing tests**

```python
def test_clean_readback_exits_zero(mock_gh):
    # Default fixture already makes readback match branch-protection.json.
    result = run_script(mock_gh, expect_exit=0)
    assert "matches" in result.stdout.lower() or "✔" in result.stdout


def test_drift_detection_exits_5(mock_gh):
    # Mutate readback: flip required_linear_history.
    rb_path = mock_gh["responses"] / "readback.json"
    readback = json.loads(rb_path.read_text())
    readback["required_linear_history"] = {"enabled": False}
    rb_path.write_text(json.dumps(readback))
    result = run_script(mock_gh, expect_exit=5)
    assert "drift" in result.stderr.lower() or "required_linear_history" in result.stderr


def test_skip_verify_skips_readback_get(mock_gh):
    run_script(mock_gh, "--skip-verify", expect_exit=0)
    log_text = mock_gh["log"].read_text()
    # GET readback is the bare `gh api /repos/.../protection` call (no --method).
    assert "branches/master/protection" in log_text  # the PUT line
    # There must be no bare (non-method) GET on that path; count PATCH/PUT
    # occurrences and total protection-path occurrences.
    protection_lines = [
        line for line in log_text.splitlines()
        if "/branches/master/protection" in line and line.startswith("gh api")
    ]
    # Exactly one hit: the PUT. No GET.
    assert len(protection_lines) == 1, protection_lines
    assert "--method PUT" in protection_lines[0]
```

- [ ] **Step 2: Run tests to verify failure**

```bash
mise exec -- uv run pytest scripts/tests/test_apply_github_settings.py -v
```

Expected: the three new tests fail; earlier tests still pass.

- [ ] **Step 3: Replace the verify TODO with the readback + diff block**

Swap the final `echo "apply-github-settings: TODO verify step"` line for:

```bash
# --- Verify: readback + drift diff --------------------------------------------
echo "→ verifying branch protection"
ACTUAL_RAW=$(mktemp)
ACTUAL_NORM=$(mktemp)
EXPECTED_NORM=$(mktemp)
trap 'rm -f "$ACTUAL_RAW" "$ACTUAL_NORM" "$EXPECTED_NORM"' EXIT

gh api "/repos/$OWNER_REPO/branches/$DEFAULT_BRANCH/protection" > "$ACTUAL_RAW"

FILTER=scripts/lib/normalize-branch-protection.jq
jq -S -f "$FILTER" "$ACTUAL_RAW"         > "$ACTUAL_NORM"
jq -S -f "$FILTER" "$BRANCH_PROTECTION"  > "$EXPECTED_NORM"

if diff -u "$EXPECTED_NORM" "$ACTUAL_NORM" >&2; then
  echo "✔ branch protection matches branch-protection.json"
  exit 0
else
  echo "✖ drift detected between branch-protection.json and GitHub" >&2
  exit 5
fi
```

- [ ] **Step 4: Run the full test file**

```bash
mise exec -- uv run pytest scripts/tests/test_apply_github_settings.py -v
```

Expected: all tests pass (dry-run, preflight, apply-order, readback).

- [ ] **Step 5: Run lint**

```bash
mise run lint
```

Expected: clean.

- [ ] **Step 6: Commit script + tests + filter together**

```bash
git add scripts/apply-github-settings.sh \
        scripts/lib/normalize-branch-protection.jq \
        scripts/tests/test_apply_github_settings.py
git commit -m "chore(scripts): add apply-github-settings wrapper"
```

---

## Task 8: Mise task

**Files:**
- Modify: `mise.toml`

- [ ] **Step 1: Add the mise task**

Pick a location in `mise.toml` adjacent to other non-language-specific tasks (next to `audit`). Add:

```toml
# ─── GitHub repo config ─────────────────────────────────────────────────────

[tasks."repo:apply-settings"]
description = "Apply GitHub repo + branch-protection settings from docs/superpowers/*.json"
run = "bash scripts/apply-github-settings.sh"
```

Flags are forwarded via `mise run repo:apply-settings -- --dry-run`; mise passes trailing `--`-delimited args to the `run` command.

- [ ] **Step 2: Smoke-test the task**

```bash
mise run repo:apply-settings -- --help
```

Expected: usage output, exit 0.

- [ ] **Step 3: Commit**

```bash
git add mise.toml
git commit -m "chore(mise): expose repo:apply-settings task"
```

---

## Task 9: Docs (README, CONTRIBUTING, OPEN_THINGS)

**Files:**
- Modify: `README.md`
- Modify: `CONTRIBUTING.md`
- Modify: `docs/superpowers/OPEN_THINGS.md`

- [ ] **Step 1: Add the commands-table row in README**

Open `README.md` and locate the commands table (search for `mise run db:up` or similar). Add a new row. If the nearest group is "Database" or "Dev loop", place this one in a "GitHub" group at the bottom or adjacent to `audit`. Example row:

```markdown
| `mise run repo:apply-settings` | Apply GitHub repo + branch-protection settings (use `-- --dry-run` first) |
```

- [ ] **Step 2: Add a CONTRIBUTING.md subsection**

Open `CONTRIBUTING.md`. Add a new subsection near the existing "Commit messages" or "Tooling" section:

```markdown
### Applying repo settings

The repo's GitHub-side configuration (merge strategies, required status checks, linear history) lives in two JSON files under `docs/superpowers/`. Apply them with:

```bash
mise run repo:apply-settings -- --dry-run   # recommended first run
mise run repo:apply-settings                 # actually apply
```

The script reads branch protection back and exits non-zero on drift. See `docs/superpowers/specs/2026-04-22-apply-github-settings-script-design.md` for rationale.
```

- [ ] **Step 3: Update OPEN_THINGS.md**

In `docs/superpowers/OPEN_THINGS.md`, under "CI / repo automation", remove the existing "Branch and repo settings need a wrapper script." bullet entirely (the ~4-line entry that starts with **Branch and repo settings need a wrapper script.**). Replace it with this bullet, added at the same location:

```markdown
- **Drift-check mode for `repo:apply-settings`.** The readback-and-diff logic in `scripts/apply-github-settings.sh` is factored into its own block, so exposing a `--check` flag (readback without apply) is a small addition. Wire it into `audit.yml` as a nightly drift check once the auto-issue-on-audit-failure pipeline exists; running it in isolation today produces alerts nothing routes.
```

- [ ] **Step 4: Run lint**

```bash
mise run lint
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add README.md CONTRIBUTING.md docs/superpowers/OPEN_THINGS.md
git commit -m "docs: document apply-github-settings script"
```

---

## Task 10: Smoke-test the full flow

**Files:** none (verification only)

- [ ] **Step 1: Dry-run with real `gh`**

```bash
mise run repo:apply-settings -- --dry-run
```

Expected: prints `→ would run:` lines for both PATCH and PUT targeting `/repos/pgoell/Klassenzeit` and `/repos/pgoell/Klassenzeit/branches/master/protection`, plus `✔ dry run complete`.

- [ ] **Step 2: Actually apply**

```bash
mise run repo:apply-settings
```

Expected: exits 0 with `✔ branch protection matches branch-protection.json`.

- [ ] **Step 3: Re-run to verify idempotency**

```bash
mise run repo:apply-settings
```

Expected: same clean output.

- [ ] **Step 4: Run full test + lint suite**

```bash
mise run lint && mise run test:py
```

Expected: clean.

- [ ] **Step 5: Do not commit**

Verification only.

---

## Self-Review

**Spec coverage:** Tasks 1–7 deliver every script behaviour named in the spec's "Design" section (flag parsing, preflight, resolve, apply order, readback + diff). Task 8 exposes the mise task. Task 9 covers all three docs touch points. Task 10 maps to the spec's "Verification" section.

**Placeholder scan:** No "TBD", "TODO" — every step contains the actual shell, Python, YAML, or markdown text to write. The "TODO" strings inside the script during intermediate tasks (e.g. `echo "apply-github-settings: TODO verify step"`) are intentional, get replaced in the next task, and never survive to commit.

**Type consistency:** Env var names (`DRY_RUN`, `SKIP_VERIFY`, `OWNER_REPO`, `DEFAULT_BRANCH`, `REPO_SETTINGS`, `BRANCH_PROTECTION`, `FILTER`, `ACTUAL_RAW`, `ACTUAL_NORM`, `EXPECTED_NORM`) are introduced once and reused consistently in every later task that touches the script. Exit codes (2, 3, 4, 5) match the spec's table. Mock-log format (`gh <args>`, `  input: <path>`) is introduced once in Task 2 and asserted against in Tasks 3–7.

Ready to hand off to subagent-driven execution.
