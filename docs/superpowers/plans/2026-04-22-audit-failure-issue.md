# Auto-issue on weekly audit failure — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When `.github/workflows/audit.yml` fails on its weekly `schedule`, open (or reopen) one tracking issue with a stable title and append a timestamped comment linking to the failing run. Add `actionlint` to `mise run lint` in a preceding tidy commit so new workflow edits are lint-checked.

**Architecture:** Two commits on branch `ci/audit-issue-on-failure`. Commit 1 wires `ubi:rhysd/actionlint` into `mise.toml` and chains `check:actions` into the `lint` task, a structural no-op for workflow behaviour. Commit 2 extends `audit.yml` with a job-level `permissions` block and two failure-path steps (`JasonEtco/create-an-issue@<sha>` to dedupe by title, then `gh issue comment` to append history), both gated on `github.event_name == 'schedule'`. A new `.github/audit-failure-issue.md` template carries the title, labels, assignee, and body.

**Tech Stack:** mise-en-place, GitHub Actions YAML, the `JasonEtco/create-an-issue@v2.9.2` marketplace action (pinned by commit SHA `1b14a70e4d8dc185e5cc76d3bec9eab20257b2c5`), the `gh` CLI (pre-installed on `ubuntu-latest`), actionlint `1.7.12`.

**Working directory:** The autopilot run already cut branch `ci/audit-issue-on-failure` off `master`. Implementation continues in the same session.

---

## File Structure

- **Create:** `.github/audit-failure-issue.md` — front-matter + Markdown body consumed by `JasonEtco/create-an-issue@v2`. Title is the dedup key.
- **Create:** `docs/adr/` entries — **no ADR** (mechanical change, uses a standard marketplace pattern; decision already recorded in the spec).
- **Modify:** `mise.toml` — add `ubi:rhysd/actionlint = "1.7.12"` under `[tools]`; add `[tasks."check:actions"]`; append `"check:actions"` to `[tasks.lint].depends`.
- **Modify:** `.github/workflows/audit.yml` — add job-level `permissions`, two failure-path steps, and a top-of-job comment noting the title is a dedup key.
- **Modify:** `docs/superpowers/OPEN_THINGS.md` — remove the resolved `Auto-issue creation on weekly audit failure` bullet; rewrite the `Drift-check mode for repo:apply-settings` bullet to drop the "once the auto-issue pipeline exists" qualifier (now unblocked).
- **Modify:** `docs/architecture/overview.md` — add a line under CI describing the failure-to-issue flow. (Check section headings first; add only if a CI section exists.)
- **Modify:** `CONTRIBUTING.md` — note `actionlint` runs as part of `mise run lint`, in the existing "Tooling" or "Lint" section.

Each file's role is narrow and its boundary is obvious; none of the changes needs to touch code outside `.github/`, `mise.toml`, or docs.

---

## Task 1: Add actionlint to the mise lint task

**Files:**
- Modify: `mise.toml` — `[tools]` block (around lines 3-14) and add a new `[tasks."check:actions"]` task, update `[tasks.lint].depends`.

- [ ] **Step 1: Install actionlint locally and verify the binary works**

Run:

```bash
mise install "ubi:rhysd/actionlint@1.7.12"
mise exec "ubi:rhysd/actionlint@1.7.12" -- actionlint --version
```

Expected output: a line starting with `1.7.12`.

If `mise install` fails because the `ubi` backend cannot resolve the release, fall back to `ubi:rhysd/actionlint@latest`, pin the version actually resolved in `mise.toml`, and note the drift in the commit message.

- [ ] **Step 2: Write the failing "lint runs actionlint" check**

There is no test framework for mise tasks. The failure surface is the `mise run lint` command itself. To reproduce the "actionlint is not wired in" baseline, run:

```bash
mise run lint 2>&1 | grep -c actionlint || echo "actionlint not in lint pipeline"
```

Expected: prints `actionlint not in lint pipeline` (grep exits 1 with count 0).

This is the red state. Record the output as the "before" reference in your scratch notes.

- [ ] **Step 3: Add actionlint to `[tools]`**

Edit `mise.toml` under `[tools]` (keep alphabetical-ish grouping with the other `ubi:` entries):

