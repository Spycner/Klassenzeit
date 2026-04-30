# Playwright locale pin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pin Playwright's Chromium context to `en-US` so the e2e suite no longer depends on the host system's `navigator.language` matching `en-*`.

**Architecture:** One key (`locale: "en-US"`) added to the top-level `use` block in `frontend/e2e/playwright.config.ts`. No new files, no new abstractions, no test changes. Spec/plan/brainstorm files committed via the autopilot bookkeeping commits; OPEN_THINGS and the auto-memory roadmap update as a follow-up `docs:` commit on the same branch.

**Tech Stack:** Playwright (`@playwright/test` 1.59.x), the Klassenzeit frontend's `frontend/e2e/playwright.config.ts`.

---

## File Structure

- **Modify:** `frontend/e2e/playwright.config.ts` — add `locale: "en-US"` to the `use` block.
- **Modify:** `docs/superpowers/OPEN_THINGS.md` — close out the Tidy phase entry for "Pin Playwright locale explicitly". The drift-check entry is already gone; this PR removes the second tidy bullet from the active sprint.
- **No file** changed: `frontend/src/i18n/init.ts`, `frontend/src/i18n/config.ts`, every `frontend/e2e/flows/*.spec.ts`, every `frontend/e2e/fixtures/*.ts`. The pin is a config-level change; spec assertions stay as written.

---

## Task 1: Pin the Playwright locale

**Files:**

- Modify: `frontend/e2e/playwright.config.ts:19-23` (the `use` block).

- [ ] **Step 1: Read the current `use` block.**

Run: `sed -n '18,24p' frontend/e2e/playwright.config.ts`

Expected output:

```ts
  reporter: [["list"], ["html", { outputFolder: "../playwright-report", open: "never" }]],
  use: {
    baseURL: FRONTEND_URL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
```

- [ ] **Step 2: Add `locale: "en-US"` between `baseURL` and `screenshot`.**

Apply this exact diff (insert one line; preserve the trailing comma on `baseURL`):

```diff
   use: {
     baseURL: FRONTEND_URL,
+    locale: "en-US",
     screenshot: "only-on-failure",
     trace: "retain-on-failure",
   },
```

The placement keeps related context-level options (`baseURL`, `locale`) above the diagnostic options (`screenshot`, `trace`), matching the existing visual grouping.

- [ ] **Step 3: Verify Biome accepts the change.**

Run: `cd frontend && mise exec -- pnpm biome check e2e/playwright.config.ts`

Expected: `Checked 1 file ... No fixes applied.` Biome enforces double-quoted string literals and a trailing comma on the inserted line; the diff above already follows both rules.

- [ ] **Step 4: Run the e2e suite locally.**

Run: `mise run e2e`

Expected: both Playwright projects (`admin-setup` and `chromium`) report PASS. The `admin-setup` project loads `/login`, signs in, and waits for the `welcome back` heading; that wait is the canary that proves locale detection landed on `en` rather than `de`. If the wait still passes after the pin, the pin works (the same wait passed pre-pin only because the host's `navigator.language` happened to start with `en`; post-pin it passes regardless of host).

If the suite fails: read the failed flow's trace under `frontend/playwright-report/`, confirm the failure is unrelated to locale (e.g., a backend container that didn't come up), and re-run. Do not relax the pin.

- [ ] **Step 5: Commit.**

```bash
git add frontend/e2e/playwright.config.ts
git commit -m "$(cat <<'EOF'
test(e2e): pin Playwright locale to en-US

The Playwright config let Chromium inherit the host's locale, so on a
machine reporting navigator.language === "de-DE" the i18next detector
short-circuits on "de" before reaching the English fallback and the
admin-setup "Welcome back" wait hangs.

Pinning locale to en-US makes detection deterministic across runners.
No spec or assertion change; the existing English-copy assertions are
the cross-cutting check.

Closes Tidy phase Task 1 of the Realer Schulalltag sprint
(docs/superpowers/OPEN_THINGS.md).
EOF
)"
```

---

## Task 2: Close out the OPEN_THINGS bullet

**Files:**

- Modify: `docs/superpowers/OPEN_THINGS.md` — remove the "Pin Playwright locale explicitly" bullet from the Tidy phase. The Tidy phase header itself is removed once both bullets are gone (the drift-check bullet shipped last PR; this PR clears the second).

- [ ] **Step 1: Read the current Tidy phase block.**

Run: `sed -n '11,15p' docs/superpowers/OPEN_THINGS.md`

Expected output (lines 11-13 today):

```
### Tidy phase (catchup from prior DX/CI sprint)

1. **Pin Playwright locale explicitly.** `[P1]` Carried over from DX/CI sprint. Add `locale: "en-US"` to `use` in `frontend/playwright.config.ts` so tests do not rely on Chromium's default locale and i18n's English fallback.
```

- [ ] **Step 2: Delete the entire Tidy phase block.**

Use the `Edit` tool to remove these three lines plus the blank line that follows. The next section header (`### Data + schema phase`) becomes the first section under the sprint heading.

- [ ] **Step 3: Verify the file still parses cleanly.**

Run: `head -20 docs/superpowers/OPEN_THINGS.md`

Expected: `## Active sprint: Realer Schulalltag + better scheduler` is followed (after the prose paragraph) by `### Data + schema phase`. No orphan numbered list. The numbering of the data + schema phase items stays as is — they are written as tasks 2..4 today and stay tasks 2..4.

- [ ] **Step 4: Commit.**

```bash
git add docs/superpowers/OPEN_THINGS.md
git commit -m "docs: close playwright-locale-pin tidy from realer-schulalltag sprint"
```

---

## Self-Review

**Spec coverage:**

- "Add `locale: 'en-US'` to top-level `use`": Task 1.
- "OPEN_THINGS update": Task 2.
- "Verify with `mise run e2e`": Task 1 step 4.
- "No new test, no new abstraction": confirmed — neither task adds a file or a test.
- "Auto-memory roadmap update": handled in autopilot step 6 (`claude-md-management:revise-claude-md`), not in this implementation plan.

**Placeholder scan:** none. Every step has a concrete command or diff.

**Type consistency:** the only identifier is `locale: "en-US"`, used in step 2 of Task 1 and the spec. Consistent.

---

## Execution

The plan ships as two commits on `test/playwright-locale-pin`. Per the autopilot run, both tasks dispatch as subagents with shared state on the branch (sequential, not parallel).
