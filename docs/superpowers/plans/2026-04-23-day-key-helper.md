# Day-Key Helper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract `dayShortKey` / `dayLongKey` i18n helpers into `frontend/src/i18n/day-keys.ts`, migrate four existing cast call sites, remove the local `longDayKey` helper in `time-blocks-table.tsx`, and remove the resolved OPEN_THINGS bullet. Ship as one atomic structural commit; no behavior change.

**Architecture:** A pure module exporting two helpers whose return types are template-literal strings (`` `common.daysShort.${DayKey}` ``, `` `common.daysLong.${DayKey}` ``) typed against the `en.json` i18n catalog. Each helper validates the integer-day input (`[0, 4]`) and throws `RangeError` on out-of-range. Call sites then consume the helpers via `t(dayShortKey(day))` / `t(dayLongKey(day))`, deleting inline `as` casts.

**Tech Stack:** TypeScript (strict, `erasableSyntaxOnly`, `noUncheckedIndexedAccess`), Vitest, Biome, react-i18next.

---

## File Structure

**Create:**
- `frontend/src/i18n/day-keys.ts` — two exported helpers + internal `DAY_KEYS` / `DayKey` / `assertDayKey`.
- `frontend/src/i18n/day-keys.test.ts` — colocated unit tests.

**Modify:**
- `frontend/src/features/week-schemes/week-schemes-page.tsx` — one cast replaced.
- `frontend/src/features/teachers/teacher-availability-grid.tsx` — two casts replaced.
- `frontend/src/features/rooms/room-availability-grid.tsx` — two casts replaced.
- `frontend/src/features/week-schemes/time-blocks-table.tsx` — local `longDayKey` / `DAY_KEYS` / `DayKey` deleted, import + call site migrated.
- `docs/superpowers/OPEN_THINGS.md` — remove the resolved "Pay down alongside the sprint" bullet for this refactor.

**Delete:**
- None.

## Commit strategy

**One atomic commit** at the end of Task 8 with message:

```
refactor(frontend): extract dayShortKey/dayLongKey i18n helper
```

The spec commit (`docs: add day-key helper design spec`) already landed. The plan commit (`docs: add day-key helper implementation plan`) lands at the end of Task 0. Everything else in Tasks 1..8 lives on the working tree until Task 8's final commit. This matches `docs/superpowers/specs/2026-04-23-day-key-helper-design.md` > "Implementation order".

---

### Task 0: Commit this plan

**Files:**
- Create: `docs/superpowers/plans/2026-04-23-day-key-helper.md` (this file)

- [ ] **Step 1: Stage and commit the plan**

```bash
git add docs/superpowers/plans/2026-04-23-day-key-helper.md
git commit -m "docs: add day-key helper implementation plan"
```

Expected: lefthook pre-commit runs lint and passes; commit lands.

---

### Task 1: Write the failing test for `day-keys.ts`

**Files:**
- Create: `frontend/src/i18n/day-keys.test.ts`

- [ ] **Step 1: Write the test file**

```ts
import { describe, expect, it } from "vitest";
import { dayLongKey, dayShortKey } from "./day-keys";

describe("dayShortKey", () => {
  it("maps 0..4 to typed daysShort keys", () => {
    expect(dayShortKey(0)).toBe("common.daysShort.0");
    expect(dayShortKey(1)).toBe("common.daysShort.1");
    expect(dayShortKey(2)).toBe("common.daysShort.2");
    expect(dayShortKey(3)).toBe("common.daysShort.3");
    expect(dayShortKey(4)).toBe("common.daysShort.4");
  });

  it("throws RangeError for out-of-range integers", () => {
    expect(() => dayShortKey(-1)).toThrow(RangeError);
    expect(() => dayShortKey(5)).toThrow(RangeError);
  });

  it("throws RangeError for non-integer numbers", () => {
    expect(() => dayShortKey(1.5)).toThrow(RangeError);
    expect(() => dayShortKey(Number.NaN)).toThrow(RangeError);
    expect(() => dayShortKey(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe("dayLongKey", () => {
  it("maps 0..4 to typed daysLong keys", () => {
    expect(dayLongKey(0)).toBe("common.daysLong.0");
    expect(dayLongKey(1)).toBe("common.daysLong.1");
    expect(dayLongKey(2)).toBe("common.daysLong.2");
    expect(dayLongKey(3)).toBe("common.daysLong.3");
    expect(dayLongKey(4)).toBe("common.daysLong.4");
  });

  it("throws RangeError for out-of-range integers", () => {
    expect(() => dayLongKey(-1)).toThrow(RangeError);
    expect(() => dayLongKey(5)).toThrow(RangeError);
  });

  it("throws RangeError for non-integer numbers", () => {
    expect(() => dayLongKey(1.5)).toThrow(RangeError);
    expect(() => dayLongKey(Number.NaN)).toThrow(RangeError);
    expect(() => dayLongKey(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd frontend && mise exec -- pnpm vitest run src/i18n/day-keys.test.ts`

