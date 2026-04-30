# `--check` drift-detection mode for `repo:apply-settings` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `--check` flag to `scripts/apply-github-settings.sh` that performs readback-and-diff only (no apply) and wire a `drift-check` job into `.github/workflows/audit.yml` so config drift is caught on the existing scheduled audit cadence.

**Architecture:** Extract the existing post-apply readback into a `verify_branch_protection()` shell function. The `--check` flag bypasses the two `gh api` apply calls and goes straight to the verifier. Mutual-exclusion guard rejects `--check + --dry-run + --skip-verify` combinations. A new `drift-check` job in `audit.yml` runs the script in `--check` mode on the existing cron and opens a tracking issue on failure (same dedup-by-title pattern as the supply-chain audit job).

**Tech Stack:** Bash 5, `gh` CLI (via aqua-pinned mise), `jq`, pytest (for the script tests), GitHub Actions YAML, `JasonEtco/create-an-issue@1b14a70e4d8dc185e5cc76d3bec9eab20257b2c5 # v2.9.2`.

---

## File Structure

Files modified or created:

- **Modify:** `scripts/apply-github-settings.sh` — extract verifier, add `--check`, mutual-exclusion guard, update `--help`.
- **Modify:** `scripts/tests/test_apply_github_settings.py` — add four new tests (clean check, drift check, skips-apply check, mutual-exclusion).
- **Modify:** `.github/workflows/audit.yml` — append a sibling `drift-check` job with its own failure-path issue creation steps.
- **Create:** `.github/drift-check-failure-issue.md` — dedup-keyed issue template with a distinct title.
- **Modify:** `docs/superpowers/OPEN_THINGS.md` — strike Task 1 from the "Tidy phase" section; record it as carried-and-shipped under the prior DX/CI sprint's "Carried over" line.

The spec at `docs/superpowers/specs/2026-04-30-repo-settings-drift-check-design.md` lands in a separate prior commit (already shipped in this branch).

## Commit Split

Three commits within the single PR:

- **Commit A:** `feat(scripts): add --check drift-detection mode to apply-github-settings.sh` — script changes + the four new pytest cases.
- **Commit B:** `ci(audit): add drift-check job to audit workflow` — workflow changes + new issue template.
- **Commit C:** `docs: close drift-check carryover in OPEN_THINGS` — OPEN_THINGS update.

---

## Task 1: Extract `verify_branch_protection()` and add `--check` flag

Structural extraction is the prerequisite for the new flag; both ship in Commit A. Tests for the new flag are written first (TDD red), then the script changes go in (green).

**Files:**
- Modify: `scripts/apply-github-settings.sh`
- Modify: `scripts/tests/test_apply_github_settings.py`

- [ ] **Step 1: Write failing tests for the four new cases**

Append the four new test functions to the bottom of `scripts/tests/test_apply_github_settings.py` (after `test_skip_verify_skips_readback_get`):

```python
def test_check_skips_apply_calls(mock_gh):
    run_script(mock_gh, "--check", expect_exit=0)
    log = read_log(mock_gh)
    assert not any("--method PATCH" in line for line in log), log
    assert not any("--method PUT" in line for line in log), log


def test_check_clean_readback_exits_zero(mock_gh):
    result = run_script(mock_gh, "--check", expect_exit=0)
    assert "matches" in result.stdout.lower() or "✔" in result.stdout


def test_check_drift_exits_5(mock_gh):
    rb_path = mock_gh["responses"] / "readback.json"
    readback = json.loads(rb_path.read_text())
    readback["required_linear_history"] = {"enabled": False}
    rb_path.write_text(json.dumps(readback))
    result = run_script(mock_gh, "--check", expect_exit=5)
    assert "drift" in result.stderr.lower() or "required_linear_history" in result.stderr


def test_check_and_dry_run_are_mutually_exclusive(mock_gh):
    result = run_script(mock_gh, "--check", "--dry-run", expect_exit=2)
    assert (
        "mutually exclusive" in result.stderr.lower()
        or "cannot" in result.stderr.lower()
    )
```

- [ ] **Step 2: Run the four new tests to verify they fail**

