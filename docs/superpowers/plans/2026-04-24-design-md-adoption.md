# DESIGN.md Adoption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land `frontend/DESIGN.md` as the canonical agent-facing description of the PK visual identity, plus the `@google/design.md` lint CLI wired into `mise run lint`, with zero runtime CSS change.

**Architecture:** A single docs-and-tooling PR. Commit 1 adds the document, ADR, CLAUDE.md reference, and OPEN_THINGS update; commit 2 adds the pnpm devDep and the `lint:design` mise task. Each commit is self-green: the file lands before anything tries to lint it.

**Tech Stack:** `@google/design.md` v0.1.1 (Apache-2.0 Node CLI, pinned via pnpm) running on Node already managed by mise. Spec version: `alpha`. No backend or runtime-CSS touches.

**Dispatch pattern:** Tasks 1-4 touch disjoint files (`frontend/DESIGN.md`, new `docs/adr/0012-...`, `frontend/CLAUDE.md`, `docs/superpowers/OPEN_THINGS.md`) and can run in parallel as four subagents. Commit 1 is the main-session checkpoint that aggregates them. Task 5 touches `frontend/package.json` + `mise.toml` as one tightly-coupled subagent. Commit 2 closes the PR.

**Reference hex values (sRGB approximations of `frontend/src/styles/app.css` OKLCH tokens, computed via coloraide clip gamut mapping):**

| Semantic role | CSS variable | Light hex | Dark hex |
|---|---|---|---|
| primary | `--primary` | `#608c5e` | `#8fb38d` |
| secondary | `--secondary` | `#7ba8bc` | `#99bfc9` |
| tertiary (= destructive) | `--destructive` | `#d66c5d` | `#9c4e43` |
| neutral (= background) | `--background` | `#fffcf5` | `#1c1b19` |
| surface (= card) | `--card` | `#f9f4ec` | `#262422` |
| on-surface (= foreground) | `--foreground` | `#3a342f` | `#f2ebe1` |
| muted | `--muted` | `#f1e9db` | `#33302c` |
| on-muted (= muted-foreground) | `--muted-foreground` | `#7c7267` | `#a69d91` |
| border | `--border` | `#e8dfd1` | `#3d3934` |
| accent | `--accent` | `#f5d1b0` | `#4d463d` |

DESIGN.md YAML ships light values only. Dark values are listed here for reference and documented prose-only in the file.

---

### Task 1: Write `frontend/DESIGN.md`

**Owner:** subagent (parallel with Tasks 2, 3, 4).

**Files:**
- Create: `frontend/DESIGN.md`

Source of truth for token names and values is the hex table above and `frontend/src/styles/app.css` OKLCH tokens. Prose should reference the 2026-04-19 spec for the naming rationale without duplicating it.

- [ ] **Step 1: Create the file with YAML frontmatter and markdown body**

```markdown
---
version: alpha
name: Klassenzeit PK
description: >
  Warm, editorial, slightly analog school-schedule UI. Moss-green primary,
  limestone neutral, broadsheet typography. Runtime source of truth is
  frontend/src/styles/app.css; hex values below are sRGB approximations of
  the authoritative oklch() tokens.
colors:
  primary: "#608c5e"
  secondary: "#7ba8bc"
  tertiary: "#d66c5d"
  neutral: "#fffcf5"
  surface: "#f9f4ec"
  on-surface: "#3a342f"
  muted: "#f1e9db"
  on-muted: "#7c7267"
  border: "#e8dfd1"
  accent: "#f5d1b0"
  error: "{colors.tertiary}"
typography:
  headline-lg:
    fontFamily: Quicksand
    fontSize: 2.25rem
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Quicksand
    fontSize: 1.5rem
    fontWeight: 600
    lineHeight: 1.2
  body-lg:
    fontFamily: Lora
    fontSize: 1.125rem
    fontWeight: 400
    lineHeight: 1.55
  body-md:
    fontFamily: Quicksand
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: Quicksand
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.5
  label-md:
    fontFamily: Quicksand
    fontSize: 0.875rem
    fontWeight: 500
    lineHeight: 1.3
  label-mono:
    fontFamily: Fira Code
    fontSize: 0.75rem
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: 0.02em
rounded:
  sm: 12px
  md: 14px
  lg: 16px
  xl: 20px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  "2xl": 48px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: 12px
    typography: "{typography.label-md}"
  button-primary-hover:
    backgroundColor: "#547a52"
    textColor: "#ffffff"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: 12px
  button-ghost:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.md}"
    padding: 12px
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    padding: 24px
  input:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.md}"
    padding: 10px
---

# Klassenzeit PK DESIGN.md

<prose body: Overview, Colors, Typography, Layout, Elevation & Depth, Shapes,
Components, Do's and Don'ts — as outlined in the spec.>
```