```toml
[tools]
rust    = "1.93"
python  = "3.14.2"
uv      = "latest"
node    = "22"
"aqua:pnpm/pnpm"             = "latest"
"cargo:cocogitto"            = "latest"
"ubi:evilmartians/lefthook"  = "1.11.14"
"ubi:rhysd/actionlint"       = "1.7.12"
"cargo:cargo-nextest"        = "latest"
"cargo:cargo-llvm-cov"       = "latest"
"cargo:cargo-machete"        = "latest"
"cargo:cargo-deny"           = "latest"
```

- [ ] **Step 4: Add the `check:actions` task and chain it into `lint`**

Open `mise.toml`, find the `[tasks.lint]` block (search for `depends` under a `lint` task or the first `lint` anchor around line 152+). Append a new subtask:

```toml
[tasks."check:actions"]
description = "Lint GitHub Actions workflows with actionlint"
run = "actionlint"
```

Place it near the other `check:*` tasks (e.g., `check:commit-types`). Then update `[tasks.lint].depends` to include `"check:actions"`.

If `[tasks.lint]` is expressed as a plain `run = [...]` list rather than `depends`, instead add a command invoking `actionlint` directly to the list, preserving order.

- [ ] **Step 5: Run `actionlint` against the existing workflows and fix findings inline**

Run:

```bash
mise exec -- actionlint
```

Expected: zero findings. Likely findings in this codebase:
- `shellcheck` noise inside `run:` blocks (`SC2086`, `SC2046`). Fix by quoting or add `# shellcheck disable=SC####` with a one-line justification.
- Missing `shell:` keys on multi-line `run:` blocks on non-default runners. `ubuntu-latest` defaults to `bash`, so this is unlikely.
- `uses:` pinned to a moving tag. Do **not** SHA-pin existing GitHub-official actions (e.g., `actions/checkout@v6`) in this commit; scope is actionlint wiring only. Anything flagged as SHA-pin noise for first-party `actions/*` gets an `actionlint`-directed ignore if needed (but the checks for SHA pinning default off).

If any finding requires a semantic workflow change, **stop** and peel that off into its own `fix(ci): ...` commit before proceeding. Structural commit must stay behavior-preserving.

- [ ] **Step 6: Verify the new wiring catches a seeded error**

To confirm `actionlint` actually runs via `mise run lint`, seed a temporary syntax error and assert the task fails:

```bash
# Seed a broken step name reference
cp .github/workflows/audit.yml /tmp/audit.yml.bak
python3 - <<'EOF'
import pathlib
p = pathlib.Path(".github/workflows/audit.yml")
text = p.read_text()
# Insert an invalid expression into the job's `if:`.
p.write_text(text.replace("runs-on: ubuntu-latest", "runs-on: ubuntu-latest\n    if: ${{ bogus.context.value }}"))
EOF

mise run lint
# Expected: non-zero exit, actionlint diagnostic mentions "bogus"

# Restore
mv /tmp/audit.yml.bak .github/workflows/audit.yml
```

Expected: `mise run lint` returns non-zero with a line like `audit.yml:NN:CC: property "bogus" is not defined in object type ...`.

After restoring, re-run `mise run lint`; expect green.

- [ ] **Step 7: Commit**

```bash
git add mise.toml
git commit -m "ci(lint): add actionlint to mise lint task"
```

Commit body (use a heredoc if the one-liner is insufficient):

```
Wires ubi:rhysd/actionlint 1.7.12 into [tools] and chains a new
check:actions subtask into `mise run lint`. No workflow behaviour
changes; any actionlint findings against existing workflows were
fixed inline in this commit.
```

If any workflow YAML was edited to silence a finding (quoting, shellcheck disables), include a short bullet list in the body naming each file.

---

## Task 2: Add the audit-failure issue template

**Files:**
- Create: `.github/audit-failure-issue.md`

- [ ] **Step 1: Write the failing "template exists" check**

Run:

```bash
test -f .github/audit-failure-issue.md && echo "exists" || echo "missing"
```

Expected: `missing`.

- [ ] **Step 2: Create the template file**

Write `.github/audit-failure-issue.md` with this exact content:

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
  DO NOT edit the title in this file or in .github/workflows/audit.yml.
  The title is the dedup key for `JasonEtco/create-an-issue@v2` with
  `update_existing: true`. Changing it would open duplicate issues on
  the next failure and orphan the existing one.
