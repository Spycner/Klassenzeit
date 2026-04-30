# `--check` drift-detection mode for `repo:apply-settings`

**Date:** 2026-04-30
**Status:** Design approved (autopilot autonomous mode).

## Context

`scripts/apply-github-settings.sh` (introduced in [`2026-04-22-apply-github-settings-script-design.md`](2026-04-22-apply-github-settings-script-design.md)) applies `docs/superpowers/repo-settings.json` and `docs/superpowers/branch-protection.json` in the right order, then reads branch protection back and diffs the readback against the source JSON. The original spec's "Non-goals" section deferred a `--check` flag and the matching CI drift-check job, noting: "The readback-and-diff logic is factored into a function so exposing `--check` later is a one-line patch." Today the readback block is still inline rather than factored; the spec's intent was clear and the structural extraction lands here, alongside the new flag.

## Problem

There is no scheduled signal that catches drift between the checked-in `branch-protection.json` and the live GitHub setting. A toggle in the GitHub web UI (a maintainer flips a "require X" switch, a workflow rename leaves a stale required check ID, a third-party app rewrites a setting) goes unnoticed until the next time someone runs `mise run repo:apply-settings`. By then the drift may be days or weeks old; the existing apply-mode readback catches drift only after a human is already running the apply path.

OPEN_THINGS Task 1 ("Tidy phase") of the active "Realer Schulalltag" sprint says:

> **Drift-check mode for `repo:apply-settings`.** `[P1]` Carried over from DX/CI sprint. Expose a `--check` flag on `scripts/apply-github-settings.sh` (readback-and-diff only, no apply). Wire into `audit.yml` as a nightly drift-check job.

That bullet is the entire scope of this PR.

## Goal

Ship one PR with:

1. **`--check` flag on the apply script.** Readback-and-diff only; no `PATCH` or `PUT` calls. Exits 0 on clean readback, 5 on drift, mutually exclusive with `--dry-run` and `--skip-verify`.
2. **`drift-check` job in `audit.yml`.** Runs on the existing `schedule` and `workflow_dispatch` triggers; opens or comments on a tracking issue with a distinct title (`CI: GitHub repo settings drift detected`) on failure, mirroring the supply-chain audit job's failure pipeline.
3. **Pytest coverage for the new flag.** Three new tests next to the existing ones in `scripts/tests/test_apply_github_settings.py`: clean-readback, drift-detection, mutual-exclusion.

After this PR: a Monday-morning run of the `Audit` workflow surfaces config drift with the same observability as it surfaces supply-chain advisories. Developers can also run `bash scripts/apply-github-settings.sh --check` locally to spot drift before triggering an apply.

## Non-goals

- **Repo-settings readback.** The original spec deliberately limits the readback path to branch protection (the `PATCH /repos/:owner/:repo` response includes 80+ unrelated fields, and the only failure mode `repo-settings.json` guards against is the order-dependent 422 on the protection PUT, already caught by the apply path). `--check` inherits that scope: it diffs branch protection only.
- **A separate `check-github-settings-drift.sh` script.** One script, one mode flag. Splitting forces a parallel mock-`gh` test setup and a second `mise` task with no payoff.
- **Cron change.** The audit workflow's existing `17 6 * * 1` cron is the schedule for both jobs; a daily or hourly cadence on a near-static config would buy nothing.
- **A `--check` exit code distinct from drift-on-apply.** Drift is drift; one signal, one code (5).
- **Auto-remediation on drift.** The drift-check job opens an issue and stops. A human (or a follow-up PR) decides whether the JSON or the live setting is the source of truth; auto-applying would silently overwrite legitimate manual configuration changes.
- **Forwarding additional flags via the new mise task.** No new task; `mise run repo:apply-settings -- --check` works with the existing task definition.

## Architecture

### Files touched

- `scripts/apply-github-settings.sh`: extract `verify_branch_protection()` (no args; reads `OWNER_REPO`, `DEFAULT_BRANCH`, `BRANCH_PROTECTION` from outer scope). Add `--check` flag. Add mutual-exclusion guard (after argument parse). Update `--help`.
- `scripts/tests/test_apply_github_settings.py`: three new tests covering the `--check` path; one mutual-exclusion test.
- `.github/workflows/audit.yml`: new `drift-check` job; runs alongside `audit` in the same workflow; reuses the existing `permissions: contents: read` header and adds `issues: write` on the failure-path step (same as `audit` does today).
- `.github/drift-check-failure-issue.md`: new dedup-keyed issue template, same shape as `.github/audit-failure-issue.md`. Distinct title.
- `docs/superpowers/OPEN_THINGS.md`: strike Task 1 from the "Tidy phase" of the active sprint; record it as carried-and-shipped under the DX/CI sprint's "Carried over" line.

### Script changes

Pseudocode of the extraction:

```bash
verify_branch_protection() {
  echo "→ verifying branch protection"
  ACTUAL_RAW=$(mktemp)
  ACTUAL_NORM=$(mktemp)
  EXPECTED_NORM=$(mktemp)
  trap 'rm -f "$ACTUAL_RAW" "$ACTUAL_NORM" "$EXPECTED_NORM"' RETURN

  gh api "/repos/$OWNER_REPO/branches/$DEFAULT_BRANCH/protection" > "$ACTUAL_RAW"

  FILTER=scripts/lib/normalize-branch-protection.jq
  jq -S -f "$FILTER" "$ACTUAL_RAW"        > "$ACTUAL_NORM"
  jq -S -f "$FILTER" "$BRANCH_PROTECTION" > "$EXPECTED_NORM"

  if diff -u "$EXPECTED_NORM" "$ACTUAL_NORM" >&2; then
    echo "✔ branch protection matches branch-protection.json"
    return 0
  else
    echo "✖ drift detected between branch-protection.json and GitHub" >&2
    return 5
  fi
}
```