The subagent must produce a concrete, polished prose body, not a placeholder. Use the outline in `docs/superpowers/specs/2026-04-24-design-md-adoption-design.md` section "Markdown body". Keep each prose section to 2-5 short paragraphs; do not duplicate the 2026-04-19 spec in prose.

Prose must cover, in this section order:

1. `## Overview` — brand personality (warm, editorial, slightly analog), target audience (teachers), when to lean literary vs. technical.
2. `## Colors` — per-role description, with both DESIGN.md name and the shadcn CSS variable it maps to. Explicit line: *"Runtime source of truth is `frontend/src/styles/app.css`; hex here is an sRGB approximation of OKLCH."* Dark-mode reference: *"Dark mode swaps every palette to a deep-ink scheme authored directly in `app.css`; DESIGN.md captures light only because the current schema has no dark-mode hook."*
3. `## Typography` — Quicksand is the warm-sans body, Lora is the literary long-form option, Fira Code carries data, Special Elite appears in dark-mode mono only. Explain which role uses which family.
4. `## Layout` — 8px scale, card-grouping, 1200px max-width desktop, fluid mobile.
5. `## Elevation & Depth` — warm-subtle light shadows, pure-black dramatic dark shadows. Four levels (`xs`, `sm`, `md`, `lg`).
6. `## Shapes` — `--radius: 1rem` base; `sm/md/lg/xl` derived. Soft but deliberate.
7. `## Components` — one paragraph per component in YAML, explaining intent and when variants are used.
8. `## Do's and Don'ts` — minimum five items. Include: single primary CTA per screen; don't introduce new palette colors without updating this file *and* `app.css`; dark mode is authored in CSS only; maintain WCAG AA where possible (light primary/secondary are known debt; track in OPEN_THINGS.md); never use `!important` or inline hex in components.

- [ ] **Step 2: Sanity-check lint pass on the written file**

Run from repo root:

```bash
( cd /tmp && npx --yes @google/design.md@0.1.1 lint \
  "$OLDPWD/frontend/DESIGN.md" )
```

Expected JSON output: `"errors": 0`; warnings may include `contrast-ratio` on `button-primary` (3.88:1) and `button-secondary` (2.57:1), `orphaned-tokens` on `accent` / `muted` if not referenced by a component, and an `info` token-summary line.

If any `"severity": "error"` appears, the subagent must revise the file until errors go to 0 without tripping a new category of warning.

- [ ] **Step 3: Report back to main session**

Report the final lint summary (errors/warnings/info counts) and the list of warning paths. Do not commit; the main session aggregates the commit-1 set.

---

### Task 2: Add ADR 0012

**Owner:** subagent (parallel with Tasks 1, 3, 4).

**Files:**
- Create: `docs/adr/0012-design-md-canonical-artifact.md`
- Modify: `docs/adr/README.md` (append one index row)

- [ ] **Step 1: Copy the ADR template and fill it in**

Read `docs/adr/template.md` first. Do not reference the template after writing; produce a concrete 150-400 word ADR. Title uses a colon per `.claude/CLAUDE.md` rule (no em-dash):

```
# 0012: DESIGN.md as canonical design artifact
```

Required sections (from template): Status (`Accepted`), Context, Decision, Consequences.