-->

The scheduled supply-chain audit ([`.github/workflows/audit.yml`](../../.github/workflows/audit.yml)) failed.

- **Latest failing run:** [#{{ env.RUN_NUMBER }} attempt {{ env.RUN_ATTEMPT }}]({{ env.RUN_URL }})
- **Trigger:** `{{ env.TRIGGER_EVENT }}`

## What to do

1. Open the run log linked above and scroll to the first red step.
2. If `cargo deny check` failed, the output lists the offending advisory and the crate plus version responsible. Bump the crate in `Cargo.toml` or add a documented exception in `deny.toml`.
3. If `uvx pip-audit` failed, the output lists the Python package and advisory. Resolve via `uv add <pkg>@<safe-version>` (never hand-edit `pyproject.toml`).
4. Push a fix branch, land it, and trigger the audit workflow manually via `gh workflow run audit.yml`. If the re-run is green, close this issue.

## History

Comments on this issue are appended by the workflow every time the scheduled run fails. The issue body is overwritten on each run to reflect the latest failing run; earlier failures live in the comment stream below.
```

- [ ] **Step 3: Verify the file exists and parses as YAML front matter**

Run:

```bash
test -f .github/audit-failure-issue.md && echo "exists"
python3 - <<'EOF'
import pathlib
import yaml
text = pathlib.Path(".github/audit-failure-issue.md").read_text()
assert text.startswith("---\n"), "missing opening YAML fence"
end = text.find("\n---\n", 4)
assert end != -1, "missing closing YAML fence"
meta = yaml.safe_load(text[4:end])
assert meta["title"] == "CI: weekly supply-chain audit failing", meta
assert meta["labels"] == ["ci-audit", "bug"], meta
assert meta["assignees"] == ["pgoell"], meta
print("front-matter ok")
EOF
```

Expected output:

```
exists
front-matter ok
```

- [ ] **Step 4: Do NOT commit yet**

Commit 2 ships the template and the workflow change together so there is no intermediate "workflow references missing template" state. Proceed to Task 3.

---

## Task 3: Wire the failure-path steps into audit.yml

**Files:**
- Modify: `.github/workflows/audit.yml` (currently 39 lines).

- [ ] **Step 1: Write the failing "permissions missing" check**

Run:

```bash
python3 - <<'EOF'
import pathlib, yaml
doc = yaml.safe_load(pathlib.Path(".github/workflows/audit.yml").read_text())
assert doc["jobs"]["audit"].get("permissions") is None, "already has job-level perms"
print("no job-level permissions yet (expected red state)")
EOF
```

Expected: `no job-level permissions yet (expected red state)`.

- [ ] **Step 2: Replace the `audit` job body with the new permissions + failure-path steps**

Edit `.github/workflows/audit.yml`. Starting from the existing file:

```yaml
name: Audit

on:
  schedule:
    # Mondays 06:17 UTC. The :17 minute is deliberate — :00 hits
    # GitHub's hourly cron stampede and gets queued.
    - cron: '17 6 * * 1'
  pull_request:
    paths:
      - 'Cargo.lock'
      - 'uv.lock'
      - 'deny.toml'
      - 'pyproject.toml'
      - '**/pyproject.toml'
  push:
    branches: [master]
    paths:
      - 'Cargo.lock'
      - 'uv.lock'
      - 'deny.toml'
  workflow_dispatch:

concurrency:
  group: audit-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  audit:
    name: Supply-chain audit
    runs-on: ubuntu-latest
    # The failure-path steps below open or reuse an issue titled
    # "CI: weekly supply-chain audit failing". That title is the dedup
    # key for `JasonEtco/create-an-issue@v2` with `update_existing: true`.
    # Do not change it in this workflow or in
    # .github/audit-failure-issue.md without a migration plan.
    permissions:
      contents: read
      issues: write
    steps:
      - uses: actions/checkout@v6
      - uses: ./.github/actions/setup-mise
      - name: Run mise audit pipeline
        run: mise run audit

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
          filename: .github/audit-failure-issue.md
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
            --body "Scheduled audit failed again on ${timestamp}. Run: ${RUN_URL}"
```

Notes:
- The `id: tracking-issue` lets the comment step read `steps.tracking-issue.outputs.number` directly, avoiding a separate `gh issue list` search.
- `failure()` without arguments returns true when *any previous* step in the current job has failed — which is exactly the condition we want; a green audit step short-circuits both new steps.
- The final comment step's `if:` adds the `outputs.number != ''` guard so a failed `create-an-issue` call (for example, the action itself erroring) does not cause `gh issue comment` to run against an empty issue number.
- `ubuntu-latest` ships with `gh` pre-installed, so no additional setup step is needed.

- [ ] **Step 3: Run actionlint against the new workflow**

Run:

```bash
mise exec -- actionlint .github/workflows/audit.yml
```

Expected: zero output, exit 0.

If actionlint flags the `env:` keys (`RUN_URL`, etc.), verify the expression syntax is correct; `${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}` must be unquoted on one line.

- [ ] **Step 4: Re-assert the permissions check now passes**

Run:

```bash
python3 - <<'EOF'
import pathlib, yaml
doc = yaml.safe_load(pathlib.Path(".github/workflows/audit.yml").read_text())
perms = doc["jobs"]["audit"]["permissions"]
assert perms == {"contents": "read", "issues": "write"}, perms

steps = doc["jobs"]["audit"]["steps"]
open_step = next(s for s in steps if s.get("id") == "tracking-issue")
assert open_step["uses"].startswith("JasonEtco/create-an-issue@"), open_step
assert "schedule" in open_step["if"], open_step["if"]
assert open_step["with"]["update_existing"] is True, open_step["with"]

# The comment step must key off the tracking-issue output.
comment_step = next(
    s for s in steps
    if "gh issue comment" in (s.get("run") or "")
)
assert "steps.tracking-issue.outputs.number" in comment_step["if"], comment_step["if"]
assert "schedule" in comment_step["if"], comment_step["if"]
print("workflow wiring asserted")
EOF
```

Expected: `workflow wiring asserted`.

- [ ] **Step 5: Run the full lint pipeline**

```bash
mise run lint
```

Expected: green across the board, including the new `check:actions` task.

- [ ] **Step 6: Commit both the template and the workflow change together**

```bash
git add .github/audit-failure-issue.md .github/workflows/audit.yml
git commit -m "$(cat <<'EOF'
ci(audit): open tracking issue when scheduled audit fails

Extends audit.yml with a failure-path step that opens or reuses a
tracking issue via JasonEtco/create-an-issue@v2.9.2 (pinned to
commit SHA 1b14a70e). Gated on github.event_name == 'schedule' so
PR, push, and workflow_dispatch failures remain unaffected.

A follow-up step appends a timestamped comment on each new failure
so the issue collects history even though its body is overwritten
by update_existing: true.

Labels: ci-audit, bug. Assignee: pgoell.
EOF
)"
```

---

## Task 4: Update OPEN_THINGS.md

**Files:**
- Modify: `docs/superpowers/OPEN_THINGS.md`

- [ ] **Step 1: Remove the resolved auto-issue bullet and rewrite the drift-check bullet**

Edit `docs/superpowers/OPEN_THINGS.md`. Under `## CI / repo automation`:

