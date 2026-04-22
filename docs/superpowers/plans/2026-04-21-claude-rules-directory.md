# `.claude/rules/` Directory Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganise project memory files so backend rules load when Claude works in `backend/`, cross-workspace `pyproject.toml` rules load via path-scoped `.claude/rules/`, and the root `.claude/CLAUDE.md` holds only truly global instructions. Removes duplication between root and `frontend/CLAUDE.md`.

**Architecture:** Native Claude Code `.claude/rules/*.md` + subdirectory `CLAUDE.md` files. No code changes, no dependencies added. Docs-only reorganisation across six commits. The interim commits double-cover rules (present in both old and new locations) so no rule is ever momentarily missing.

**Tech Stack:** Markdown. Git commits. Lefthook pre-commit + cog commit-msg enforcement (run automatically by `git commit`).

**Spec:** `docs/superpowers/specs/2026-04-21-claude-rules-directory-design.md`

---

## File Structure

**Create:**
- `backend/CLAUDE.md` — backend-specific rules (pytest fixtures, `app.state`, no bare catchalls, no raw SQL).
- `.claude/rules/pyproject.md` — `paths:`-scoped rule for Python dep hygiene across workspace pyproject / uv.lock files.

**Modify:**
- `.claude/CLAUDE.md` — slim by removing backend bullets, removing duplicated frontend bullets, removing the Python-deps paragraph. Add a short paragraph at the top explaining the split.
- `frontend/CLAUDE.md` — append pnpm-dep rule and (if absent) the coverage-ratchet and TanStack Router codegen bullets.
- `.claude/settings.json` — apply the stashed permission add (`Bash(git fetch *)`).
- `docs/superpowers/OPEN_THINGS.md` — note rules-directory adoption if relevant.

**No test files**; this plan ships no code. Verification is content preservation (grep-based spot checks) plus the `claude-md-improver` audit invoked at autopilot step 6.

---

## Task 1: Commit the stashed settings permission add

**Goal:** Land the `git fetch` permission addition as its own commit before any docs work. Keeps it independently revertable.

**Files:**
- Modify: `.claude/settings.json`

- [ ] **Step 1: Restore stash**

```bash
git stash list
```

Expected output includes:

```text
stash@{0}: On refactor/shared-toast-primitive: autopilot: local settings permission add
```

Then:

```bash
git stash pop stash@{0}
```

Expected: `.claude/settings.json` shows the single-line permission addition in `git diff`.

- [ ] **Step 2: Verify diff is exactly what we expect**

```bash
git diff .claude/settings.json
```

Expected output:

```diff
diff --git a/.claude/settings.json b/.claude/settings.json
index d365492..a064b71 100644
--- a/.claude/settings.json
+++ b/.claude/settings.json
@@ -25,7 +25,8 @@
       "Bash(cargo check:*)",
       "Bash(cargo clippy:*)",
       "Bash(mise exec -- pnpm exec tsc --noEmit)",
-      "Bash(mise exec -- pnpm vitest run *)"
+      "Bash(mise exec -- pnpm vitest run *)",
+      "Bash(git fetch *)"
     ]
   }
 }
```

If any other file is modified, reset and investigate before continuing.

- [ ] **Step 3: Commit**

```bash
git add .claude/settings.json
git commit -m "chore(claude): allow git fetch in claude permissions"
```

Expected: lefthook pre-commit runs lint (passes; no code changes), cog commit-msg accepts the conventional prefix, commit lands on branch.

---

## Task 2: Create `backend/CLAUDE.md` with Python coding rules

**Goal:** Move backend-specific bullets out of the root file so they only load when Claude reads files under `backend/`. The root file still has them for now; commit 5 removes the duplicates.

**Files:**
- Create: `backend/CLAUDE.md`

- [ ] **Step 1: Write `backend/CLAUDE.md` with exact content**

