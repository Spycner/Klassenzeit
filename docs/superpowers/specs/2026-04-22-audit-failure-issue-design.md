# Auto-issue on weekly audit failure

**Date:** 2026-04-22
**Status:** Design approved (autopilot, autonomous mode), plan pending.

## Problem

`.github/workflows/audit.yml` runs `mise run audit` (currently `cargo deny check` and `uvx pip-audit`) on a Monday 06:17 UTC cron. When the scheduled run fails, the failure surfaces only in the Actions tab: no email, no PR check, no issue. At the repo's current cadence ("once a week, maybe less") a failed audit can sit unseen for a full cycle before anyone notices, which is precisely the window in which a freshly published CVE is both in-scope and ignored.

`docs/superpowers/OPEN_THINGS.md` calls this out under "CI / repo automation":

> **Auto-issue creation on weekly audit failure.** The `audit.yml` cron run is informational only, failures show up in the Actions tab but nothing pages anyone. Standard pattern uses `JasonEtco/create-an-issue@v2` with a templated body. Wire this in once the audit produces enough signal to be worth the noise.

A related OPEN_THINGS item is blocked on this work: "Drift-check mode for `repo:apply-settings`" explicitly defers its nightly scheduler until the auto-issue-on-audit-failure pipeline exists, so shipping this PR also unblocks that follow-up.

## Goal

Extend `.github/workflows/audit.yml` so that a failed *scheduled* run opens or reuses one tracking issue with a stable title, a templated body pointing at the failing run, the labels `ci-audit` and `bug`, and an assignee. Every new failure appends a timestamped comment, so the issue collects history even though its body is rewritten on each run. Add `actionlint` to `mise run lint` in a preceding tidy commit so YAML or expression errors in the new step (or any future workflow edit) fail locally before they fail in CI.

## Non-goals

- **Auto-closing the tracking issue on a subsequent green run.** A human closes the issue after confirming the fix held. Auto-close hides the "flapping check" signal.
- **Filing issues for PR, push, or `workflow_dispatch` failures.** Those events already have human eyes on them (PR check status, author watching their click). Adding an issue would be noise.
- **Generalising the issue-creation step into a reusable composite action.** YAGNI: one caller today. Generalise when the drift-check follow-up needs the same pattern.
- **Simulated-failure input for the workflow.** A `workflow_dispatch` input that forces the audit step to `exit 1` would make testing easier, but the test-only YAML lives forever and the behaviour can be validated once post-merge with a throwaway branch.
- **Rewriting the `mise run audit` pipeline itself.** Scope is purely the notification path.
- **Email or chat notifications.** GitHub's native Issues UI is the notification surface.

## Design

### Two commits, tidy-first split

1. `ci(lint): add actionlint to mise lint task` — structural-only, no workflow behaviour change.
2. `ci(audit): open tracking issue when scheduled audit fails` — behavioural, adds the notification path.

A structural change and a behavioural change never ship together (project rule). The first commit passes `actionlint` over the existing workflows as a side effect and catches any pre-existing YAML issues before the second commit lands on top. If actionlint finds real issues in existing workflows, fix them in the same first commit.

### Commit 1: `ci(lint): add actionlint to mise lint task`

**`mise.toml`**

Add under `[tools]`:

```toml
"ubi:rhysd/actionlint" = "1.7"
```

A specific major/minor pin matches the `lefthook` pattern; `latest` makes CI non-reproducible. `1.7` is current as of 2026-04; track upstream releases as part of normal dep bumps.

Append a new subtask and chain it into `mise run lint`:

```toml
[tasks."check:actions"]
description = "Lint GitHub Actions workflows with actionlint"
run = "actionlint"
```

and update the existing `[tasks.lint]` `depends = [...]` list to include `check:actions`.

**Existing workflows.** Run `actionlint` once locally; fix any findings inline in this same commit. Likely findings: none, one or two `shellcheck`-style quibbles inside `run:` blocks. If any require semantic change, fold them into this commit only if behaviour-preserving (stricter quoting, missing `shell:` key, etc.). Anything that would change workflow behaviour gets a separate `fix(ci): ...` commit before commit 2.

### Commit 2: `ci(audit): open tracking issue when scheduled audit fails`

**`.github/workflows/audit.yml`** grows a job-level `permissions` block and two post-failure steps.

```yaml
permissions:
  contents: read

jobs:
  audit:
    name: Supply-chain audit
    runs-on: ubuntu-latest
    permissions:
      contents: read
      issues: write
    steps:
      - uses: actions/checkout@v6
      - uses: ./.github/actions/setup-mise
      - name: Run mise audit pipeline
        run: mise run audit

      - name: Open or update tracking issue
        if: failure() && github.event_name == 'schedule'
        uses: JasonEtco/create-an-issue@<pinned-sha>
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          RUN_URL: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
          RUN_NUMBER: ${{ github.run_number }}
          RUN_ATTEMPT: ${{ github.run_attempt }}
          TRIGGER_EVENT: ${{ github.event_name }}
        with:
          filename: .github/audit-failure-issue.md
          update_existing: true

      - name: Append run link as comment on tracking issue
        if: failure() && github.event_name == 'schedule'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          RUN_URL: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
        run: |
          set -euo pipefail
          issue_number=$(gh issue list \
            --label ci-audit \
            --state open \
            --search 'CI: weekly supply-chain audit failing in:title' \
            --json number \
            --jq '.[0].number // empty')
          if [[ -z "$issue_number" ]]; then
            echo "No open ci-audit issue found; create-an-issue should have opened one." >&2
            exit 1
          fi
          gh issue comment "$issue_number" --body "Scheduled audit failed again on $(date -u '+%Y-%m-%d %H:%M UTC'). Run: $RUN_URL"
```