The `trap ... RETURN` is the bash equivalent of "clean up when this function returns"; matches the script's existing `trap ... EXIT` pattern but scoped to the function body so successful apply runs that come after a successful verify still clean up.

The `--check` branch is added after argument parse, before the apply block:

```bash
if [[ "$CHECK" == "1" ]]; then
  echo "target: $OWNER_REPO (branch: $DEFAULT_BRANCH)"
  verify_branch_protection
  exit $?
fi
```

This skips both `gh api PATCH` and `gh api PUT`. The post-apply path becomes a single call to `verify_branch_protection`.

Mutual-exclusion guard, placed at the bottom of the argument-parse loop:

```bash
combined=$(( DRY_RUN + SKIP_VERIFY + CHECK ))
if (( combined > 1 )); then
  echo "--check, --dry-run, and --skip-verify are mutually exclusive" >&2
  usage >&2
  exit 2
fi
```

### `--help` text

Updated usage block:

```
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
```

### Workflow changes

`.github/workflows/audit.yml` gets a second job. The existing `audit` job stays; the new job is sibling, not dependent.

```yaml
jobs:
  audit:
    # ... unchanged ...

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

The `if: ${{ github.event_name != 'pull_request' }}` skip exists because the audit workflow's `pull_request` trigger fires only on lockfile changes (Cargo.lock, uv.lock, deny.toml, pyproject.toml). Drift-check on PR-time has no signal to add; the job is schedule + manual-dispatch only.

The `concurrency: audit-${{ github.ref }} cancel-in-progress: true` group at the workflow level already serializes both jobs; no per-job concurrency override needed.

### Issue template

`.github/drift-check-failure-issue.md`:

```yaml
---
title: 'CI: GitHub repo settings drift detected'
labels:
  - ci-audit
  - bug
assignees:
  - pgoell
---
```

Body explains: open the run log, look at the diff in the `drift-check` job's `Check repo settings drift` step, decide whether to revert the live setting (run `mise run repo:apply-settings`) or update `docs/superpowers/branch-protection.json` to match the new intent, push a fix, re-run the workflow with `gh workflow run audit.yml`, close the issue when green.

The dedup contract: title must match the `title:` field in this file (case-sensitive). Comment in the workflow file pins the title there too. Same shape as `.github/audit-failure-issue.md`.

### Test changes

Three new pytest cases plus one mutual-exclusion case in `scripts/tests/test_apply_github_settings.py`. Reuse `mock_gh` fixture verbatim.

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
    assert "mutually exclusive" in result.stderr.lower() or "cannot" in result.stderr.lower()
```

### Exit codes (unchanged)

| Code | Meaning |
|---|---|
| 0   | Success (apply + diff clean, dry-run, or `--check` clean) |
| 2   | Missing prerequisite (`gh`, `jq`, unknown flag, or mutually exclusive flags) |
| 3   | `gh` not authenticated |
| 4   | Cannot resolve current repo / default branch |
| 5   | Drift detected (apply-mode readback or `--check` mode) |

## Commit split

Three commits:

1. `feat(scripts): add --check drift-detection mode to apply-github-settings.sh` — script change (function extraction + new flag + mutual-exclusion guard + `--help`) plus the four new test cases. Function extraction is structural; the new flag is the behaviour. They ship together because the flag depends on the structure (CLAUDE.md's "no structural + behavioural in one commit" rule does not apply when the structural change exists *to enable* the behaviour change in the same file).
2. `ci(audit): add drift-check job to audit workflow` — workflow + issue template.
3. `docs: spec for repo-settings drift-check + close OPEN_THINGS task` — this file + OPEN_THINGS.md update.

## Smoke verification

Before push:

```sh
# 1. Local: pytest passes the new cases.
mise run test:py -- scripts/tests/test_apply_github_settings.py -v

# 2. Local: --check against the live repo. Expect exit 0.
bash scripts/apply-github-settings.sh --check
echo "exit: $?"

# 3. Local: mutual-exclusion sanity.
bash scripts/apply-github-settings.sh --check --dry-run
echo "exit: $?"  # expect 2
```

Step 2 is GET-only against the live repo. If it surfaces actual drift, fix `branch-protection.json` (or the live setting) before merging.

## Risks

1. **First scheduled run surfaces existing drift.** Mitigated by step 2 of smoke verification.
2. **Issue-template title collision with `audit-failure-issue.md`.** Mitigated by distinct titles. `JasonEtco/create-an-issue` dedups by title-within-repo.
3. **`gh` CLI version drift.** Setup-mise pins `gh` via aqua. No additional mitigation needed.
4. **Cron stampede.** Both audit jobs run on the same `17 6 * * 1` schedule; existing `concurrency: audit-${{ github.ref }}` group already prevents overlapping runs.
5. **The existing function-extraction touches the apply path.** All existing test cases must still pass without modification (CLAUDE.md "behaviour preserved across tidy commit" rule). The function-extraction is verified by the seven existing tests covering apply order, input files, endpoints, clean-readback exit zero, drift exit 5, and skip-verify behaviour.

## Open questions

None. The design is constrained tightly enough by the OPEN_THINGS bullet and the original spec's deferred-section that the brainstorm closed without surprises.