Run:
```bash
mise run test:py -- scripts/tests/test_apply_github_settings.py::test_check_skips_apply_calls scripts/tests/test_apply_github_settings.py::test_check_clean_readback_exits_zero scripts/tests/test_apply_github_settings.py::test_check_drift_exits_5 scripts/tests/test_apply_github_settings.py::test_check_and_dry_run_are_mutually_exclusive -v
```

Expected: all four FAIL.

The first three fail because `--check` is parsed as an unknown flag (exit 2 from the existing parser). The mutual-exclusion test fails for the same reason; the order in which `--check` is rejected is deterministic so the assertion still tracks the right exit code, but the absence of a "mutually exclusive" message means the substring assertion fails. Actually all four return exit 2 today; only `test_check_and_dry_run_are_mutually_exclusive` may pass by accident on the exit code. Verify by reading the failure output.

- [ ] **Step 3: Edit `scripts/apply-github-settings.sh` to add the `--check` flag, extract the verifier, and add the mutual-exclusion guard**

Replace the entire script with:

```bash
#!/usr/bin/env bash
# Apply GitHub repo + branch-protection settings from docs/superpowers/*.json.
# See docs/superpowers/specs/2026-04-22-apply-github-settings-script-design.md
# and docs/superpowers/specs/2026-04-30-repo-settings-drift-check-design.md
# for rationale.
set -euo pipefail

cd "$(dirname "$0")/.."

DRY_RUN=0
SKIP_VERIFY=0
CHECK=0

usage() {
  cat <<'EOF'
Usage: scripts/apply-github-settings.sh [--check | --dry-run | --skip-verify] [--help]

Applies docs/superpowers/repo-settings.json via PATCH /repos/:owner/:repo, then
docs/superpowers/branch-protection.json via PUT /repos/:owner/:repo/branches/:default/protection.
Reads branch protection back and diffs the normalized result against the source
JSON. Exits non-zero on drift.

Flags (mutually exclusive):
  --check         Read branch protection back and diff against branch-protection.json.
                  Do not apply. Exit 5 on drift, 0 on match.
  --dry-run       Print the gh api commands that would run, do not mutate.
  --skip-verify   Apply settings but skip the readback + drift diff.

  --help          Show this message and exit.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --check) CHECK=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --skip-verify) SKIP_VERIFY=1; shift ;;
    --help|-h) usage; exit 0 ;;
    --*) echo "unknown flag: $1" >&2; usage >&2; exit 2 ;;
    *)   echo "unexpected positional argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if (( DRY_RUN + SKIP_VERIFY + CHECK > 1 )); then
  echo "--check, --dry-run, and --skip-verify are mutually exclusive" >&2
  usage >&2
  exit 2
fi

# --- Preflight ----------------------------------------------------------------
command -v gh >/dev/null || { echo "gh is required; install https://cli.github.com/" >&2; exit 2; }
command -v jq >/dev/null || { echo "jq is required" >&2; exit 2; }
gh auth status >/dev/null 2>&1 || {
  echo "gh is not authenticated; run 'gh auth login'" >&2
  exit 3
}

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

# --- Verifier ----------------------------------------------------------------
verify_branch_protection() {
  echo "→ verifying branch protection"
  local actual_raw actual_norm expected_norm
  actual_raw=$(mktemp)
  actual_norm=$(mktemp)
  expected_norm=$(mktemp)
  trap 'rm -f "$actual_raw" "$actual_norm" "$expected_norm"' RETURN

  gh api "/repos/$OWNER_REPO/branches/$DEFAULT_BRANCH/protection" > "$actual_raw"

  local filter=scripts/lib/normalize-branch-protection.jq
  jq -S -f "$filter" "$actual_raw"        > "$actual_norm"
  jq -S -f "$filter" "$BRANCH_PROTECTION" > "$expected_norm"

  if diff -u "$expected_norm" "$actual_norm" >&2; then
    echo "✔ branch protection matches branch-protection.json"
    return 0
  else
    echo "✖ drift detected between branch-protection.json and GitHub" >&2
    return 5
  fi
}

# --- Check-only path ----------------------------------------------------------
if [[ "$CHECK" == "1" ]]; then
  verify_branch_protection
  exit $?
fi

# --- Apply or describe --------------------------------------------------------
if [[ "$DRY_RUN" == "1" ]]; then
  echo "→ would run: gh api --method PATCH /repos/$OWNER_REPO --input $REPO_SETTINGS"
  echo "→ would run: gh api --method PUT  /repos/$OWNER_REPO/branches/$DEFAULT_BRANCH/protection --input $BRANCH_PROTECTION"
  echo "✔ dry run complete, no changes made"
  exit 0
fi

echo "→ applying repo-level settings"
gh api --method PATCH "/repos/$OWNER_REPO" --input "$REPO_SETTINGS" >/dev/null

echo "→ applying branch protection"
gh api --method PUT "/repos/$OWNER_REPO/branches/$DEFAULT_BRANCH/protection" \
  --input "$BRANCH_PROTECTION" >/dev/null

if [[ "$SKIP_VERIFY" == "1" ]]; then
  echo "✔ applied (verify skipped)"
  exit 0
fi

verify_branch_protection
exit $?
```