- Delete the entire `- **Auto-issue creation on weekly audit failure.** ...` bullet.
- Rewrite the `- **Drift-check mode for repo:apply-settings.** ...` bullet so it drops the "once the auto-issue-on-audit-failure pipeline exists" clause, since that dependency has shipped. The replacement reads:

```markdown
- **Drift-check mode for `repo:apply-settings`.** The readback-and-diff logic in `scripts/apply-github-settings.sh` is factored into its own block, so exposing a `--check` flag (readback without apply) is a small addition. Wire it into `audit.yml` as a nightly drift-check job once the first real drift incident justifies the noise; the auto-issue-on-failure path (as of PR #audit-issue-on-failure) already takes care of routing failures to a tracking issue.
```

(The issue-number cross-reference can be the actual PR number once `gh pr create` has issued one; update it in step 2 of Task 7 after opening the PR. For this commit, leave the parenthetical as `PR #audit-issue-on-failure` to avoid re-committing later.)

- [ ] **Step 2: Add any new follow-ups surfaced during implementation**

If actionlint revealed pre-existing workflow issues that we deliberately skipped (Task 1 step 5), add each as a bullet under `## CI / repo automation` describing the finding and the reason it was deferred. If no such findings, skip this step.

- [ ] **Step 3: Verify the file is still coherent**

