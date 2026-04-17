---
description: Run the full brainstorm → spec → plan → implement → PR → green-CI flow autonomously for a topic.
argument-hint: <topic description>
---

# /autopilot — autonomous feature flow

You are executing the Klassenzeit autopilot workflow for: **$ARGUMENTS**

This command runs end-to-end without checking in at every step. The user has opted into autonomous mode: make your own recommendations, don't pause for confirmation on routine choices, only stop if the topic is too large for a single spec (then decompose and ask which sub-topic to tackle first).

## Non-negotiables

- **Never merge the PR.** End on a green CI and ping the user.
- **Never skip hooks** (`--no-verify`, `--no-gpg-sign`, `LEFTHOOK=0`). If a hook fails, investigate and fix the underlying issue.
- **Never add AI attribution** to commits, PRs, or code. No "Generated with", no "Co-Authored-By: Claude".
- **Every commit must be Conventional Commits compliant** (`feat`, `fix`, `docs`, `build`, `ci`, `chore`, `test`, `refactor`, `perf`, `style`, `revert`). `cog` enforces this.
- **No em-dashes / en-dashes** in prose (per user global preference). Rewrite with commas, periods, colons, semicolons, parentheses.

## Steps

### 1. Prepare the workspace

- `git checkout master && git pull origin master` to get latest.
- If the local branch diverges from origin (e.g. after a squash merge), `git reset --hard origin/master` — check with the user first if there are unpushed local commits.
- Create a new branch: `git checkout -b <type>/<short-topic-slug>` (e.g. `feat/frontend-scaffolding`, `fix/cookie-refresh-bug`).

### 2. Brainstorm (self-answered)

Invoke the `superpowers:brainstorming` skill if available, but override its "ask questions one at a time" default: the user wants autonomous flow. Instead:

- Write every question you would have asked the user.
- Answer each yourself with your reasoning (options considered, decision, why).
- Save the Q&A to `/tmp/kz-brainstorm/brainstorm.md`. These become PR comments later.
- If the topic is too big for one spec, stop and surface the decomposition for the user to pick a sub-topic.

### 3. Write the spec

- Use the `superpowers:brainstorming` skill's spec template.
- Path: `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` (today's date, short topic slug).
- Run the spec self-review: placeholders, internal consistency, scope, ambiguity. Fix inline.
- Commit: `docs: add <topic> design spec`.

### 4. Write the implementation plan

- Invoke `superpowers:writing-plans` for structure.
- Path: `docs/superpowers/plans/YYYY-MM-DD-<topic>.md`.
- Use checkbox syntax (`- [ ]`) per task step so progress is trackable.
- Commit: `docs: add <topic> implementation plan`.

### 5. Execute the plan

- Prefer `superpowers:subagent-driven-development` when tasks are independent.
- Serial execution in the main session is fine for tightly-coupled plans.
- Commit in logical chunks with Conventional Commits scopes matching the module (e.g. `feat(frontend): ...`, `build(mise): ...`, `test(scripts): ...`).
- Run `mise run lint` and relevant `mise run test:*` before each commit. The pre-commit hook also enforces lint.
- If you discover repo-level issues that block progress (broken hooks, wrong default-branch assumptions, flaky scripts), fix them in the same branch with their own typed commit (`build`, `ci`, `fix(scripts)`, etc.). Don't paper over with skips.

### 6. Finalize docs

- Update `docs/architecture/overview.md` if subsystems changed.
- Add an ADR at `docs/adr/NNNN-<short-title>.md` for load-bearing decisions (new dep, new subsystem, new toolchain). Index in `docs/adr/README.md`.
- Update `README.md` commands table if new `mise run` tasks landed.
- Invoke `claude-md-management:revise-claude-md` to capture any learnings from this session into `.claude/CLAUDE.md` (project) and `~/.claude/CLAUDE.md` (user) as appropriate.
- Invoke `claude-md-management:claude-md-improver` right after to audit the CLAUDE.md files and tighten anything the first pass left rough.
- Update `docs/superpowers/OPEN_THINGS.md`: remove resolved items; add follow-ups ordered by importance.

### 7. Open the PR

- `mise exec -- git push -u origin <branch>` (use `mise exec --` so the pinned lefthook runs, not whatever's on `PATH`).
- `gh pr create --base master --head <branch> --title "<Conventional-Commits title>" --body "<body>"`.
- PR body structure: `## Summary`, then scope/non-goals, `## Test plan` checklist, and links to spec + plan + ADR if present.
- Post the brainstorm Q&A: one `gh pr comment` per Q&A block from `/tmp/kz-brainstorm/brainstorm.md`. Use a small Python script to split on `## Q` headings and loop `gh pr comment $PR --body "$section"`. Precede with a preamble comment explaining what the thread is.

### 8. CI loop

- Poll `gh pr checks <pr>` with `Monitor` (or `run_in_background` + polling) until every check resolves.
- If a check fails: open the failed job log with `gh run view <run-id> --log-failed | tail -200`, diagnose, commit the fix, push. Repeat until green.
- Common early failures to expect:
  - Generated files missing in CI (route trees, generated types) — build or codegen must run before the check that needs them.
  - Tool-version drift between local and CI — verify the pinned versions in `mise.toml` resolve the same in `jdx/mise-action`.
  - Hook/script false positives on new file types — tighten the script, don't relax the rule.

### 9. DO NOT MERGE

- When all checks are green, **stop**. Report the PR URL to the user.
- Do not run `gh pr merge` unless the user explicitly asks.

### 10. Self-review + improvement pass

After the PR is green, reflect:

- **What decisions got made that weren't captured anywhere?** Re-run `claude-md-management:revise-claude-md` + `claude-md-management:claude-md-improver` for anything that emerged during the CI loop (those passes in step 6 ran before CI taught you anything).
- **What workflow improvements emerged?** Edit this file (`.claude/commands/autopilot.md`) to bake them in. Commit as `docs(autopilot): note <lesson>` in a follow-up PR — do not push to the branch the user is about to merge.
- **What auto-memory is stale?** Update `/home/pascal/.claude/projects/-home-pascal-Code-Klassenzeit/memory/` entries (roadmap status, feedback, references).
- **Were any OPEN_THINGS resolved?** Already handled in step 6; double-check.

Keep self-review short: one sentence per learning, only record non-obvious ones (code-derivable facts don't belong in memory or CLAUDE.md).

## Tone and reporting

- Terse between tool calls. The user sees a diff on the PR; they don't need narration.
- End-of-turn summary: PR URL, one sentence on what changed, next step (usually "review when ready").
- If you hit an unexpected fork in the road that truly needs the user (not a routine choice), stop and ask. But bias strongly toward deciding yourself — that's the point of this command.