Key notes for reviewers:

- `verify_branch_protection` uses a function-scoped `trap ... RETURN` so each invocation cleans up its own tempfiles even if the function is called twice in one run (it isn't today, but the bound is the right one).
- `local` declarations on the tempfile vars keep them out of the outer scope.
- `exit $?` after the function call propagates the function's exit code (0 on match, 5 on drift) to the script's exit code unchanged, so the existing exit-code table (0/2/3/4/5) holds for both apply mode and check mode.

- [ ] **Step 4: Run all script tests to confirm green**

Run:
```bash
mise run test:py -- scripts/tests/test_apply_github_settings.py -v
```

Expected: all 16 tests pass (12 pre-existing + 4 new).

If a pre-existing test fails, the function-extraction broke a behaviour. Read the failure carefully: the most likely failures involve the `trap` change (`RETURN` vs `EXIT`) or the `local` declarations shadowing an outer-scope variable.

- [ ] **Step 5: Run the live `--check` smoke against this repo**

Run:
```bash
bash scripts/apply-github-settings.sh --check
echo "exit: $?"
```

Expected output ends with `✔ branch protection matches branch-protection.json` and exit 0.

If exit 5 (drift): inspect the diff. Either the live setting was changed manually (revert via `mise run repo:apply-settings`) or the JSON has drifted from the live setting (update the JSON in this same PR with a separate commit explaining what setting changed and why; that commit lands before Commit B so reviewers see the drift fix in chronological order).

- [ ] **Step 6: Run the mutual-exclusion smoke**

Run:
```bash
bash scripts/apply-github-settings.sh --check --dry-run
echo "exit: $?"
```

Expected: stderr says "mutually exclusive" and exit code is 2.

- [ ] **Step 7: Stage and commit**

Run:
```bash
git add scripts/apply-github-settings.sh scripts/tests/test_apply_github_settings.py
git commit -m "feat(scripts): add --check drift-detection mode to apply-github-settings.sh"
```

Lefthook's pre-commit runs `mise run lint` plus the unique-fns check. The script does not introduce new functions visible to the unique-fn checker (which scans Python/TS/Rust). Pre-commit should pass.

---

## Task 2: Add `drift-check` job to `audit.yml` and the failure issue template

**Files:**
- Modify: `.github/workflows/audit.yml`
- Create: `.github/drift-check-failure-issue.md`

- [ ] **Step 1: Create `.github/drift-check-failure-issue.md`**

Write to `.github/drift-check-failure-issue.md`:

```markdown
---
title: 'CI: GitHub repo settings drift detected'
labels:
  - ci-audit
  - bug
assignees:
  - pgoell
---
<!--
  DO NOT edit the title in this file or in .github/workflows/audit.yml.
  The title is the dedup key for `JasonEtco/create-an-issue@v2` with
  `update_existing: true`. Changing it would open duplicate issues on
  the next failure and orphan the existing one.
-->

The scheduled GitHub repo settings drift-check ([`.github/workflows/audit.yml`](../../.github/workflows/audit.yml), `drift-check` job) failed.

- **Latest failing run:** [#{{ env.RUN_NUMBER }} attempt {{ env.RUN_ATTEMPT }}]({{ env.RUN_URL }})
- **Trigger:** `{{ env.TRIGGER_EVENT }}`

## What happened

`bash scripts/apply-github-settings.sh --check` returned exit code 5: the live branch-protection settings on `master` no longer match `docs/superpowers/branch-protection.json`. The job's "Check repo settings drift" step prints a unified diff between the two normalized documents.

## What to do

1. Open the run log linked above and scroll to the `Check repo settings drift` step. The unified diff identifies which fields changed.
2. Decide which side is the source of truth:
   - **The JSON is right** (someone toggled a setting in the GitHub UI by mistake): run `mise run repo:apply-settings` locally to push the JSON back to GitHub.
   - **The live setting is right** (the JSON is stale, e.g. a workflow rename made a required-check name obsolete): edit `docs/superpowers/branch-protection.json` to match the live setting, push the change, and merge.
3. Re-trigger this workflow with `gh workflow run audit.yml`. If the re-run is green, close this issue.

## History

Comments on this issue are appended by the workflow every time the scheduled run fails. The issue body is overwritten on each run to reflect the latest failing run; earlier failures live in the comment stream below.
```

- [ ] **Step 2: Edit `.github/workflows/audit.yml` to add the `drift-check` job**

Append the following job to the `jobs:` map in `.github/workflows/audit.yml` (after the existing `audit:` job, at the same indentation):

```yaml
  drift-check:
    name: GitHub repo settings drift
    runs-on: ubuntu-latest
    if: ${{ github.event_name != 'pull_request' }}
    permissions:
      contents: read
      issues: write
    env:
      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    steps:
      - uses: actions/checkout@v6
      - uses: ./.github/actions/setup-mise
      - name: Check repo settings drift
        run: bash scripts/apply-github-settings.sh --check

      - name: Open or reuse tracking issue
        id: tracking-issue
        if: ${{ failure() && github.event_name == 'schedule' }}
        uses: JasonEtco/create-an-issue@1b14a70e4d8dc185e5cc76d3bec9eab20257b2c5 # v2.9.2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          RUN_URL: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
          RUN_NUMBER: ${{ github.run_number }}
          RUN_ATTEMPT: ${{ github.run_attempt }}
          TRIGGER_EVENT: ${{ github.event_name }}
        with:
          filename: .github/drift-check-failure-issue.md
          update_existing: true

      - name: Append run link as comment
        if: ${{ failure() && github.event_name == 'schedule' && steps.tracking-issue.outputs.number != '' }}
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          ISSUE_NUMBER: ${{ steps.tracking-issue.outputs.number }}
          RUN_URL: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
        run: |
          timestamp="$(date -u '+%Y-%m-%d %H:%M UTC')"
          gh issue comment "$ISSUE_NUMBER" \
            --body "Scheduled drift-check failed again on ${timestamp}. Run: ${RUN_URL}"
```

Notes:

- The workflow header comment block above the existing `audit` job warns about the issue title being a dedup key. Do not modify the existing comment; it pertains to the audit job. The new job's title pin lives inside the new issue template's HTML comment.
- `if: ${{ github.event_name != 'pull_request' }}` skips this job on the workflow's lockfile-change PR trigger; drift-check only runs on schedule, push to master, or `workflow_dispatch`.
- The action SHA `1b14a70e4d8dc185e5cc76d3bec9eab20257b2c5 # v2.9.2` matches the existing pin in the same workflow. CLAUDE.md requires SHA-pinning for non-`actions/*`, non-`github/*` actions; using the same SHA keeps the supply-chain audit surface aligned.

- [ ] **Step 3: Run actionlint via the lint task**

Run:
```bash
mise run check:actions
```

Expected: no errors. Common pitfalls actionlint catches: typos in `${{ }}` interpolation, missing `permissions:` keys, unrecognized `if:` expressions.

- [ ] **Step 4: Verify the workflow YAML parses**

Run:
```bash
uv run --with pyyaml python3 - <<'EOF'
import yaml
with open(".github/workflows/audit.yml") as f:
    data = yaml.safe_load(f)
jobs = data["jobs"]
assert "audit" in jobs, "audit job missing"
assert "drift-check" in jobs, "drift-check job missing"
print(f"jobs: {list(jobs.keys())}")
print(f"drift-check permissions: {jobs['drift-check'].get('permissions')}")
print(f"drift-check if: {jobs['drift-check'].get('if')}")
print(f"drift-check steps: {len(jobs['drift-check']['steps'])}")
EOF
```

Expected: prints `jobs: ['audit', 'drift-check']`, drift-check has `contents: read` plus `issues: write`, plus the `if` expression, plus 5 steps.

- [ ] **Step 5: Stage and commit**

Run:
```bash
git add .github/workflows/audit.yml .github/drift-check-failure-issue.md
git commit -m "ci(audit): add drift-check job to audit workflow"
```

Pre-commit runs `mise run lint`; `check:actions` runs actionlint and is part of `lint`.

---

## Task 3: Close the carryover bullet in OPEN_THINGS

**Files:**
- Modify: `docs/superpowers/OPEN_THINGS.md`

- [ ] **Step 1: Strike Task 1 from the active sprint's Tidy phase**

In `docs/superpowers/OPEN_THINGS.md`, find the section `### Tidy phase (catchup from prior DX/CI sprint)` under `## Active sprint: Realer Schulalltag + better scheduler`. Remove the entire line numbered `1.` (the drift-check entry).

The result: the Tidy phase shrinks to one entry (`1. Pin Playwright locale explicitly.`), renumbered. Renumber the Playwright entry from `2.` to `1.`.

- [ ] **Step 2: Renumber the Data + schema phase entries**

The Tidy phase originally had two entries; removing one shortens the sprint's overall numbering by one. The numbered list under "Data + schema phase" continues at `3.`; with one item gone, those entries should renumber to `2., 3., 4.` and the algorithm phase to `5., 6., 7., 8.` and the drop tier to `9., 10.`.

After renumbering, double-check by running:
```bash
grep -n '^[0-9]\+\. ' docs/superpowers/OPEN_THINGS.md | head -20
```

Expected: a contiguous sequence `1.` through `10.` within the active sprint section, then the next numbered list starts under "Completed sprints" → "DX / CI infra hardening" with `1.` again. (The completed-sprint section uses its own numbering.)

- [ ] **Step 3: Update the DX/CI sprint's "Carried over" line**

In the same file, find the line that reads:

```markdown
Carried over to the next sprint as tidy catchup: drift-check mode (P1), Playwright locale pin (P1).
```

Replace it with:

```markdown
Carried over to the next sprint as tidy catchup: ~~drift-check mode (P1)~~ (shipped in the Realer Schulalltag sprint), Playwright locale pin (P1).
```

This preserves the historical record (the DX/CI sprint did defer it) and acknowledges the closure.

- [ ] **Step 4: Stage and commit**

Run:
```bash
git add docs/superpowers/OPEN_THINGS.md
git commit -m "docs: close drift-check carryover in OPEN_THINGS"
```

---

## Task 4: Final verification

- [ ] **Step 1: Full local lint + test pass**

Run:
```bash
mise run lint
mise run test:py -- scripts/tests/test_apply_github_settings.py -v
```

Expected: lint exits 0; pytest reports 16 passed.

The full `mise run test` also covers Rust and frontend, neither of which is touched by this PR. Skip unless you want belt-and-braces.

- [ ] **Step 2: Verify the live `--check` against this repo one more time**

Run:
```bash
bash scripts/apply-github-settings.sh --check
echo "exit: $?"
```

Expected: exit 0 with "matches" output. This is the same call the new CI job will make on its first scheduled run; if it surfaces drift now, the first scheduled `drift-check` run after merge will open a tracking issue.

- [ ] **Step 3: Verify commits**

Run:
```bash
git log --oneline master..HEAD
```

Expected output (top is most recent):

```
<sha> docs: close drift-check carryover in OPEN_THINGS
<sha> ci(audit): add drift-check job to audit workflow
<sha> feat(scripts): add --check drift-detection mode to apply-github-settings.sh
<sha> docs: add repo-settings drift-check design spec
```

If the order is different, that is OK as long as Commit A (the script change) does not depend on Commits B or C; the spec lands first historically because it was committed before the brainstorm-driven plan started. CI runs on the final tree, not commit-by-commit, so order does not affect CI.

- [ ] **Step 4: Hand off to step 6 of `/autopilot`**

The plan's implementation tasks are complete. Return control to the main session for the docs + improvement pass (revise-claude-md, claude-md-improver, fewer-permission-prompts).