```markdown
# Klassenzeit backend: rules

Stack: FastAPI + SQLAlchemy async, Alembic, Pydantic. Served under `klassenzeit_backend`. Rules below are on top of `.claude/CLAUDE.md`, not a replacement.

## Layout (`backend/src/`)

- Routes and route handlers live next to the aggregate they serve.
- Runtime state (engine, session factory, settings, rate limiter) lives on `app.state`, set in `lifespan`. No module-level globals.

## Runtime state

- **`app.state` for FastAPI runtime state.** Engine, session factory, settings, and rate limiter live on `app.state` (set in `lifespan`). Tests set these on `app.state` in the `client` fixture. No module-level globals.

## Error handling

- **No bare catchalls.** No bare `except:` / `except Exception` in Python. Catch the specific error you can handle; let the rest propagate.

## Data access

- **No raw SQL outside the abstraction layer.** All queries go through SQLAlchemy (or whatever repository layer lands later). If raw SQL is unavoidable, it lives inside the data-access module, never in route handlers or business logic.

## Testing

- **Test fixtures, not imports.** `pytest` runs with `--import-mode=importlib`. Shared test helpers must be pytest fixtures (factory pattern) in `conftest.py`, not plain functions imported across test files. Cross-conftest imports break silently.
```

- [ ] **Step 2: Verify file is discoverable by Claude**

```bash
ls backend/CLAUDE.md
wc -l backend/CLAUDE.md
```

Expected: file exists, line count under 30.

- [ ] **Step 3: Grep to confirm each rule is present**

```bash
grep -c "app.state" backend/CLAUDE.md
grep -c "No bare catchalls" backend/CLAUDE.md
grep -c "No raw SQL" backend/CLAUDE.md
grep -c "Test fixtures" backend/CLAUDE.md
```

Expected: each returns at least `1`.

- [ ] **Step 4: Commit**

```bash
git add backend/CLAUDE.md
git commit -m "docs(claude): add backend CLAUDE.md with python rules"
```

---

## Task 3: Add `.claude/rules/pyproject.md` path-scoped rule

**Goal:** Extract the "never hand-edit pyproject dependencies" rule into a glob-scoped rule that loads whenever Claude reads any `pyproject.toml` or `uv.lock` in the workspace.

**Files:**
- Create: `.claude/rules/` (directory)
- Create: `.claude/rules/pyproject.md`

- [ ] **Step 1: Create the rules directory**

```bash
mkdir -p .claude/rules
```

Expected: `.claude/rules/` exists with no contents yet.

- [ ] **Step 2: Write `.claude/rules/pyproject.md` with exact content**

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

- [ ] **Step 3: Verify YAML frontmatter is valid**

```bash
head -5 .claude/rules/pyproject.md
```

Expected:

```text
---
paths:
  - "**/pyproject.toml"
  - "**/uv.lock"
---
```

No trailing whitespace, no blank first line (frontmatter must open on line 1).

- [ ] **Step 4: Grep for key content**

```bash
grep -c "uv add" .claude/rules/pyproject.md
grep -c "Never hand-edit" .claude/rules/pyproject.md
```

Expected: each returns at least `1`.

- [ ] **Step 5: Commit**

```bash
git add .claude/rules/pyproject.md
git commit -m "docs(claude): add pyproject path-scoped rule"
```