Expected: FAIL with a resolution error along the lines of "Cannot find module './day-keys'" because the helper module does not exist yet.

---

### Task 2: Implement `day-keys.ts`

**Files:**
- Create: `frontend/src/i18n/day-keys.ts`

- [ ] **Step 1: Write the helper module**

```ts
const DAY_KEYS = ["0", "1", "2", "3", "4"] as const;
type DayKey = (typeof DAY_KEYS)[number];

function assertDayKey(day: number): DayKey {
  if (!Number.isInteger(day) || day < 0 || day > 4) {
    throw new RangeError(`day must be an integer in [0, 4], got ${day}`);
  }
  return String(day) as DayKey;
}

export function dayShortKey(day: number): `common.daysShort.${DayKey}` {
  return `common.daysShort.${assertDayKey(day)}`;
}

export function dayLongKey(day: number): `common.daysLong.${DayKey}` {
  return `common.daysLong.${assertDayKey(day)}`;
}
```

- [ ] **Step 2: Run the test and verify it passes**

Run: `cd frontend && mise exec -- pnpm vitest run src/i18n/day-keys.test.ts`

Expected: PASS, 6 tests green (3 per helper: happy path, out-of-range int, non-integer).

- [ ] **Step 3: Typecheck the module in isolation**

Run: `cd frontend && mise exec -- pnpm exec tsc --noEmit`

Expected: No new errors. `erasableSyntaxOnly` passes (the `DAY_KEYS` const is not an enum; `DayKey` is a type alias).

---

### Task 3: Migrate `week-schemes-page.tsx`

**Files:**
- Modify: `frontend/src/features/week-schemes/week-schemes-page.tsx:161`

- [ ] **Step 1: Add the import and replace the cast**

Find the existing import block for `@/i18n/...` or add alongside the other `@/` imports. Then replace:

```tsx
{daysPresent.map((day) => (
  <div key={day} className="kz-ws-cell" data-variant="header">
    {t(`common.daysShort.${day as 0 | 1 | 2 | 3 | 4}`)}
  </div>
))}
```

with:

```tsx
{daysPresent.map((day) => (
  <div key={day} className="kz-ws-cell" data-variant="header">
    {t(dayShortKey(day))}
  </div>
))}
```

And add at the top of the file (after existing `@/` imports):

```tsx
import { dayShortKey } from "@/i18n/day-keys";
```

- [ ] **Step 2: Run the page's existing tests**

Run: `cd frontend && mise exec -- pnpm vitest run src/features/week-schemes`

Expected: All existing tests in `week-schemes/` remain green. No snapshot diffs.

---

### Task 4: Migrate `teacher-availability-grid.tsx`

**Files:**
- Modify: `frontend/src/features/teachers/teacher-availability-grid.tsx:134,147`

- [ ] **Step 1: Add import and replace both casts**

Add at the top (grouped with other `@/` imports):

```tsx
import { dayLongKey, dayShortKey } from "@/i18n/day-keys";
```

Replace line 134:

```tsx
{t(`common.daysShort.${d}` as "common.daysShort.0")}
```

with:

```tsx
{t(dayShortKey(d))}
```

Replace line 147:

```tsx
const dayName = t(`common.daysLong.${d}` as "common.daysLong.0");
```

with:

```tsx
const dayName = t(dayLongKey(d));
```

- [ ] **Step 2: Run the grid's existing tests**

Run: `cd frontend && mise exec -- pnpm vitest run src/features/teachers`

Expected: All existing teacher tests green. `teacher-availability-grid.test.tsx` assertions on rendered day labels remain true.

---

### Task 5: Migrate `room-availability-grid.tsx`

**Files:**
- Modify: `frontend/src/features/rooms/room-availability-grid.tsx:98,111`

- [ ] **Step 1: Add import and replace both casts**

Add at the top (grouped with other `@/` imports):

```tsx
import { dayLongKey, dayShortKey } from "@/i18n/day-keys";
```

Replace line 98:

```tsx
{t(`common.daysShort.${d}` as "common.daysShort.0")}
```

with:

```tsx
{t(dayShortKey(d))}
```

Replace line 111:

```tsx
const dayName = t(`common.daysLong.${d}` as "common.daysLong.0");
```

with:

```tsx
const dayName = t(dayLongKey(d));
```

- [ ] **Step 2: Run the grid's existing tests**

Run: `cd frontend && mise exec -- pnpm vitest run src/features/rooms`

Expected: All existing room tests green.

---

### Task 6: Replace local `longDayKey` in `time-blocks-table.tsx`

**Files:**
- Modify: `frontend/src/features/week-schemes/time-blocks-table.tsx:48-55,230`

- [ ] **Step 1: Delete the local helper and supporting aliases**

Remove lines 48-55 (the `DAY_KEYS` const, the `DayKey` type alias, and the `longDayKey` function):

