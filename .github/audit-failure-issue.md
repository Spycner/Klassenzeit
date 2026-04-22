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