- **Context** must name the problem: the PK design is spread across `app.css` (319 OKLCH lines) and the 2026-04-19 spec narrative; agents that write UI need a single short canonical doc. DESIGN.md fits as that middle layer.
- **Decision** must state: adopt DESIGN.md at level 2 (file + CI lint, no codegen, no sync-check); file at `frontend/DESIGN.md`; `@google/design.md` pinned as a frontend devDep; invocation wired into `mise run lint`. Explicit non-goals: no dark-mode YAML, no Tailwind / DTCG export, no generator.
- **Consequences** must cover: agents get a one-file load; warnings surface WCAG-AA debt for `button-primary`/`button-secondary` (tracked in OPEN_THINGS); upstream alpha-status schema pivot is a known risk (mitigated by pinning); duplication of token values between `app.css` and DESIGN.md hex is accepted with CSS as source of truth.

- [ ] **Step 2: Append the index row to `docs/adr/README.md`**

Edit `docs/adr/README.md`. The final table row today is `| 0010 | ... |` but `0011-subject-color-and-simplified-suitability.md` exists on disk. First verify whether the index already lists 0011; if it does not, append both (0011 and 0012) rows to the index in order. If 0011 is already there, append only 0012.

New row for 0012 (append after the last entry):

```markdown
| 0012 | [DESIGN.md as canonical design artifact](0012-design-md-canonical-artifact.md) | Accepted |
```

- [ ] **Step 3: Report back**

Report: ADR word count, whether the 0011 index row was missing (flag as a drive-by fix), and the final ADR path.

---

### Task 3: Link `DESIGN.md` from `frontend/CLAUDE.md`

**Owner:** subagent (parallel with Tasks 1, 2, 4).

**Files:**
- Modify: `frontend/CLAUDE.md` (one new line-item under an existing "Styling" section)

- [ ] **Step 1: Add the agent-facing pointer under "Styling"**

Read `frontend/CLAUDE.md`. Find the `## Styling` section. Append (as a new bullet, matching the existing bullet style):

```markdown
- **Canonical design tokens live in `frontend/DESIGN.md`.** Load that file (YAML frontmatter + prose) when you need the PK palette, typography, or component recipes. Runtime source of truth is `frontend/src/styles/app.css` (OKLCH, dark mode). When you change a semantic token (primary/secondary/tertiary/neutral/accent/destructive, a typography level, a radius, or a documented component role) in `app.css`, update `frontend/DESIGN.md` in the same commit. Implementation-detail tokens (chart-N, sidebar-*) are CSS-only and do not need to be mirrored.
```

- [ ] **Step 2: Report back**

Report: the exact line number where the bullet was inserted, and confirmation that no other section changed.

---

### Task 4: Remove the Design section from `OPEN_THINGS.md` and add the contrast follow-up

**Owner:** subagent (parallel with Tasks 1, 2, 3).

**Files:**
- Modify: `docs/superpowers/OPEN_THINGS.md`

- [ ] **Step 1: Remove the Design section**

Delete the three lines:

```markdown
### Design

https://github.com/google-labs-code/design.md evaluate and implement if found good.
```

These live at the very bottom of the file. Do not remove the preceding `### User Tooling` section or anything above.

- [ ] **Step 2: Add a contrast-ratio follow-up under "Product capabilities"**

Find the `### Product capabilities` section in `## Backlog`. Append this bullet at the end of that section (after the last existing bullet, before the `### Solver algorithm` heading):

```markdown
- **WCAG AA contrast for light-mode primary/secondary buttons.** `@google/design.md lint frontend/DESIGN.md` surfaces `contrast-ratio` warnings on `button-primary` (`#608c5e` on `#ffffff` = 3.88:1, below 4.5:1 AA) and `button-secondary` (`#7ba8bc` on `#ffffff` = 2.57:1). Large-text AA (3:1) passes for primary, fails for secondary. Fix options: darken the moss/blue primaries, switch to a dark textColor on those buttons, or restrict them to large-text usage. Decide when light-mode accessibility audit is on the roadmap; until then the warnings stay visible in every `mise run lint` run. Surfaced during DESIGN.md adoption.
```

- [ ] **Step 3: Report back**

Report the byte-delta (lines removed / added) and whether any other OPEN_THINGS section was touched (should be none).

---

### Checkpoint: Commit 1

**Owner:** main session (after Tasks 1-4 return).

- [ ] **Step 1: Review each subagent's diff**

Run `git status` and `git diff` to confirm only the expected files changed. No edits to `frontend/src/`, `backend/`, `solver/`, `mise.toml`, or `frontend/package.json` at this point.

- [ ] **Step 2: Stage commit 1**

```bash
git add \
  frontend/DESIGN.md \
  docs/adr/0012-design-md-canonical-artifact.md \
  docs/adr/README.md \
  frontend/CLAUDE.md \
  docs/superpowers/OPEN_THINGS.md