```tsx
const DAY_KEYS = ["0", "1", "2", "3", "4"] as const;

type DayKey = (typeof DAY_KEYS)[number];

function longDayKey(day: number): `common.daysLong.${DayKey}` {
  const key = String(day) as DayKey;
  return `common.daysLong.${key}`;
}
```

Add a new import grouped with other `@/` imports at the top of the file:

```tsx
import { dayLongKey } from "@/i18n/day-keys";
```

- [ ] **Step 2: Migrate the call site**

Find the call site around line 230 that currently reads (after the local helper is removed the reference to `longDayKey(day)` still dangles; replace it):

```tsx
const key = longDayKey(block.day_of_week);
// ...
{t(key)}
```

Adjust to use the imported helper directly. The exact before/after depends on how the surrounding code stored the key; if the file binds to a local `key` via `longDayKey(...)`, replace with `dayLongKey(...)`. The net edit is:

- Replace `longDayKey(` with `dayLongKey(` at the remaining call site(s).

Use `cd frontend && rg -n 'longDayKey' src/features/week-schemes/time-blocks-table.tsx` to confirm zero remaining references.

- [ ] **Step 3: Run the table's existing tests**

Run: `cd frontend && mise exec -- pnpm vitest run src/features/week-schemes/time-blocks-table.test.tsx`

Expected: All existing tests green.

---

### Task 7: Verify the refactor is complete

**Files:** Read-only checks.

- [ ] **Step 1: Grep for any remaining casts**

Run the three checks; each must return zero matches:

```bash
rg 'as 0 \| 1 \| 2 \| 3 \| 4' frontend/src
rg 'as "common\.daysShort' frontend/src
rg 'as "common\.daysLong' frontend/src
rg '\blongDayKey\b' frontend/src
```

Expected: each `rg` exits non-zero (no matches).

- [ ] **Step 2: Run the full frontend test suite**

Run: `mise run fe:test`

Expected: All tests pass. Coverage delta is positive (new file added with near-100% line coverage).

- [ ] **Step 3: Run the full lint suite**

Run: `mise run lint`

Expected: Passes. No new biome warnings, no ruff/ty/vulture/cargo hits.

- [ ] **Step 4: Typecheck end to end**

Run: `cd frontend && mise exec -- pnpm exec tsc --noEmit`

Expected: Clean exit. (CI runs this after `fe:build`; doing it now catches `noUncheckedIndexedAccess` strict-mode issues before push.)

---

### Task 8: Remove the resolved OPEN_THINGS bullet and commit

**Files:**
- Modify: `docs/superpowers/OPEN_THINGS.md`

- [ ] **Step 1: Remove the bullet**

Under `## Pay down alongside the sprint`, delete the entire entry that starts with `**Extract dayShortKey(n: number) helper before step 1.**` and ends with `Surfaced during PR #116 review.`. That is currently one block; delete the block and the blank line that follows it.

Verify that the "Pay down alongside the sprint" section now contains no references to `dayShortKey`:

```bash
rg -n 'dayShortKey' docs/superpowers/OPEN_THINGS.md
```

Expected: no matches.

- [ ] **Step 2: Stage and commit everything**

```bash
git add frontend/src/i18n/day-keys.ts \
        frontend/src/i18n/day-keys.test.ts \
        frontend/src/features/week-schemes/week-schemes-page.tsx \
        frontend/src/features/teachers/teacher-availability-grid.tsx \
        frontend/src/features/rooms/room-availability-grid.tsx \
        frontend/src/features/week-schemes/time-blocks-table.tsx \
        docs/superpowers/OPEN_THINGS.md
git commit -m "refactor(frontend): extract dayShortKey/dayLongKey i18n helper"
```

Expected: lefthook `pre-commit` runs `mise run lint` and passes. `cog` commit-msg hook accepts the Conventional Commits format (`refactor` type + `frontend` scope, lowercase subject).

- [ ] **Step 3: Verify working tree is clean**

Run: `git status`

Expected: `nothing to commit, working tree clean`. Two commits ahead of master (the spec + plan commits landed earlier are already counted; this is the third).

---

## Self-review check against the spec

1. **Spec coverage:**
   - Module at `frontend/src/i18n/day-keys.ts` with `dayShortKey` + `dayLongKey` + private `DAY_KEYS` + private `DayKey` + private `assertDayKey` → Task 2.
   - Colocated test covering happy path + RangeError branch → Task 1.
   - Four call-site migrations → Tasks 3, 4, 5, 6.
   - Local `longDayKey` / `DAY_KEYS` / `DayKey` removal in `time-blocks-table.tsx` → Task 6.
   - Behavior preservation verified via existing component tests → Tasks 3-7.
   - OPEN_THINGS bullet removal in same commit → Task 8.
   - Single `refactor(frontend):` commit → Task 8, Step 2.
2. **Placeholder scan:** No TBD / TODO / "add appropriate X" / "similar to Task N" phrases. All code blocks are concrete.
3. **Type consistency:** `dayShortKey` / `dayLongKey` names are used identically across Tasks 1, 2, 3, 4, 5, 6. `DayKey` is private to the module; no task references it externally.
