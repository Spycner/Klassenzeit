# Apply-github-settings wrapper script

**Date:** 2026-04-22
**Status:** Design approved (autopilot, autonomous mode), plan pending.

## Problem

`docs/superpowers/branch-protection.json` and `docs/superpowers/repo-settings.json` are the checked-in record of the repo's GitHub-side configuration: merge-button behaviour, required status checks, linear-history enforcement, delete-branch-on-merge, squash commit formatting. Applying them today requires running two `gh api` calls in a specific order:

1. `PATCH /repos/:owner/:repo` with `repo-settings.json`, which flips `allow_squash_merge: true` and `allow_merge_commit: false`.
2. `PUT /repos/:owner/:repo/branches/master/protection` with `branch-protection.json`, which sets `required_linear_history: true` plus the three required checks.

Running them in the wrong order fails with HTTP 422, because `required_linear_history: true` requires squash- or rebase-merge to be enabled first. `OPEN_THINGS.md` calls this out under "CI / repo automation":

> Branch and repo settings need a wrapper script. [...] They must be applied in the correct order on a fresh repo [...]. Currently you'd run two `gh api` commands by hand in order. Fold them into a wrapper script (`scripts/apply-github-settings.sh` or similar) so the order is encoded once.

Drift is the secondary problem: the JSON files can diverge from the live GitHub settings (for example if someone toggles a checkbox in the web UI). Nothing today compares the two.

## Goal

Ship `scripts/apply-github-settings.sh` that applies both JSON files in the correct order, reads branch protection back, diffs the readback against `branch-protection.json`, and fails loudly on drift. Expose it as a `mise run repo:apply-settings` task. Add a pytest test that stubs `gh` / `jq` on `PATH` and asserts the call order and drift-detection paths. Update `OPEN_THINGS.md` to replace the wrapper-script bullet with a single deferred follow-up for a `--check` drift-detection mode.

## Non-goals

- **Changing the contents of either JSON file.** Tightening required checks, adding `e2e-gate`, or adjusting merge-commit formatting are tracked separately in OPEN_THINGS.
- **Terraform or Probot or GitHub App.** A shell script applying two `gh api` calls is the whole problem at this scale.
- **Applying settings to repos other than the current one.** The script resolves `owner/repo` from the current git remote via `gh repo view`; pointing it at a different repo is deliberately not supported.
- **A nightly drift-check CI job.** Tempting, but it overlaps with the "auto-issue on audit failure" OPEN_THINGS item; wiring it in without the issue-creation pipeline creates noise. The readback-and-diff logic is factored into a function so exposing `--check` later is a one-line patch.
- **shellcheck in `mise run lint`.** Not part of the existing lint set. Worth considering separately; out of scope here.
- **Token or auth management.** Delegated to `gh auth status` / `gh auth login`.

## Design

### Script shape

`scripts/apply-github-settings.sh`, mode `0755`. Shebang + strict mode per repo convention (`#!/usr/bin/env bash`, `set -euo pipefail`). `cd "$(dirname "$0")/.."` up front so relative paths to `docs/superpowers/*.json` work regardless of invocation dir.

### CLI

Three flags, parsed with a small `case` loop:

- `--dry-run`: print the `gh api` commands that would be executed (with their `--input` paths) and exit 0 without touching GitHub.
- `--skip-verify`: apply both settings but skip the readback-and-diff step. Useful in environments where readback is undesirable (rate-limit pressure) or when fixing a known transient mismatch.
- `--help`: print usage and exit 0.

Unknown flags emit a usage hint and exit 2. Positional args are rejected.

### Pre-flight

Before any mutation:

1. `command -v gh >/dev/null || exit_with "gh is required; see https://cli.github.com/"` (exit code 2).
2. `command -v jq >/dev/null || exit_with "jq is required"` (exit code 2).
3. `gh auth status >/dev/null 2>&1 || exit_with "gh auth status failed; run 'gh auth login'"` (exit code 3).
4. Resolve `owner`, `repo`, `default_branch`:
   ```bash
   gh repo view --json nameWithOwner,defaultBranchRef --jq '.nameWithOwner + " " + .defaultBranchRef.name'
   ```
   Split into `$owner/$repo` and `$default_branch`. If this fails (no GitHub remote, outside a repo), exit 4 with a clear message. The script does not hard-code `master`; it reads whatever GitHub considers default.

