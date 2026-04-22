---
description: Run the full brainstorm, spec, plan, implement, PR, green-CI flow autonomously for a topic.
argument-hint: <topic description>
---

# /autopilot: autonomous feature flow

You are executing the Klassenzeit autopilot workflow for: **$ARGUMENTS**

This command runs end-to-end without checking in at every step. The user has opted into autonomous mode: make your own recommendations, don't pause for confirmation on routine choices, only stop if the topic is too large for a single spec (then decompose and ask which sub-topic to tackle first).

## Non-negotiables

- **Never merge the PR.** End on a green CI and ping the user.
- **Never skip hooks** (`--no-verify`, `--no-gpg-sign`, `LEFTHOOK=0`). If a hook fails, investigate and fix the underlying issue.
- **Never add AI attribution** to commits, PRs, or code. No "Generated with", no "Co-Authored-By: Claude".
- **Every commit must be Conventional Commits compliant** (`feat`, `fix`, `docs`, `build`, `ci`, `chore`, `test`, `refactor`, `perf`, `style`, `revert`). `cog` enforces this.
- **No em-dashes or en-dashes** in prose (per user global preference). Rewrite with commas, periods, colons, semicolons, parentheses.
- **Never synthesize a skill's output freehand.** If this command names a skill, calling the `Skill` tool (and letting it return) is mandatory before producing that step's artifact. Freehand output that looks like a skill ran is a process violation and the work must be redone after invoking the skill. At the end of each turn, double-check that the skills required by the steps you just executed actually appear in your tool-call history.

## Required skill invocations

Every `/autopilot` run must call the `Skill` tool, not read a skill file, not reimplement, for each entry at the step that names it. Before you push in step 7, stop at the **Skill audit** and verify each row: if any skill is missing from the session's `Skill` tool calls, invoke it now, let it reshape the artifact it governs, and commit the correction before continuing.