Run:

```bash
grep -n "Auto-issue creation" docs/superpowers/OPEN_THINGS.md
grep -n "Drift-check mode" docs/superpowers/OPEN_THINGS.md
```

Expected: first command prints nothing (no match). Second command prints exactly one line referencing the rewritten bullet.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/OPEN_THINGS.md
git commit -m "docs: mark audit-issue OPEN_THINGS resolved and unblock drift-check"
```

---

## Task 5: Update CONTRIBUTING.md and architecture overview

**Files:**
- Modify: `CONTRIBUTING.md`
- Modify: `docs/architecture/overview.md`

- [ ] **Step 1: Add actionlint mention to CONTRIBUTING.md**

Run:

```bash
grep -n "mise run lint" CONTRIBUTING.md | head
```

If a section lists the linters under `mise run lint`, add `actionlint` to that list. If no such inventory exists, add a short sentence after the existing "lint" prose:

```markdown
`mise run lint` also runs `actionlint` against `.github/workflows/*.yml` so YAML or expression errors in workflows surface locally before CI catches them.
```

- [ ] **Step 2: Add audit-failure-notification line to architecture overview**

Run:

```bash
grep -n "^## " docs/architecture/overview.md | head
```

Locate the section that already describes CI workflows (usually `## CI` or similar). Add a sentence:

```markdown
`.github/workflows/audit.yml` runs a weekly supply-chain audit. When the scheduled run fails, it opens or reuses a tracking issue labelled `ci-audit` via `JasonEtco/create-an-issue@v2`; PR / push / manual dispatches continue to surface failures only in the PR status.
```

If there is no CI section, skip this step and note it in the PR body.

- [ ] **Step 3: Commit**

```bash
git add CONTRIBUTING.md docs/architecture/overview.md 2>/dev/null || true
git commit -m "docs: document audit failure notification and actionlint lint step"
```

If `docs/architecture/overview.md` was not modified, drop it from `git add` and adjust the commit message to `docs: document actionlint lint step`.

---

## Task 6: Local verification dry run

**Files:** none (read-only validation).

- [ ] **Step 1: Run the full local lint + test gate**

```bash
mise run lint
mise run test
```

Expected: both green.

- [ ] **Step 2: Spot-check the workflow diff**

```bash
git log --oneline master..HEAD
git diff master..HEAD -- .github/ mise.toml docs/ CONTRIBUTING.md
```

Expected:
- Four commits on top of `master`: spec, `ci(lint)`, `ci(audit)`, `docs: OPEN_THINGS`, `docs: CONTRIBUTING`.
- Diff touches only `.github/audit-failure-issue.md`, `.github/workflows/audit.yml`, `mise.toml`, `docs/superpowers/OPEN_THINGS.md`, `CONTRIBUTING.md`, and optionally `docs/architecture/overview.md`.

- [ ] **Step 3: Confirm no secrets or tokens leaked**

```bash
git diff master..HEAD | grep -iE 'ghp_|gho_|pat_|secret[_-]?key' | head
```

Expected: empty output.

- [ ] **Step 4: No commit needed**

Task 6 is verification only.

---

## Self-Review (run once, fix inline)

- **Spec coverage:** Task 1 covers the tidy `actionlint` commit; Task 2 + Task 3 together cover the behaviour commit described in the spec; Task 4 handles OPEN_THINGS updates; Task 5 handles CONTRIBUTING + architecture overview. No spec requirement lacks a task.
- **Placeholder scan:** no `TBD`, no "similar to Task N", no "add appropriate error handling". The only conditional step is "fix findings inline" in Task 1 step 5, which has a concrete escape hatch ("peel off into fix(ci): ... commit").
- **Type consistency:** the step `id: tracking-issue` in Task 3 step 2 is referenced consistently as `steps.tracking-issue.outputs.number` in Task 3 step 2 and in the assertion in Task 3 step 4. Env var names (`RUN_URL`, `RUN_NUMBER`, `RUN_ATTEMPT`, `TRIGGER_EVENT`) match between the workflow and the template.
- **Granularity:** every task is single-commit and under ~15 minutes.

Good. Proceed to execution.
