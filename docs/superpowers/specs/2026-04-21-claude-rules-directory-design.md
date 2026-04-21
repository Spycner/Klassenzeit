# `.claude/rules/` directory rework

**Date:** 2026-04-21
**Status:** Design approved, plan pending.

## Problem

The repo's Claude Code memory setup has drifted into duplication and miss-scoping since the frontend and backend rules started diverging.

Current state (verified 2026-04-21):

- `.claude/CLAUDE.md` (99 lines). Loaded on every session by Claude Code. Contains a grab-bag: architecture overview (global), workflow conventions (global), a Python-deps rule (backend only), a pnpm rule (frontend only), and a "Coding standards" section with 20 bullets, roughly 7 backend, 10 frontend, and 3 cross-cutting.
- `frontend/CLAUDE.md` (105 lines). Loaded lazily when Claude reads files under `frontend/`. Well organised as a per-topic do-not-do list (hooks, forms, i18n, a11y, testing, etc.).
- No `backend/CLAUDE.md`. Backend rules live in the root file.
- No `.claude/rules/` directory.

Two concrete problems follow from that shape:

1. **Duplication between root and `frontend/`.** The root "Coding standards" bullets "No raw input boxes", "No direct `fetch`", "No hardcoded user-visible strings", "Theme tokens only via CSS vars", "Frontend coverage ratchet", "TypeScript `erasableSyntaxOnly` only", "TanStack Router build before typecheck", "CI `tsc --noEmit` stricter", "Keep Zod schemas flat", and "Frontend tests must register MSW handlers" all restate rules already in `frontend/CLAUDE.md` in its own words. Two copies drift when one is edited.
2. **Miss-scoped backend rules.** Backend-only bullets ("Test fixtures, not imports", "`app.state` for FastAPI runtime state", "No bare catchalls", "No raw SQL outside the abstraction layer") load into every session, including ones that only touch `frontend/` or `solver/`. Pure noise.
3. **Orphaned `pyproject.toml` rule.** "Never hand-edit `[project.dependencies]`, always use `uv add`" applies to any `pyproject.toml` in the workspace (root workspace config and `backend/pyproject.toml`). A subdir `backend/CLAUDE.md` would miss the root file. A glob-scoped rule covers both.

Anthropic's official Claude Code memory docs at `https://code.claude.com/docs/en/memory` document the `.claude/rules/` directory as the supported way to scope rules by path. Rules without a `paths:` frontmatter field load at session start with the same priority as `.claude/CLAUDE.md`. Rules with `paths:` load only when Claude reads files matching the glob patterns. The mechanism is native, not borrowed from Cursor, and not a third-party pattern.

## Goal

Restructure the project memory setup so that:

- Every session loads only the truly cross-cutting rules at startup (architecture, workflow, tooling commands, commit messages, and a few globally applicable coding rules).
- Backend-only rules load when Claude is working in `backend/`.
- Frontend-only rules load when Claude is working in `frontend/` (already the case, stays that way).
- Cross-workspace rules like "never hand-edit pyproject dependencies" load whenever Claude touches the matching file type, regardless of directory.

The net goal: remove duplication, reduce noise, and get a single source of truth per rule.

## Non-goals

- **Splitting `frontend/CLAUDE.md` into topic files.** At 105 lines it fits the docs' 200-line guideline and loads lazily already. Fragmenting it into `.claude/rules/frontend-hooks.md`, `frontend-forms.md`, etc. is premature for a project of this size and reduces human discoverability.
- **Creating `~/.claude/rules/` user-level rules.** That is a per-machine personal setup and does not belong in this repo.
- **Introducing an ADR.** Config reorganisation within a well-documented Claude Code feature; no subsystem change, no new dependency, no cross-team impact.
- **Slicing `.claude/rules/` into many files.** Two concerns exist today (backend Python rules, cross-workspace pyproject rule). We add one rule file, not ten.
- **Revisiting `autopilot.md` or the skills catalogue.** Those reference specific skills by name and are orthogonal to where rules live.

## Design

### Target file layout