Note: lefthook pre-commit runs lint (should pass). If the hook complains about `.claude/rules/` being untracked before this commit, the `mkdir` produced no file alone (empty dirs aren't tracked); this is expected behaviour and not an error.

---

## Task 4: Move pnpm dep rule into `frontend/CLAUDE.md`

**Goal:** Relocate the pnpm-only dependency rule from the root's "Frontend dependencies" section into `frontend/CLAUDE.md`. `frontend/package.json` is the only `package.json` in the repo.

**Files:**
- Modify: `frontend/CLAUDE.md` (append to the "Commands" section)
- Modify: `.claude/CLAUDE.md` (remove the pnpm paragraph from "Frontend dependencies")

- [ ] **Step 1: Read the current `frontend/CLAUDE.md` "Commands" section**

```bash
grep -n "## Commands" frontend/CLAUDE.md
```

Expected: one match near line 16.

- [ ] **Step 2: Append the pnpm rule to `frontend/CLAUDE.md`'s "Commands" section**

Find the existing bullet:

```markdown
- `mise exec -- pnpm -C frontend add <pkg>` / `add -D <pkg>` — add a dep (never hand-edit `package.json`).
```

That bullet already exists in `frontend/CLAUDE.md` at roughly line 26. Compare against the root-file text:

```markdown
Add JS packages via `mise exec -- pnpm -C frontend add <pkg>` (runtime) or `pnpm -C frontend add -D <pkg>` (dev). Don't hand-edit `frontend/package.json` dependency sections; pnpm is the source of truth.
```

The root-file prose says strictly more than the frontend-file bullet (it asserts "pnpm is the source of truth" and spells out the dev suffix). Replace the frontend-file bullet with the fuller root-file phrasing, keeping the bullet format:

```markdown
- **Adding dependencies:** `mise exec -- pnpm -C frontend add <pkg>` (runtime) or `mise exec -- pnpm -C frontend add -D <pkg>` (dev). Don't hand-edit `frontend/package.json` dependency sections; pnpm is the source of truth.
```

Use the Edit tool with unambiguous context so only the one bullet changes.

- [ ] **Step 3: Remove the pnpm paragraph from root**

In `.claude/CLAUDE.md`, find the "Frontend dependencies" section:

```markdown
## Frontend dependencies

Add JS packages via `mise exec -- pnpm -C frontend add <pkg>` (runtime) or `pnpm -C frontend add -D <pkg>` (dev). Don't hand-edit `frontend/package.json` dependency sections; pnpm is the source of truth.

The generated `frontend/src/lib/api-types.ts` and `frontend/src/routeTree.gen.ts` are build output — gitignored, regenerated by `mise run fe:types` and the TanStack Router Vite plugin respectively.
```

Delete the first paragraph (the pnpm one). The generated-files paragraph stays for now; commit 5 removes it when slimming the root. Keep the heading for now.

After edit, the section looks like:

```markdown
## Frontend dependencies

The generated `frontend/src/lib/api-types.ts` and `frontend/src/routeTree.gen.ts` are build output — gitignored, regenerated by `mise run fe:types` and the TanStack Router Vite plugin respectively.
```

- [ ] **Step 4: Verify content**

```bash
grep -c "pnpm is the source of truth" frontend/CLAUDE.md
grep -c "pnpm is the source of truth" .claude/CLAUDE.md
```

Expected: `1` in the frontend file, `0` in the root file.

- [ ] **Step 5: Commit**

```bash
git add frontend/CLAUDE.md .claude/CLAUDE.md
git commit -m "docs(claude): move pnpm dep rule into frontend CLAUDE.md"
```

---

## Task 5: Slim the root `.claude/CLAUDE.md` and top up `frontend/CLAUDE.md`

**Goal:** Remove backend bullets (now in `backend/CLAUDE.md`) and duplicated frontend bullets from the root. Add the explanatory paragraph near the top. Append coverage-ratchet and TanStack Router codegen bullets to `frontend/CLAUDE.md` if not already there.

**Files:**
- Modify: `.claude/CLAUDE.md`
- Modify: `frontend/CLAUDE.md`

- [ ] **Step 1: Check whether coverage-ratchet bullet is in `frontend/CLAUDE.md`**

```bash
grep -n "coverage-baseline-frontend" frontend/CLAUDE.md
grep -n "Frontend coverage ratchet" frontend/CLAUDE.md
```

If neither matches, proceed to Step 2. If one matches, skip Step 2 and go to Step 3.

- [ ] **Step 2: If absent, append coverage-ratchet bullet to `frontend/CLAUDE.md` Testing section**

Find the "## Testing" heading and append to its list of bullets:

```markdown
- **Frontend coverage ratchet.** CI fails if `total.lines.pct` from `vitest --coverage` drops below `.coverage-baseline-frontend` (at repo root) or below the absolute 50% floor. After an intentional drop, run `mise run fe:cov:update-baseline` and commit the new baseline.
```

Place it near the end of the Testing section so existing test bullets retain their order.

- [ ] **Step 3: Check whether TanStack Router codegen bullet is in `frontend/CLAUDE.md`**

```bash
grep -n "routeTree.gen.ts" frontend/CLAUDE.md
grep -n "build before typecheck" frontend/CLAUDE.md
grep -n "tsc --noEmit" frontend/CLAUDE.md
```

Line 14 already mentions `routeTree.gen.ts` as "generated, gitignored, do not edit", but that is not the same as the "build before typecheck" guidance. If "build before typecheck" or the specific TS18048 / noUncheckedIndexedAccess notes are missing, proceed to Step 4.

- [ ] **Step 4: If absent, append TanStack Router codegen and stricter-tsc bullets to `frontend/CLAUDE.md` Commands section**

Append the two bullets to the existing Commands section:

```markdown
- **TanStack Router: build before typecheck.** Adding a new `src/routes/*.tsx` file makes `tsc --noEmit` fail with `"/path" is not assignable to keyof FileRoutesByPath` until the Router Vite plugin regenerates `src/routeTree.gen.ts`. Run `mise exec -- pnpm -C frontend build` (or start `fe:dev`) before typechecking locally. CI already runs `fe:build` before `tsc`.
- **CI `tsc --noEmit` is stricter than `fe:build`.** `mise run fe:build` only runs `vite build`, which skips `noUncheckedIndexedAccess` enforcement; CI's follow-on `tsc --noEmit` catches it (e.g. `initialLessons[0]` → TS18048 "possibly undefined"). Run `cd frontend && mise exec -- pnpm exec tsc --noEmit` locally before pushing when touching array indexing or narrowing.
```

- [ ] **Step 5: Remove duplicated and migrated bullets from `.claude/CLAUDE.md`**

Delete these bullets from the root's "## Coding standards" section. Every bullet listed here is either moved to `backend/CLAUDE.md` (commit 2), moved to `.claude/rules/pyproject.md` (commit 3), or duplicated in `frontend/CLAUDE.md`:

1. `- **Test fixtures, not imports.** ...` (backend bullet, now in `backend/CLAUDE.md`)
2. `- **`app.state` for FastAPI runtime state.** ...` (backend bullet)
3. `- **No bare catchalls.** ...` (backend bullet; the TS / Rust part is already covered in `frontend/CLAUDE.md` "TypeScript" implicitly; leave the TS half out of scope for this pass)
4. `- **No raw SQL outside the abstraction layer.** ...` (backend bullet)
5. `- **No raw input boxes in the frontend.** ...` (dup with frontend Forms)
6. `- **No direct `fetch` in the frontend.** ...` (dup with frontend Server state and routing)
7. `- **No hardcoded user-visible strings in the frontend.** ...` (dup with frontend i18n)
8. `- **Theme tokens only via CSS vars.** ...` (dup with frontend Styling)
9. `- **Frontend coverage ratchet.** ...` (now in frontend/CLAUDE.md after Step 2)
10. `- **TypeScript: `erasableSyntaxOnly` only.** ...` (dup with frontend TypeScript section's reference to the root rule; keep the rule in frontend and delete from root)
11. `- **TanStack Router: build before typecheck.** ...` (now in frontend/CLAUDE.md after Step 4)
12. `- **CI `tsc --noEmit` is stricter than `fe:build`.** ...` (now in frontend/CLAUDE.md after Step 4)
13. `- **Keep Zod schemas flat for RHF forms.** ...` (dup with frontend Forms)
14. `- **Frontend tests must register MSW handlers for every endpoint they hit.** ...` (dup with frontend Testing)

**Keep in root** (genuinely global):

- `- **No dynamic imports.** ...` — applies to Python and TS both.
- `- **Unique function names globally.** ...` — the enforcement script walks both trees.
- `- **Dockerfile build context is the repo root.** ...` — applies to backend and frontend Dockerfiles.
- `- **ADR titles skip the em-dash.** ...` — global docs rule.

- [ ] **Step 6: Remove the "Python dependencies" section from root**

Delete the entire `## Python dependencies` section (two paragraphs). Content is preserved in `.claude/rules/pyproject.md`.

- [ ] **Step 7: Remove the "Frontend dependencies" section from root**

After commit 4 that section already lost its pnpm paragraph, leaving only the generated-files paragraph. Verify `frontend/CLAUDE.md` line 14 already says "`routeTree.gen.ts`, `lib/api-types.ts` — generated; gitignored; do not edit". Then delete the entire `## Frontend dependencies` section including its heading.

- [ ] **Step 8: Add the explanatory paragraph near the top of root**

Immediately after the `# Klassenzeit: Project Instructions` title and above `## Architecture at a glance`, insert:

```markdown
## Where rules live

Project instructions are split across several files so Claude only loads what is relevant to the current working context:

- **This file (`.claude/CLAUDE.md`)** — architecture, workflow, global coding rules, commit-message conventions. Loaded every session.
- **`backend/CLAUDE.md`** — Python / FastAPI / SQLAlchemy / pytest rules. Loaded when Claude reads files under `backend/`.
- **`frontend/CLAUDE.md`** — React / TanStack / shadcn / i18n / Vitest rules. Loaded when Claude reads files under `frontend/`.
- **`.claude/rules/*.md`** — rules scoped by file path rather than directory, via `paths:` frontmatter. Today: `pyproject.md` for workspace-wide Python dependency hygiene.

See [Anthropic's memory docs](https://code.claude.com/docs/en/memory) for the loading model.
```

- [ ] **Step 9: Verify size and content**

```bash
wc -l .claude/CLAUDE.md
grep -c "app.state" .claude/CLAUDE.md
grep -c "raw SQL" .claude/CLAUDE.md
grep -c "pnpm is the source of truth" .claude/CLAUDE.md
grep -c "uv add" .claude/CLAUDE.md
grep -c "Unique function names" .claude/CLAUDE.md
grep -c "Dockerfile build context" .claude/CLAUDE.md
grep -c "ADR titles" .claude/CLAUDE.md
grep -c "Where rules live" .claude/CLAUDE.md
```

Expected:

- `wc -l`: under 80 lines (was 99 before commit 4 started trimming).
- `app.state`: `0`
- `raw SQL`: `0`
- `pnpm is the source of truth`: `0`
- `uv add`: `0`
- `Unique function names`: `1`
- `Dockerfile build context`: `1`
- `ADR titles`: `1`
- `Where rules live`: `1`

If any value is off, fix before committing.

- [ ] **Step 10: Verify each removed rule still exists exactly once somewhere in the repo**

```bash
grep -rn "Test fixtures, not imports" .claude backend frontend
grep -rn "app.state\` for FastAPI" .claude backend frontend
grep -rn "No raw SQL" .claude backend frontend
grep -rn "Never hand-edit" .claude backend frontend docs
grep -rn "pnpm is the source of truth" .claude backend frontend
grep -rn "Frontend coverage ratchet" .claude backend frontend
grep -rn "TanStack Router: build before typecheck" .claude backend frontend
```

Expected: each `grep` returns exactly one file. If any returns zero, a rule was lost; re-add it. If any returns two, a rule is still duplicated; resolve.

- [ ] **Step 11: Commit**

```bash
git add .claude/CLAUDE.md frontend/CLAUDE.md
git commit -m "docs(claude): slim root CLAUDE.md and rehome frontend-specific rules"
```

---

## Task 6: Update `OPEN_THINGS.md` and any stale cross-references

**Goal:** Reflect the new rules layout in repo-level docs that may reference CLAUDE.md organisation. Catch follow-ups surfaced during the rework.

**Files:**
- Modify (maybe): `docs/superpowers/OPEN_THINGS.md`

- [ ] **Step 1: Search `OPEN_THINGS.md` for anything related to CLAUDE.md organisation**

```bash
grep -n "CLAUDE.md" docs/superpowers/OPEN_THINGS.md
grep -n "rules" docs/superpowers/OPEN_THINGS.md
```

If there are open items specifically about "split CLAUDE.md", "too many rules in the root", or "duplicated rules between root and frontend", mark them resolved in Step 2.

- [ ] **Step 2: If any items are resolved, remove them from `OPEN_THINGS.md`**

Use the existing file's structure (preserve section order). If nothing applies, skip this step and Step 3.

- [ ] **Step 3: Add a new entry if follow-ups surfaced**

If during the rework any genuine follow-up was noted (e.g., "solver/ needs its own rules when it grows"), add it to the appropriate section in `OPEN_THINGS.md`, ordered by importance. Keep entries to one sentence each.

Example:

```markdown
- `solver/CLAUDE.md`. Empty today; add when the Rust core grows conventions that aren't already in the root (error handling idioms, fixture patterns, clippy escape-hatch policy).
```

- [ ] **Step 4: Commit if anything changed**

```bash
git diff docs/superpowers/OPEN_THINGS.md
```

If non-empty:

```bash
git add docs/superpowers/OPEN_THINGS.md
git commit -m "docs: note rules directory adoption in OPEN_THINGS"
```

If the diff is empty (no updates needed), skip the commit.

---

## Self-Review (plan-writer pass)

Performed before handing off to the executor.

**1. Spec coverage:**
- Spec section "Stays in `.claude/CLAUDE.md`" → Task 5 Step 5 "Keep in root" enumerates the same bullets. ✓
- Spec section "Moves to `backend/CLAUDE.md`" → Task 2 writes exactly those four rules. ✓
- Spec section "Moves to `.claude/rules/pyproject.md`" → Task 3 writes that file with the expected content. ✓
- Spec section "Moves to `frontend/CLAUDE.md`" (pnpm rule) → Task 4. Handles the root's first paragraph. ✓
- Spec section "Removed from root entirely" → Task 5 Step 5 enumerates each. ✓
- Spec risk "Losing a rule in the move" → Task 5 Step 10 is the grep sweep that catches this. ✓
- Spec implementation-order commits 1–6 → tasks 1–6 produce exactly those commits in that order. ✓
- Spec "stashed settings.json add" → Task 1. ✓

**2. Placeholder scan:** No TBDs, no "add appropriate handling", no "similar to Task N". All content inlined.

**3. Type consistency:** N/A, docs only. File paths checked end-to-end: `.claude/CLAUDE.md`, `backend/CLAUDE.md`, `frontend/CLAUDE.md`, `.claude/rules/pyproject.md`, `docs/superpowers/OPEN_THINGS.md` all written consistently.

**4. Ambiguity check:** Task 5 Steps 1 and 3 use conditional logic ("if absent, proceed to next step; if present, skip"). Expected greps make the decision explicit. Not ambiguous.

**5. Commit message conformance:** Every commit message uses conventional format with lowercase subject. `chore(claude)`, `docs(claude)`, `docs` all match types enforced by `cog`.

**6. Hook expectations:** lefthook pre-commit runs `mise run lint` on every commit. Since no code changes, `ruff`, `ty`, `vulture`, `biome`, `cargo clippy`, `cargo machete`, `cargo fmt`, and `check_unique_fns.py` all pass. `cog verify` checks each message prefix.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-21-claude-rules-directory.md`. The autopilot flow has already declared subagent-driven execution, so the next step is to dispatch each task above to a fresh `general-purpose` subagent sequentially (all tasks edit shared files or depend on earlier state — no parallelism opportunity).