| Step | Skill | Purpose |
|---|---|---|
| 0 | `superpowers:using-superpowers` | Establish skill discipline for the session |
| 2 | `superpowers:brainstorming` | Structure the self-answered Q&A and the spec template |
| 4 | `superpowers:writing-plans` | Structure the implementation plan |
| 5 | `superpowers:test-driven-development` | Enforce red-green-refactor per chunk |
| 5 | `superpowers:subagent-driven-development` | Always. Dispatch every plan task to a fresh subagent (sequentially if they share state, in parallel when they don't), so the main session keeps context lean. |
| 6 | `claude-md-management:revise-claude-md` | Capture session learnings into CLAUDE.md files |
| 6 | `claude-md-management:claude-md-improver` | Audit the CLAUDE.md files after revision |
| 10 | `claude-md-management:revise-claude-md` | Capture post-CI learnings that step 6 couldn't see |
| 10 | `claude-md-management:claude-md-improver` | Second audit pass |
| 10 | `less-permission-prompts` | Scan the transcript, tighten `.claude/settings.json` |

If a listed skill is unavailable in the current environment, say so explicitly in the end-of-turn summary and skip only that entry. Never silently drop a row.

## Steps

### 0. Establish skill discipline

**First action:** invoke `superpowers:using-superpowers` via the `Skill` tool. Nothing else in this command happens until the skill has returned.

### 1. Prepare the workspace

- `git checkout master && git pull origin master` to get latest.
- If the local branch diverges from origin (e.g. after a squash merge), `git reset --hard origin/master`. Check with the user first if there are unpushed local commits.
- Create a new branch: `git checkout -b <type>/<short-topic-slug>` (e.g. `feat/frontend-scaffolding`, `fix/cookie-refresh-bug`).

### 2. Brainstorm (sequential, self-answered)

**First action:** invoke `superpowers:brainstorming` via the `Skill` tool. Keep the skill's "one question at a time" rhythm, but self-answer each question instead of waiting for the user: autonomous mode removes the pause, not the sequencing.

Work the Q&A incrementally:

- Start `/tmp/kz-brainstorm/brainstorm.md` with a short preamble (topic, autonomous-mode note) before the first question.
- For each question, in order:
  1. Formulate the question you would have asked the user. Make it multiple-choice when possible, open-ended only when needed.
  2. Answer it yourself: list the options you considered, the decision, and the reasoning (what makes this the right call here, what you'd pick differently in a nearby context).
  3. Append that one Q&A block to `/tmp/kz-brainstorm/brainstorm.md` as `## Q<n>. <question>` with the answer below.
  4. Let the answer shape the next question. Later questions should build on earlier decisions; do not pre-commit to a batch of questions up front.
- Keep going until the open space feels closed: scope, approach, file layout, commit split, risks, success criteria. When you are not uncovering anything new, stop.
- End the file with a short `## Decision` block summarising the shape of the PR you're about to write.
- If the topic is too big for one spec, stop and surface the decomposition for the user to pick a sub-topic.

The sequential rhythm matters: it keeps each answer honest (you do not know the later question until the earlier one is decided) and it produces a readable per-question PR comment thread later.

### 3. Write the spec

- Use the spec template that `superpowers:brainstorming` surfaced in step 2. Do not hand-roll a spec layout from memory.
- Path: `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` (today's date, short topic slug).
- Run the spec self-review: placeholders, internal consistency, scope, ambiguity. Fix inline.
- Commit: `docs: add <topic> design spec`.

### 4. Write the implementation plan

**First action:** invoke `superpowers:writing-plans` via the `Skill` tool.

Then:

- Path: `docs/superpowers/plans/YYYY-MM-DD-<topic>.md`.
- Use checkbox syntax (`- [ ]`) per task step so progress is trackable.
- Commit: `docs: add <topic> implementation plan`.

### 5. Execute the plan

**First actions, in order:** invoke `superpowers:test-driven-development`, then `superpowers:subagent-driven-development`. Both via the `Skill` tool. TDD governs every implementation chunk; subagent-driven-development governs how you run those chunks.

**Subagents are mandatory, not optional.** Every plan task runs in its own fresh `general-purpose` subagent via the `Agent` tool. The user prefers this whether or not tasks are independent: fresh agents save cost (no accumulated file contents in the prompt) and keep the main session's context lean for the later review / PR / docs steps.

How to dispatch:

- **Truly independent tasks (no shared files, no ordering dependency)**: send multiple `Agent` calls in a single message so they run in parallel. Typical cases: four entity-page redesigns that don't edit the same i18n catalog, per-package documentation updates.
- **Tasks that share state (i18n JSON, the same `app.css`, the shared route tree, shared component files)**: dispatch one agent at a time, waiting for each to return before dispatching the next. Still one agent per task; they just queue instead of fan out. Batch edits to the shared file into a single prep task if that removes the sharing.
- **Trivial polish (renaming one symbol, a one-line lint fix, a typo)**: still use a subagent when the work touches files the main session hasn't already loaded. Only skip the agent for edits the main session *just* made and still has in context, where spinning up an agent would be pure overhead.

Each subagent prompt must include: the plan task it owns (paste the checkbox block), which files to touch, the relevant commits that preceded it, and the acceptance criteria (tests to run, lint to pass). The main session reviews the agent's diff and commits; the agent should not commit on its own.

Then:

- Commit in logical chunks with Conventional Commits scopes matching the module (e.g. `feat(frontend): ...`, `build(mise): ...`, `test(scripts): ...`).
- Run `mise run lint` and relevant `mise run test:*` before each commit. The pre-commit hook also enforces lint.
- If you discover repo-level issues that block progress (broken hooks, wrong default-branch assumptions, flaky scripts), fix them in the same branch with their own typed commit (`build`, `ci`, `fix(scripts)`, etc.). Don't paper over with skips.

### 6. Finalize docs

**First actions, in order:** invoke `claude-md-management:revise-claude-md`, then `claude-md-management:claude-md-improver`. Both via the `Skill` tool. The revisions those passes produce are the canonical CLAUDE.md changes for this run; do not hand-edit CLAUDE.md instead of running them.

Then:

- Update `docs/architecture/overview.md` if subsystems changed.
- Add an ADR at `docs/adr/NNNN-<short-title>.md` for load-bearing decisions (new dep, new subsystem, new toolchain). Index in `docs/adr/README.md`.
- Update `README.md` commands table if new `mise run` tasks landed.
- Update `docs/superpowers/OPEN_THINGS.md`: remove resolved items, add follow-ups ordered by importance.

### 7. Skill audit, then open the PR

**Skill audit (blocking).** Before the push, re-read the "Required skill invocations" table above. For each row whose step number is 0 through 6, confirm you actually called the `Skill` tool for that entry this session. Walk the list one by one; do not skim. If any row is missing, invoke it now, let it reshape the artifact it governs, commit the correction, and only then proceed.

Only after the audit passes:

- `mise exec -- git push -u origin <branch>` (use `mise exec --` so the pinned lefthook runs, not whatever's on `PATH`).
- `gh pr create --base master --head <branch> --title "<Conventional-Commits title>" --body "<body>"`.
- PR body structure: `## Summary`, then scope/non-goals, `## Test plan` checklist, and links to spec + plan + ADR if present.
- Post the brainstorm Q&A: one `gh pr comment` per Q&A block from `/tmp/kz-brainstorm/brainstorm.md`. Use a small Python script to split on `## Q` headings and loop `gh pr comment $PR --body "$section"`. Precede with a preamble comment explaining what the thread is.

### 8. CI loop

- Poll `gh pr checks <pr>` with `Monitor` (or `run_in_background` + polling) until every check resolves.
- If a check fails: open the failed job log with `gh run view <run-id> --log-failed | tail -200`, diagnose, commit the fix, push. Repeat until green.
- Common early failures to expect:
  - Generated files missing in CI (route trees, generated types). Build or codegen must run before the check that needs them.
  - Tool-version drift between local and CI. Verify the pinned versions in `mise.toml` resolve the same in `jdx/mise-action`.
  - Hook/script false positives on new file types. Tighten the script, don't relax the rule.

### 9. DO NOT MERGE

- When all checks are green, **stop**. Report the PR URL to the user.
- Do not run `gh pr merge` unless the user explicitly asks.

### 10. Self-review + improvement pass

**First actions, in order:** invoke `claude-md-management:revise-claude-md`, then `claude-md-management:claude-md-improver`, then `less-permission-prompts`. All three via the `Skill` tool. Let each skill do its own work; do not pre-synthesize what they would say.

After that, reflect:

- **What decisions got made that weren't captured anywhere?** The CLAUDE.md skills above are responsible for this; don't duplicate their work freehand.
- **What workflow improvements emerged?** Edit this file (`.claude/commands/autopilot.md`) to bake them in. Commit as `docs(autopilot): note <lesson>` in a follow-up PR; do not push to the branch the user is about to merge.
- **What auto-memory is stale?** Update `/home/pascal/.claude/projects/-home-pascal-Code-Klassenzeit/memory/` entries (roadmap status, feedback, references).
- **Were any OPEN_THINGS resolved?** Already handled in step 6, double-check.

Keep self-review short: one sentence per learning, only record non-obvious ones (code-derivable facts don't belong in memory or CLAUDE.md).

## Tone and reporting

- Terse between tool calls. The user sees a diff on the PR; they don't need narration.
- End-of-turn summary: PR URL, one sentence on what changed, next step (usually "review when ready"). Also list any required skill that was unavailable and therefore skipped.
- If you hit an unexpected fork in the road that truly needs the user (not a routine choice), stop and ask. But bias strongly toward deciding yourself, that is the point of this command.