```

- [ ] **Step 3: Run the existing lint once to prove commit 1 is self-green**

```bash
mise run lint
```

Expected: exit 0. `fe:lint` (biome) runs over `frontend/` and does not care about `DESIGN.md`. No new linter is wired yet.

- [ ] **Step 4: Commit with the planned message**

```bash
git commit -m "docs(design): add frontend/DESIGN.md capturing PK visual identity"
```

The lefthook pre-commit will re-run `mise run lint`. Expected: passes. `cog verify` accepts `docs(design)`.

---

### Task 5: Wire `@google/design.md` + `lint:design` mise task

**Owner:** subagent (after commit 1 is in place).

**Files:**
- Modify: `frontend/package.json` + `frontend/pnpm-lock.yaml` (via pnpm)
- Modify: `mise.toml` (new task + depends entry)

- [ ] **Step 1: Add the pnpm devDependency**

Run from repo root:

```bash
mise exec -- pnpm -C frontend add -D @google/design.md@0.1.1
```

Version pinned to `0.1.1` per the npm registry snapshot at time of writing; subagent should verify the exact latest version on npm at run time and pin to that. If a newer patch has shipped, use the newer version and note it in the report.

Expected effect: `"@google/design.md": "^0.1.1"` (or current) appears under `devDependencies` in `frontend/package.json`; `frontend/pnpm-lock.yaml` updates.

- [ ] **Step 2: Add `[tasks."lint:design"]` to `mise.toml`**

Read `mise.toml` to see the existing task conventions (examples: `[tasks."lint:rust"]`, `[tasks."lint:py"]`, `[tasks."fe:lint"]`). Match that style. Insert the new task after `[tasks."lint:py"]` and before the long comment block that starts `# (`install`, `lint`, `test`, `fmt`)`:

```toml
[tasks."lint:design"]
description = "Lint frontend/DESIGN.md against the @google/design.md format"
run = "if [ -f frontend/node_modules/@google/design.md/package.json ]; then pnpm -C frontend exec design.md lint DESIGN.md; else echo 'frontend deps not installed, skipping'; fi"
```

Rationale: the `if [ -f ... ]` guard matches the existing `fe:lint` pattern for fresh-clone friendliness.

- [ ] **Step 3: Append `lint:design` to `[tasks.lint].depends`**

Current line in `mise.toml`:

```toml
[tasks.lint]
description = "Run all linters"
depends = ["lint:rust", "lint:py", "fe:lint", "check:commit-types", "check:actions"]
```

Change to:

```toml
[tasks.lint]
description = "Run all linters"
depends = ["lint:rust", "lint:py", "fe:lint", "lint:design", "check:commit-types", "check:actions"]
```

- [ ] **Step 4: Run the new lint task alone**

```bash
mise run lint:design
```

Expected: `"errors": 0` in the JSON output; warnings match Task 1 Step 2. Exit code 0.

- [ ] **Step 5: Run the full lint pipeline**

```bash
mise run lint
```

Expected: exit 0 across every sub-task, including `lint:design`.

- [ ] **Step 6: Report back**

Report: the pinned `@google/design.md` version, the JSON warning summary from `mise run lint:design`, and confirmation that `mise run lint` still passes.

---

### Checkpoint: Commit 2

**Owner:** main session.

- [ ] **Step 1: Review the diff**

```bash
git diff --stat
```

Expected files changed: `frontend/package.json`, `frontend/pnpm-lock.yaml`, `mise.toml`. No others.

- [ ] **Step 2: Stage and commit**

```bash
git add frontend/package.json frontend/pnpm-lock.yaml mise.toml
git commit -m "chore(frontend): add @google/design.md devDep and lint:design task"
```

Pre-commit will run `mise run lint`, which now includes `lint:design`. Expected: passes.

---

### Task 6: Finalize docs (autopilot step 6)

**Owner:** main session.