```text
.claude/
├── CLAUDE.md              # Slimmed: architecture + workflow + global bullets
├── commands/
│   └── autopilot.md       # Unchanged
├── rules/
│   └── pyproject.md       # paths: ["**/pyproject.toml", "**/uv.lock"]
├── settings.json
└── settings.local.json
backend/
└── CLAUDE.md              # New: Python coding rules
frontend/
└── CLAUDE.md              # Unchanged structure; one pnpm rule added
```

### What moves where

**Stays in `.claude/CLAUDE.md`:**

- Architecture at a glance (9 lines, unchanged)
- Development Workflow section (skills discipline, TDD, PR gate, OPEN_THINGS.md, `/autopilot` reference)
- Work selection: quality first, tidy first (10 lines, unchanged)
- Tooling: commands table, Rust toolchain, lefthook, cog (15 lines, unchanged)
- Global coding rules that apply across Python and TS:
  - Unique function names globally (`scripts/check_unique_fns.py` walks both TS and Python)
  - No dynamic imports (applies to both)
  - Dockerfile build context is the repo root (applies to both `backend/Dockerfile` and `frontend/Dockerfile`)
  - ADR titles skip the em-dash (global docs rule)
- Commit messages section (unchanged)
- A new short paragraph at the top explaining the split: "Backend-specific rules live in `backend/CLAUDE.md`; frontend-specific rules live in `frontend/CLAUDE.md`; `.claude/rules/*.md` holds rules scoped to file patterns rather than directories."

**Moves to `backend/CLAUDE.md` (new file):**

- Test fixtures, not imports (pytest `--import-mode=importlib`, fixtures in `conftest.py`)
- `app.state` for FastAPI runtime state
- No bare catchalls (Python framing: no bare `except:`, no `except Exception` that swallows)
- No raw SQL outside the abstraction layer

The new file mirrors `frontend/CLAUDE.md`'s shape: an opening line that states "Rules below are on top of `.claude/CLAUDE.md`, not a replacement", then sections.

**Moves to `.claude/rules/pyproject.md` (new file):**

```markdown
---
paths:
  - "**/pyproject.toml"
  - "**/uv.lock"
---

# Python dependency hygiene

Add Python packages **only** via `uv add <pkg>` (runtime) or `uv add --dev <pkg>` (dev). Never hand-edit `[project.dependencies]` or `[dependency-groups]` in any `pyproject.toml`; `uv` is the single source of truth for dependency state, and hand edits desync `uv.lock`. For backend-specific deps, use `uv add --package klassenzeit-backend <pkg>`. Root-level `uv add --dev` for shared dev tools.

Hand-writing *non-dependency* sections is fine and expected: `[tool.uv.workspace]`, `[tool.uv.sources]`, `[build-system]`, `[project]` metadata, `[tool.maturin]`, `[tool.ruff]`, `[tool.pytest.ini_options]`, etc. Those are configuration, not dependencies.
```

The `paths:` glob covers:

- `/pyproject.toml` (workspace root)
- `/backend/pyproject.toml`
- `/solver/solver-py/pyproject.toml` (if ever added)
- `/uv.lock` (single root lockfile in this workspace)

No subdirectory CLAUDE.md could cover the root `pyproject.toml`; this is exactly the case the `.claude/rules/` feature exists to handle.

**Moves to `frontend/CLAUDE.md`:**

- The pnpm-only rule ("Add JS packages via `mise exec -- pnpm -C frontend add <pkg>`..."). Currently the first paragraph in the root's "Frontend dependencies" section. `frontend/package.json` is the only `package.json` in the repo, so the subdir file is the right home. Appended to the existing "Commands" section under the existing pnpm-add bullet.

The second paragraph in the root's "Frontend dependencies" section (the note that `api-types.ts` and `routeTree.gen.ts` are generated and gitignored) is already covered by `frontend/CLAUDE.md` line 14 ("`routeTree.gen.ts`, `lib/api-types.ts` — generated; gitignored; do not edit"). It is a pure duplicate and is deleted outright, not moved.