Notes on the shape:

- **Third-party action pinning.** `JasonEtco/create-an-issue@v2` is a moving tag. Pin by commit SHA (the latest `v2.x` release's SHA) and drop the `v2` label in a comment on the same line so future bumps are auditable. This matches `actions/checkout@v6` being the GH-official case; third-party actions get SHA-pinned.
- **`if: failure()`** at step level is distinct from job-level: the step runs only when a preceding step in the same job has already failed. Combined with `github.event_name == 'schedule'` it gates correctly.
- **`update_existing: true`** reopens a closed issue if one matches by title. That is desired behaviour: recurrence of the same problem reopens the ticket with its history intact.
- **Comment step** uses the `gh` CLI (pre-installed on ubuntu-latest runners) rather than a second marketplace action. `GH_TOKEN` is the env var `gh` picks up natively.

**`.github/audit-failure-issue.md`** (new file). Format expected by `JasonEtco/create-an-issue@v2`: YAML front matter followed by Markdown body. Go-template tags `{{ env.FOO }}` interpolate from the action's `env:`.

```markdown
---
title: 'CI: weekly supply-chain audit failing'
labels:
  - ci-audit
  - bug
assignees:
  - pgoell
---
<!--
  DO NOT edit the title in this file or in the workflow that references it.
  The title is the dedup key for `JasonEtco/create-an-issue@v2` with
  `update_existing: true`. Changing it produces duplicate issues.
-->

The scheduled supply-chain audit ([`.github/workflows/audit.yml`](../../.github/workflows/audit.yml)) failed.

- **Latest failing run:** [#{{ env.RUN_NUMBER }} attempt {{ env.RUN_ATTEMPT }}]({{ env.RUN_URL }})
- **Trigger:** `{{ env.TRIGGER_EVENT }}`

## What to do

1. Open the run log linked above and scroll to the first red step.
2. If `cargo deny check` failed, the output lists the offending advisory and the crate + version responsible. Bump the crate in `Cargo.toml` or add a documented exception in `deny.toml`.
3. If `uvx pip-audit` failed, the output lists the Python package + advisory. Resolve via `uv add <pkg>@<safe-version>` (never hand-edit `pyproject.toml`).
4. Push a fix branch, land it, and trigger the audit workflow manually via `gh workflow run audit.yml`. If the re-run is green, close this issue.

## History

Comments on this issue are appended by the workflow every time the scheduled run fails again. The issue body is overwritten on each run to reflect the latest failing run; earlier failures live in the comment stream below.
```

**`audit.yml` header comment.** Add a short comment at the top of the `audit` job noting the dedup contract:

```yaml
# The "Open or update tracking issue" step below relies on the title in
# .github/audit-failure-issue.md being stable. Do not change the title
# without a migration plan (the title is the dedup key).
```

### Permissions model

Workflow-level `permissions: contents: read` is kept as-is. Only the `audit` job adds `issues: write`. Any future job added to this workflow will inherit the workflow-level read-only default unless it opts in.

### Failure modes and recovery

| Failure | What happens | Recovery |
| --- | --- | --- |
| `create-an-issue` hits rate limit or API 5xx | The step errors, but the audit has already failed. The issue is not created this round; no silent success. | Next week's scheduled run tries again. |
| `gh issue list` returns no open issue in the comment step | The script logs a diagnostic and `exit 1`s so the run status is red (workflow is already red, but we want the secondary failure to surface). | Manual inspection: the issue creation step probably errored too. |
| Title got edited, dedup broken | Multiple open issues accumulate. | Close dupes manually, restore canonical title in the template. The top-of-file comment deters this. |
| Issue closed as "won't fix" | Next failure reopens it (by design). | Relabel `won't fix` and close again; or edit the workflow to skip creation for that specific case. |

### Testing

- **Static:** `mise run lint` now runs `actionlint`. Pre-commit hook catches regressions locally; CI catches them on PRs.
- **Semantic:** PR review inspects the workflow diff.
- **Behavioural (post-merge, one-shot):** Maintainer creates a throwaway branch that makes the audit step fail deterministically (e.g., adds a `deny = ["advisories"]` rule in `deny.toml` citing an advisory present in the current lockfile), triggers `workflow_dispatch` with that branch, confirms the step is skipped (because `TRIGGER_EVENT != schedule`), then uses GitHub's REST API or a `workflow_run: schedule`-scoped rerun to simulate the cron path. Remove the throwaway branch.

The behavioural validation is explicitly **not** part of the merged PR. The PR body calls it out as a follow-up action.

## Open questions

None load-bearing. All choices have documented trade-offs above and the selected option's reasoning.

## Follow-ups tracked back in OPEN_THINGS

- **Drift-check mode for `repo:apply-settings`** — now unblocked by this PR. Remove the "once the auto-issue pipeline exists" qualifier in the OPEN_THINGS entry.
- **Auto-close on recovery.** Track if the manual-close step starts feeling repetitive.
- **Composite-action extraction.** Track if and when the drift-check workflow duplicates more than three lines of the pattern from `audit.yml`.