### Apply order

```bash
echo "→ Applying repo-level settings to $owner/$repo"
gh api --method PATCH "/repos/$owner/$repo" --input docs/superpowers/repo-settings.json >/dev/null

echo "→ Applying branch protection for $owner/$repo/$default_branch"
gh api --method PUT "/repos/$owner/$repo/branches/$default_branch/protection" \
  --input docs/superpowers/branch-protection.json >/dev/null
```

Both calls are idempotent server-side. `>/dev/null` suppresses the 200-response body noise; the exit code is what matters, and `set -e` surfaces a non-zero exit immediately.

In `--dry-run` mode, both `gh api` invocations are replaced with `echo "would run: gh api ..."` using the same command strings, so reviewers can eyeball the exact call that would have been made.

### Readback and drift diff

Unless `--skip-verify`, fetch the live protection and diff it against the source:

```bash
gh api "/repos/$owner/$repo/branches/$default_branch/protection" > /tmp/kz-protection-actual.json

jq -S -f scripts/lib/normalize-branch-protection.jq \
  /tmp/kz-protection-actual.json > /tmp/kz-protection-actual.norm.json
jq -S -f scripts/lib/normalize-branch-protection.jq \
  docs/superpowers/branch-protection.json > /tmp/kz-protection-expected.norm.json

diff -u /tmp/kz-protection-expected.norm.json /tmp/kz-protection-actual.norm.json
```

`scripts/lib/normalize-branch-protection.jq` is a small `jq` program (~20 lines) that:

- drops read-only fields (`url`, `enabled` at the top level if present, nested `url` entries),
- unwraps `{"enabled": bool}` object wrappers the API adds on GET but not on PUT (e.g. `required_linear_history` returns `{"enabled": true}`; the PUT body uses a bare `true`),
- sorts `required_status_checks.contexts` alphabetically so array order does not drift,
- drops fields GitHub returns by default that aren't set in our JSON (e.g. `required_conversation_resolution.url`).

Keeping the filter in a standalone `.jq` file (rather than inline in the script) makes it easier to test and to extend when GitHub adds fields. The filter is small enough that its contents live entirely in the spec's "jq filter shape" section below.

On an empty diff the script prints `✔ branch protection matches branch-protection.json` and exits 0. On a non-empty diff it exits 5 and surfaces the unified diff to stderr.

**Repo-settings readback is deliberately not diffed.** The `PATCH /repos/:owner/:repo` response includes 80+ unrelated fields (topics, visibility, sizes, default branch metadata). Filtering them cleanly is more work than the drift detection is worth, and the failure mode `repo-settings.json` guards against (HTTP 422 on the protection PUT) is already caught by step 2 exiting non-zero. Branch protection is where drift has caused the real incident pattern, so it is the only readback worth the complexity.

### `jq` filter shape

`scripts/lib/normalize-branch-protection.jq`:

```jq
# Normalize a GitHub branch-protection JSON document (either the checked-in
# PUT payload or the response from GET /repos/:owner/:repo/branches/:branch/protection)
# so the two shapes can be diffed for drift detection.
del(.url)
| del(.. | .url? | select(. != null))
| (.required_linear_history // false)
  as $linear | .required_linear_history = (
    if ($linear | type) == "object" then $linear.enabled else $linear end
  )
| (.allow_force_pushes // false)
  as $force | .allow_force_pushes = (
    if ($force | type) == "object" then $force.enabled else $force end
  )
| (.allow_deletions // false)
  as $del | .allow_deletions = (
    if ($del | type) == "object" then $del.enabled else $del end
  )
| (.block_creations // false)
  as $bc | .block_creations = (
    if ($bc | type) == "object" then $bc.enabled else $bc end
  )
| (.required_conversation_resolution // false)
  as $rcr | .required_conversation_resolution = (
    if ($rcr | type) == "object" then $rcr.enabled else $rcr end
  )
| (.lock_branch // false)
  as $lb | .lock_branch = (
    if ($lb | type) == "object" then $lb.enabled else $lb end
  )
| (.allow_fork_syncing // false)
  as $afs | .allow_fork_syncing = (
    if ($afs | type) == "object" then $afs.enabled else $afs end
  )
| if .required_status_checks then
    .required_status_checks.contexts = (.required_status_checks.contexts | sort)
  else . end
```