Run `claude-md-management:revise-claude-md` then `claude-md-management:claude-md-improver` via the `Skill` tool. Apply any suggested CLAUDE.md edits directly (autopilot autonomous-mode rule). Most likely output: a short note in `frontend/CLAUDE.md` about the DESIGN.md ↔ `app.css` sync rule (already covered by Task 3) and possibly a new entry in the root `.claude/CLAUDE.md` about the `lint:design` task.

Optionally update `docs/architecture/overview.md` if the file mentions the frontend design system layer; otherwise skip.

---

### Task 7: PR

**Owner:** main session.

- [ ] **Step 1: Skill audit** — verify every row of the autopilot "Required skill invocations" table was actually invoked in this session. Re-invoke any missing skills.

- [ ] **Step 2: Push**

```bash
mise exec -- git push -u origin docs/design-md-evaluation
```

- [ ] **Step 3: Open the PR**

```bash
gh pr create --base master --head docs/design-md-evaluation \
  --title "feat(frontend): adopt google-labs-code/design.md for the PK visual identity" \
  --body "$(cat <<'EOF'
## Summary

- Adds `frontend/DESIGN.md` capturing the PK palette, typography, rounded/spacing scales, and key components in the google-labs-code DESIGN.md format (YAML frontmatter + markdown prose). Purpose: a single agent-loadable canonical doc for the visual identity.
- Pins `@google/design.md@0.1.1` as a frontend devDep and wires `mise run lint:design` into `mise run lint` so CI, pre-commit, and local runs all enforce the file.
- ADR 0012 records the decision. `OPEN_THINGS.md` drops the Design item and adds a contrast-ratio follow-up under Product capabilities.

## Non-goals

- No runtime CSS change. `frontend/src/styles/app.css` is untouched.
- No codegen between `app.css` and `DESIGN.md` in either direction.
- No dark-mode tokens in DESIGN.md YAML (schema has no variant mechanism).
- No Tailwind / DTCG export yet.

## Test plan

- [ ] `mise run lint` passes on the branch.
- [ ] `mise run lint:design` prints `"errors": 0`; warnings match documented set (primary/secondary contrast, orphaned palette tokens, info counts).
- [ ] `mise run fe:build` still succeeds.
- [ ] Full CI pipeline green on the PR.

## Links

- Spec: `docs/superpowers/specs/2026-04-24-design-md-adoption-design.md`
- Plan: `docs/superpowers/plans/2026-04-24-design-md-adoption.md`
- ADR: `docs/adr/0012-design-md-canonical-artifact.md`
- Upstream format: https://github.com/google-labs-code/design.md
EOF
)"
```

- [ ] **Step 4: Post brainstorm Q&A comments**

```bash
python3 .claude/commands/post_brainstorm_comments.py <pr-number>
```

- [ ] **Step 5: Watch CI green**

Use Monitor to poll `gh pr checks <pr-number>` until all required checks resolve. Fix any failure in a follow-up commit on the branch. Do not merge.

---

## Self-review

**Spec coverage:**
- Goals from spec: land DESIGN.md (Task 1), land CLI + mise wiring (Task 5), ADR + OPEN_THINGS update (Tasks 2, 4). Covered.
- Non-goals: no runtime CSS, no codegen, no dark-mode YAML. Each task respects the non-goal; no task touches `app.css` or introduces a generator.
- Known warning set matches what Step 2 of Task 1 expects.
- Rollout commit split matches spec exactly (2 commits).
- Architecture file list in spec matches plan file list.

**Placeholder scan:** No "TBD", no "similar to above", every code block is literal. Prose body for Task 1 is outlined; subagent must produce concrete text per the outline, and the "produce a concrete polished prose body, not a placeholder" instruction is explicit. ADR sections are concretely specified.

**Type consistency:** No functions. Token references like `{colors.primary}` match the YAML schema's path syntax. Mise task name `lint:design` is used identically in Task 5 Step 2 and in the `depends` array in Task 5 Step 3.

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-24-design-md-adoption.md`.**

Autopilot autonomous mode: the main session proceeds with **Subagent-Driven execution** (Tasks 1-4 in parallel, then commit 1; Task 5; then commit 2) per the `/autopilot` rule. No interactive choice prompt.