**Removed from `.claude/CLAUDE.md` entirely (duplication with `frontend/CLAUDE.md`):**

- No raw input boxes (duplicated by frontend's "Forms" section and the shadcn-primitive rule)
- No direct `fetch` (duplicated by frontend's "Server state and routing")
- No hardcoded user-visible strings (duplicated by frontend's "i18n")
- Theme tokens only via CSS vars (duplicated by frontend's "Styling")
- Frontend coverage ratchet (frontend-only; moves to `frontend/CLAUDE.md` if not already there, otherwise stays in root as a global CI rule, see decision below)
- TypeScript `erasableSyntaxOnly` (frontend's "TypeScript" already covers it, root just reiterates)
- TanStack Router build before typecheck (duplicated implicitly; move to `frontend/CLAUDE.md` under Commands if not there)
- CI `tsc --noEmit` stricter (ditto)
- Keep Zod schemas flat for RHF forms (duplicated by frontend's "Forms")
- Frontend tests must register MSW handlers (duplicated by frontend's "Testing")

**Decision on coverage ratchet and CI `tsc` bullets:** both are "you ran into this when working in frontend" facts. They belong in `frontend/CLAUDE.md` if they are not already there. The spec-writing phase adds them explicitly during the plan execution; the existing `frontend/CLAUDE.md` has an "Accessibility" and "Testing" section but does not currently call out the coverage ratchet or the TanStack Router codegen gotcha. Those two are worth keeping and will be appended to `frontend/CLAUDE.md` under existing sections (Testing for coverage ratchet, Commands for the codegen gotcha) during implementation.

### Exact content transforms

For transparency, the implementation plan will do textual moves, not rewrites:

1. Copy the Python-dep paragraph out of root into `.claude/rules/pyproject.md` with frontmatter prepended. Content is unchanged.
2. Copy each backend bullet out of root into `backend/CLAUDE.md` under appropriate headings. Content is unchanged; only the containing file and section heading change.
3. Remove the duplicated frontend bullets from root. If a bullet contains non-duplicate detail, move that detail into `frontend/CLAUDE.md` first, then remove.
4. Move the pnpm-install bullet into `frontend/CLAUDE.md`. Content unchanged.

### Load-order considerations

Per the Claude Code docs:

- `.claude/CLAUDE.md` loads at session start.
- `.claude/rules/*.md` without `paths:` frontmatter load at session start with the same priority as `.claude/CLAUDE.md`.
- `.claude/rules/*.md` with `paths:` load when Claude reads matching files.
- `backend/CLAUDE.md` loads when Claude reads files under `backend/`.
- `frontend/CLAUDE.md` loads when Claude reads files under `frontend/`.

After the rework:

- Every session: root CLAUDE.md (slim) plus any unconditional rules in `.claude/rules/` (none planned).
- Session that touches a `pyproject.toml` or `uv.lock`: above plus `.claude/rules/pyproject.md`.
- Session that touches `backend/*`: above plus `backend/CLAUDE.md`.
- Session that touches `frontend/*`: above plus `frontend/CLAUDE.md`.

Nothing in the rework relies on load ordering between files (no rule overrides another). The slim root plus per-scope rules is strictly additive.

### Stashed settings.json permission add

The branch also un-stashes and commits the existing local `.claude/settings.json` permission add (`"Bash(git fetch *)"`). Separate `chore` commit so it is easy to revert independently of the docs rework.

## Validation

Three checks:

1. **Lint and test suites pass.** `mise run lint` plus `mise run test` on the branch. This is a docs-only change, so any failure is unrelated.
2. **Claude Code loads the expected files.** Manually run `/memory` in a fresh session inside the repo after merge to confirm: the slim root, the right subdir file for the directory you are in, and any path-scoped rules for the file type open.
3. **`claude-md-management:claude-md-improver` audit.** Required by the autopilot flow anyway; it evaluates all CLAUDE.md files against the templates and catches regressions like "this file is now incoherent" or "contradictions between files".

Check 2 is qualitative and belongs in the PR body as a reviewer note, not a CI check. Check 3 runs automatically in the plan.

## Risks

- **Losing a rule in the move.** Mitigated by doing textual moves (cut and paste, not rewrite). Any bullet that disappears without a destination is a regression. The `claude-md-improver` audit catches overlooked moves.
- **`paths:` glob syntax subtly different from ripgrep / git glob.** The docs confirm brace expansion works and the examples match shell-style globbing. `**/pyproject.toml` is standard and broadly supported. If the pattern ever misbehaves, the `InstructionsLoaded` hook mentioned in the docs can be used to debug which files loaded when.
- **`frontend/CLAUDE.md` gains a couple of appended rules.** The coverage-ratchet and `tsc --noEmit` bullets move into it. The file ticks slightly over 110 lines, still well under the 200-line guideline.
- **Duplication creeps back in.** A future contributor might re-add a frontend rule to root "for visibility". Mitigated by the explanatory paragraph at the top of the slimmed root file.
- **PR touches many files for docs-only content.** Reviewers may worry about churn. Mitigated by the commit split: each file moves in its own small commit (see Implementation order below).

## Implementation order

Six commits on the branch, in order:

1. `chore(claude): allow git fetch in claude permissions`. Un-stash and commit the existing `.claude/settings.json` permission add. Isolated so this change is revertable.
2. `docs(claude): add backend CLAUDE.md with python rules`. Create `backend/CLAUDE.md` with the four backend bullets (test fixtures, `app.state`, no bare catchalls, no raw SQL). Root CLAUDE.md is not yet trimmed; bullets temporarily exist in both places so no rule is momentarily missing.
3. `docs(claude): add pyproject path-scoped rule`. Create `.claude/rules/pyproject.md`. Root CLAUDE.md still has the Python deps bullet; same "two copies briefly" approach as commit 2.
4. `docs(claude): move pnpm dep rule into frontend CLAUDE.md`. Add the pnpm-only rule to `frontend/CLAUDE.md` under its "Commands" section. Remove the pnpm paragraph from the root's "Frontend dependencies" section. The generated-files paragraph in that same section is already duplicated in `frontend/CLAUDE.md` and is deleted in commit 5, not here.
5. `docs(claude): slim root CLAUDE.md`. Remove the four backend bullets now living in `backend/CLAUDE.md`. Remove the Python deps bullet now in `.claude/rules/pyproject.md`. Remove the duplicated frontend bullets listed under "Removed from `.claude/CLAUDE.md` entirely" in the Design section above. Remove the residual generated-files paragraph from the now-empty "Frontend dependencies" section, then delete the empty heading. Append an explanatory paragraph near the top describing the new layout. In the same commit, append the coverage-ratchet bullet and the TanStack Router codegen bullet to `frontend/CLAUDE.md` (Testing and Commands sections respectively) if those bullets are not already there.
6. `docs: note rules directory adoption and update OPEN_THINGS`. Update `docs/superpowers/OPEN_THINGS.md` if any existing item references CLAUDE.md organisation. Update `README.md` only if it currently documents the rule layout (likely not).

The interim double-coverage in commits 2 to 4 is intentional; each commit leaves the repo in a state where every rule is still discoverable from at least one file. Commit 5 is the only step that removes content.

## Ripple effect on coverage ratchet

None. No code changes.

## Follow-ups (not this PR)

- If `solver/solver-core/` or `solver/solver-py/` ever grow their own conventions, add `solver/CLAUDE.md`. Not needed today.
- If a `tests/` directory acquires conventions that span both backend and frontend (e.g. a shared Playwright setup), consider a `.claude/rules/tests.md` with `paths: ["**/tests/**"]`. Tracked implicitly under OPEN_THINGS once the E2E coverage item matures.
- Revisit when `frontend/CLAUDE.md` exceeds 150 lines or drifts into topic-mixing. At that point splitting into `.claude/rules/frontend-*.md` becomes worthwhile.
- If a shared set of rules emerges across multiple repos, the docs' symlink-based sharing pattern (`ln -s ~/shared-claude-rules .claude/rules/shared`) is available. Out of scope today.