If GitHub adds a new boolean-becomes-object field in the future, extend the filter. The `check` test will fail with a specific diff pointing at the offending field, which is the desired signal.

### Mise task

```toml
[tasks."repo:apply-settings"]
description = "Apply GitHub repo + branch-protection settings from docs/superpowers/*.json"
run = "bash scripts/apply-github-settings.sh"
```

Flags forwarded via `mise run repo:apply-settings -- --dry-run`. No `depends`, no `env`; it is a one-shot orchestration task.

### Exit codes

| Code | Meaning |
|---|---|
| 0   | Success (apply + diff clean, or dry-run) |
| 2   | Missing prerequisite (`gh`, `jq`, or unknown flag) |
| 3   | `gh` not authenticated |
| 4   | Cannot resolve current repo / default branch |
| 5   | Drift detected (branch-protection readback differs from JSON) |
| >0  | Any `gh api` call returned non-zero (surfaced via `set -e`) |

### Tests

`scripts/tests/test_apply_github_settings.py`, pytest style (matches `test_check_unique_fns.py` and `test_gen_commit_types.py`). Strategy: stub `gh` and `jq` on `PATH` via a tmp directory prepended to the test's environment. The mock `gh` is a small shell script that:

- records its own argv + stdin (via `--input` file content) to a log file,
- returns scripted responses based on a `MOCK_GH_RESPONSE_DIR` env var,
- exits non-zero when asked to simulate failure (tested via a dedicated test case).

Test cases:

1. **`test_dry_run_does_not_call_gh_api`** — runs the script with `--dry-run`, asserts the mock `gh` log contains exactly one `gh repo view ...` (the preflight / resolution call) and one `gh auth status`, but no `gh api --method PATCH` or `PUT`.
2. **`test_apply_order_is_repo_settings_then_protection`** — runs without flags, asserts the mock log shows `PATCH /repos/...` strictly before `PUT /repos/.../branches/.../protection`.
3. **`test_apply_passes_correct_input_files`** — reads the captured `--input` paths and asserts they resolve to the two JSON files.
4. **`test_skip_verify_skips_readback`** — runs with `--skip-verify`, asserts no GET on `/branches/.../protection` was made.
5. **`test_drift_detection_exits_5`** — configures the mock to return a readback JSON that mutates one field; asserts exit code 5 and a recognizable diff line on stderr.
6. **`test_clean_readback_exits_0`** — mock returns a readback identical to `branch-protection.json` modulo the normalized fields; asserts exit 0.
7. **`test_missing_gh_exits_2`** — empties `PATH` of `gh`, asserts exit 2 and a message mentioning `gh`.
8. **`test_unknown_flag_exits_2`** — passes `--badflag`, asserts exit 2 and a usage hint.

The tests live alongside existing `scripts/tests/*` and run inside `mise run test:py`. `pytest` collects them automatically because the file matches `test_*.py`.

One caveat: the mock `gh`'s emitted JSON has to exercise the `jq` filter, not just be identical bytes, because the point of the filter is handling the `{"enabled": true}` wrapper shape. The fixture JSON includes at least one wrapped field and one unwrapped field so both branches of the `jq` filter are exercised.

### Manual smoke test

In the PR body:

```sh
mise run repo:apply-settings -- --dry-run
```

Expected output (approximate):

```
→ Applying repo-level settings to pgoell/Klassenzeit (dry run)
  would run: gh api --method PATCH /repos/pgoell/Klassenzeit \
    --input docs/superpowers/repo-settings.json
→ Applying branch protection for pgoell/Klassenzeit/master (dry run)
  would run: gh api --method PUT /repos/pgoell/Klassenzeit/branches/master/protection \
    --input docs/superpowers/branch-protection.json
✔ dry run complete, no changes made
```

### File touch list

- `scripts/apply-github-settings.sh` — new (executable, `0755`).
- `scripts/lib/normalize-branch-protection.jq` — new.
- `scripts/tests/test_apply_github_settings.py` — new.
- `mise.toml` — add `[tasks."repo:apply-settings"]`.
- `README.md` — add `mise run repo:apply-settings` row to the commands table.
- `CONTRIBUTING.md` — add a short "Applying repo settings" subsection that points at the script and mentions `--dry-run` as the recommended first run.
- `docs/superpowers/OPEN_THINGS.md` — remove the "Branch and repo settings need a wrapper script" bullet; replace with a single "Wire `mise run repo:apply-settings` drift-check into `audit.yml` once the auto-issue pipeline lands" bullet.
- `.claude/CLAUDE.md`, `.claude/rules/*` — no changes. The script is tooling, not a code convention.

### Commit structure

Conventional Commits, three small commits:

1. `chore(scripts): add apply-github-settings wrapper` — the script, the `jq` filter, the pytest test, executable bit. Self-contained: TDD chunk red-green-refactor is atomic within this commit.
2. `chore(mise): expose repo:apply-settings task` — one task addition in `mise.toml`.
3. `docs: document apply-github-settings script` — `README.md` row, `CONTRIBUTING.md` subsection, `OPEN_THINGS.md` swap.

`chore` is the right type (see `.github/commit-types.yml`: "Other changes that don't touch src or tests"). `ci` is reserved for `.github/workflows/*` changes; this script applies settings to GitHub but is not a workflow. `build` does not fit either; there is no build-system or dependency change.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Script is run against the wrong repo | `gh repo view` resolves `owner/repo` from the current git remote; the summary in the first echo names the target before any mutation. `--dry-run` is the recommended first run. |
| `gh` minor version changes readback JSON shape | The `jq` filter is localized in `scripts/lib/normalize-branch-protection.jq`; fix the filter in a follow-up commit without touching the checked-in JSON. |
| Token lacks repo-admin permission | `gh api` returns 403, `set -e` exits non-zero, user sees the gh-rendered error. No special handling. |
| Someone edits the JSON and forgets to reapply | Handled by the deferred `--check` mode + `audit.yml` drift check (new OPEN_THINGS entry, tracked). |
| Script fails between PATCH and PUT | Both calls are idempotent; re-running converges state. |
| Pytest test flakes because of `PATH` ordering | The mock `PATH` is prepended, not replaced; the real `gh` remains available but never first. Tests set `PATH=/tmp/mock:$PATH` explicitly. |
| `jq` filter misses a newly-introduced GitHub field | `test_clean_readback_exits_0` fails loudly; the fix is a one-line filter extension. |

## Verification

After landing the PR:

1. On a throwaway branch, run `mise run repo:apply-settings -- --dry-run` and confirm the printed commands match this spec's "Manual smoke test" section.
2. On the main checkout, run `mise run repo:apply-settings`; observe the `✔ branch protection matches` line and exit 0.
3. Re-run immediately. Same result. Idempotent.
4. Locally, duplicate `docs/superpowers/branch-protection.json` to a tmp copy, flip `required_linear_history` to `false`, point the script at the tmp file (via a temporary `sed` edit), run without `--skip-verify`. Confirm exit 5 and a readable diff. Revert.
5. `mise run test:py` runs `scripts/tests/test_apply_github_settings.py` alongside the others, 8 tests pass.
6. CI on the PR is green.

## Follow-ups (not this PR)

- Expose a `--check` flag that readbacks and diffs without applying; wire it into `audit.yml` once the auto-issue-on-audit-failure pipeline exists.
- Consider adding `shellcheck` to `mise run lint`; out of scope for this PR but would catch regressions in `scripts/*.sh` going forward.
- If multiple repos ever share this tooling, move `scripts/apply-github-settings.sh` to a template or small Python CLI that accepts an explicit `--repo owner/name`.
