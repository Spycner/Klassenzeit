# useEffect derived-state sync lint rule — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce `frontend/CLAUDE.md`'s "no `useEffect` for derived state" rule with an automated lint script, and remove the three existing in-tree violations by refactoring the editor components to a parent-guard + lazy-`useState` pattern.

**Architecture:** Each violating editor (`RoomAvailabilityGrid`, `TeacherAvailabilityGrid`, `TeacherQualificationsEditor`) is split into an outer wrapper that fetches the detail query and gates rendering on `detail.isSuccess`, and an inner component that takes the loaded entity as a prop and seeds local draft state via a lazy `useState` initializer. The lint mechanism is a Python regex script under `scripts/check_use_effect_sync.py`, mirroring the existing `scripts/check_unique_fns.py` precedent, wired into `mise.toml`'s `lint:py` task so pre-commit and CI both enforce it.

**Tech Stack:** React 19, TanStack Query, TypeScript, Vitest + React Testing Library + MSW, Python 3.13 (regex `re` module + `pathlib`), pytest, mise tasks.

---

## File Structure

Files this plan touches, by responsibility:

**Refactored editors** (each split into outer wrapper + inner loaded component, single file per editor):

- `frontend/src/features/rooms/room-availability-grid.tsx` — outer `RoomAvailabilityGrid` + inner `RoomAvailabilityGridLoaded`.
- `frontend/src/features/teachers/teacher-availability-grid.tsx` — outer + inner `TeacherAvailabilityGridLoaded`. The existing nested `TeacherAvailabilitySchemeSection` stays.
- `frontend/src/features/teachers/teacher-qualifications-editor.tsx` — outer + inner `TeacherQualificationsEditorLoaded`.

**Component tests** (refetch-preserves-edits assertions added next to existing specs):

- `frontend/src/features/rooms/room-availability-grid.test.tsx`
- `frontend/src/features/teachers/teacher-availability-grid.test.tsx`
- `frontend/src/features/teachers/teacher-qualifications-editor.test.tsx`

**Lint script + tests** (Python, runs from repo root):

- `scripts/check_use_effect_sync.py` — new file, regex-based matcher, exits non-zero if any violations.
- `scripts/tests/test_check_use_effect_sync.py` — new file, pytest fixtures covering positive and negative shapes.

**Wiring**:

- `mise.toml` — one new line in `lint:py.run`, description tweak.

**Docs**:

- `frontend/CLAUDE.md` — one-bullet edit in "Hooks and state".
- `docs/superpowers/OPEN_THINGS.md` — mark item 4 shipped, add follow-up note about multi-statement bodies.

---

## Task 1: Refactor the three editors (one commit)

**Goal:** Replace `useEffect(() => setX(persisted), [persisted])` with the outer/inner + lazy-`useState` pattern in all three editors. Existing component tests pass without modification.

**Files:**

- Modify: `frontend/src/features/rooms/room-availability-grid.tsx`
- Modify: `frontend/src/features/teachers/teacher-availability-grid.tsx`
- Modify: `frontend/src/features/teachers/teacher-qualifications-editor.tsx`
- Read (no change): `frontend/src/features/rooms/room-availability-grid.test.tsx`, `frontend/src/features/teachers/teacher-availability-grid.test.tsx`, `frontend/src/features/teachers/teacher-qualifications-editor.test.tsx`

### Step 1: Run existing component tests, confirm green baseline

Run: `cd frontend && mise exec -- pnpm vitest run src/features/rooms/room-availability-grid.test.tsx src/features/teachers/teacher-availability-grid.test.tsx src/features/teachers/teacher-qualifications-editor.test.tsx`

Expected: PASS, three test files, all `it(...)` cases green.

Don't proceed if any case fails on master baseline.

### Step 2: Refactor `room-availability-grid.tsx`

Replace the entire component definition with the outer/inner split. The schemes hook stays where it is (the inner component still needs it for the per-scheme grid sections).

Before (lines 1-29 of the file):

```tsx
import { useEffect, useMemo, useState } from "react";
// ...
export function RoomAvailabilityGrid({ roomId }: { roomId: string }) {
  const { t } = useTranslation();
  const detail = useRoomDetail(roomId);
  const schemes = useWeekSchemes();
  const save = useSaveRoomAvailability();

  const persisted = useMemo(
    () => new Set((detail.data?.availability ?? []).map((a) => a.time_block_id)),
    [detail.data],
  );
  const [selected, setSelected] = useState<Set<string>>(persisted);
  useEffect(() => setSelected(persisted), [persisted]);

  function toggleRoomAvailabilityCell(id: string) {
    // ...
  }

  async function handleRoomAvailabilitySave() {
    await save.mutateAsync({ id: roomId, timeBlockIds: Array.from(selected) });
  }

  return (
    // ...
  );
}
```

After:

```tsx
import { useMemo, useState } from "react";
// ... existing other imports unchanged
import { type RoomDetail, useRoomDetail, useSaveRoomAvailability } from "./hooks";

export function RoomAvailabilityGrid({ roomId }: { roomId: string }) {
  const detail = useRoomDetail(roomId);
  if (!detail.isSuccess) return null;
  return <RoomAvailabilityGridLoaded room={detail.data} />;
}

function RoomAvailabilityGridLoaded({ room }: { room: RoomDetail }) {
  const { t } = useTranslation();
  const schemes = useWeekSchemes();
  const save = useSaveRoomAvailability();

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(room.availability.map((a) => a.time_block_id)),
  );

  function toggleRoomAvailabilityCell(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleRoomAvailabilitySave() {
    await save.mutateAsync({ id: room.id, timeBlockIds: Array.from(selected) });
  }

  // ... existing JSX, replace `roomId` references with `room.id`,
  // remove the `useMemo` for `persisted` (no longer needed)
}
```

Key change details:

- `useEffect` is gone; the import drops it.
- `useMemo` for `persisted` is gone; the lazy `useState(() => new Set(...))` initializer replaces it.
- The save handler's `roomId` becomes `room.id`.
- `RoomDetail` type comes from `./hooks`; verify the type exists or define it inline. If `useRoomDetail` returns a typed query result, narrow the inner prop type accordingly.

If `RoomDetail` is not exported from `./hooks`, check the existing return type of `useRoomDetail` and either export the type from `./hooks` or define it inline as `Parameters<typeof useRoomDetail>[0]`-style narrowing. Read `frontend/src/features/rooms/hooks.ts` first.

### Step 3: Run room-availability tests, confirm green

Run: `cd frontend && mise exec -- pnpm vitest run src/features/rooms/room-availability-grid.test.tsx`

Expected: both `it(...)` cases green. The `findByRole` async waits handle the new "outer returns null while loading" timing; no test changes needed.

If a test fails, the most likely cause is the `RoomDetail` type narrowing. Inspect the failure and adjust before moving on.

### Step 4: Refactor `teacher-availability-grid.tsx`

Same pattern. Outer fetches `useTeacherDetail(teacherId)`, gates on `detail.isSuccess`, passes `detail.data` to `TeacherAvailabilityGridLoaded`. Inner component does the work. The `TeacherAvailabilitySchemeSection` helper stays untouched.

Before:

```tsx
import { useEffect, useMemo, useState } from "react";
// ...
export function TeacherAvailabilityGrid({ teacherId }: { teacherId: string }) {
  const { t } = useTranslation();
  const detail = useTeacherDetail(teacherId);
  const schemes = useWeekSchemes();
  const save = useSaveTeacherAvailability();

  const persisted = useMemo(() => {
    const map = new Map<string, TeacherAvailabilityStatus>();
    for (const entry of detail.data?.availability ?? []) {
      if (
        isTeacherAvailabilityStatus(entry.status) &&
        (entry.status === "preferred" || entry.status === "unavailable")
      ) {
        map.set(entry.time_block_id, entry.status);
      }
    }
    return map;
  }, [detail.data]);

  const [statuses, setStatuses] = useState<Map<string, TeacherAvailabilityStatus>>(persisted);
  useEffect(() => setStatuses(persisted), [persisted]);

  // ...
}
```

After:

```tsx
import { useState } from "react";
// ... other imports unchanged
import { type TeacherDetail, useSaveTeacherAvailability, useTeacherDetail } from "./hooks";

export function TeacherAvailabilityGrid({ teacherId }: { teacherId: string }) {
  const detail = useTeacherDetail(teacherId);
  if (!detail.isSuccess) return null;
  return <TeacherAvailabilityGridLoaded teacher={detail.data} />;
}

function TeacherAvailabilityGridLoaded({ teacher }: { teacher: TeacherDetail }) {
  const { t } = useTranslation();
  const schemes = useWeekSchemes();
  const save = useSaveTeacherAvailability();

  const [statuses, setStatuses] = useState<Map<string, TeacherAvailabilityStatus>>(() => {
    const map = new Map<string, TeacherAvailabilityStatus>();
    for (const entry of teacher.availability) {
      if (
        isTeacherAvailabilityStatus(entry.status) &&
        (entry.status === "preferred" || entry.status === "unavailable")
      ) {
        map.set(entry.time_block_id, entry.status);
      }
    }
    return map;
  });

  function setTeacherAvailabilityStatus(blockId: string, next: TeacherAvailabilityStatus) {
    setStatuses((prev) => {
      const map = new Map(prev);
      if (next === "available") map.delete(blockId);
      else map.set(blockId, next);
      return map;
    });
  }

  async function handleTeacherAvailabilitySave() {
    const entries: TeacherAvailabilityEntry[] = [];
    for (const [id, status] of statuses) {
      entries.push({ time_block_id: id, status });
    }
    try {
      await save.mutateAsync({ id: teacher.id, entries });
      toast.success(t("teachers.availability.saved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("teachers.availability.saveError"));
    }
  }

  return (
    // ... existing JSX, replace `teacherId` with `teacher.id` if referenced
  );
}
```

Same removal: `useEffect`, `useMemo`. Lazy initializer reads from `teacher.availability` (the prop). `TeacherDetail` type comes from `./hooks`; mirror the `RoomDetail` decision (export the type if not already).

### Step 5: Run teacher-availability tests, confirm green

Run: `cd frontend && mise exec -- pnpm vitest run src/features/teachers/teacher-availability-grid.test.tsx`

Expected: PASS.

### Step 6: Refactor `teacher-qualifications-editor.tsx`

Same pattern, simplest of the three.

Before:

```tsx
import { useEffect, useState } from "react";
// ...
export function TeacherQualificationsEditor({ teacherId }: { teacherId: string }) {
  const { t } = useTranslation();
  const detail = useTeacherDetail(teacherId);
  const save = useSaveTeacherQualifications();
  const persisted = detail.data?.qualifications.map((q) => q.id) ?? [];
  const [draft, setDraft] = useState<string[]>(persisted);
  useEffect(() => {
    setDraft(detail.data?.qualifications.map((q) => q.id) ?? []);
  }, [detail.data]);
  // ...
}
```

After:

```tsx
import { useState } from "react";
// ...
import {
  type TeacherDetail,
  useSaveTeacherQualifications,
  useTeacherDetail,
} from "./hooks";

export function TeacherQualificationsEditor({ teacherId }: { teacherId: string }) {
  const detail = useTeacherDetail(teacherId);
  if (!detail.isSuccess) return null;
  return <TeacherQualificationsEditorLoaded teacher={detail.data} />;
}

function TeacherQualificationsEditorLoaded({ teacher }: { teacher: TeacherDetail }) {
  const { t } = useTranslation();
  const save = useSaveTeacherQualifications();
  const [draft, setDraft] = useState<string[]>(() =>
    teacher.qualifications.map((q) => q.id),
  );

  async function handleTeacherQualificationsSave() {
    try {
      await save.mutateAsync({ id: teacher.id, subjectIds: draft });
      toast.success(t("teachers.qualifications.saved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("teachers.qualifications.saveError"));
    }
  }

  return (
    // ... existing JSX
  );
}
```

### Step 7: Run teacher-qualifications tests, confirm green

Run: `cd frontend && mise exec -- pnpm vitest run src/features/teachers/teacher-qualifications-editor.test.tsx`

Expected: PASS.

### Step 8: Run frontend lint + typecheck

Run: `cd /home/pascal/Code/Klassenzeit && mise run fe:lint`

Expected: clean. No `useEffect` import warnings, no Biome violations.

Run: `cd /home/pascal/Code/Klassenzeit/frontend && mise exec -- pnpm exec tsc --noEmit`

Expected: clean. The new `TeacherDetail` / `RoomDetail` prop types resolve.

### Step 9: Run the full frontend test suite

Run: `cd /home/pascal/Code/Klassenzeit && mise run fe:test`

Expected: all 200+ specs pass.

If a non-editor test fails (e.g. `teachers-dialogs.test.tsx`), it likely depended on the editor rendering during the loading state. Read the failing test, decide whether the test was asserting the buggy behavior or genuinely valid behavior. If the former, update the test in the same commit (it is "test moved with the implementation it tests"). If the latter, the refactor needs revisiting.

### Step 10: Commit

```bash
cd /home/pascal/Code/Klassenzeit
git add frontend/src/features/rooms/room-availability-grid.tsx \
        frontend/src/features/teachers/teacher-availability-grid.tsx \
        frontend/src/features/teachers/teacher-qualifications-editor.tsx \
        frontend/src/features/rooms/hooks.ts \
        frontend/src/features/teachers/hooks.ts
# Add hooks.ts only if the RoomDetail / TeacherDetail type export was added there
git commit -m "refactor(frontend): lift detail-fetch out of three draft editors"
```

Commit body (passed via HEREDOC) should explain the structural change in two sentences: "Each editor now gates rendering on `detail.isSuccess` and passes the loaded entity to an inner component that seeds local state via a lazy useState initializer. The three useEffect derived-state syncs (`useEffect(() => setX(persisted), [persisted])`) are removed; the existing component specs continue to pass without modification."

Pre-commit hook runs `mise run lint`. If it fails, fix the issue and re-stage; never `--no-verify`.

---

## Task 2: Add refetch-preserves-edits regression tests (one commit)

**Goal:** Lock in the property the refactor delivered: a background refetch of the detail query no longer wipes the user's in-progress edits.

**Files:**

- Modify: `frontend/src/features/rooms/room-availability-grid.test.tsx`
- Modify: `frontend/src/features/teachers/teacher-availability-grid.test.tsx`
- Modify: `frontend/src/features/teachers/teacher-qualifications-editor.test.tsx`

### Step 1: Confirm `renderWithProviders` returns the QueryClient

Read: `frontend/tests/render-helpers.tsx`

Expected: it already returns `{ queryClient, ...renderResult }`. If yes, proceed. If no, extend it (this is one line).

### Step 2: Add the room test

Append to `frontend/src/features/rooms/room-availability-grid.test.tsx` after the existing `describe` block's last `it(...)`, so the existing two specs stay first:

```tsx
import { roomDetailById } from "../../../tests/msw-handlers";
// ...

  it("preserves toggled cells when the detail query refetches in the background", async () => {
    timeBlocksBySchemeId[schemeId] = [
      {
        id: "tb-mon-1",
        day_of_week: 0,
        position: 1,
        start_time: "08:00:00",
        end_time: "08:45:00",
      },
    ];
    roomAvailabilityByRoomId[roomId] = [];
    const user = userEvent.setup();
    const { queryClient } = renderWithProviders(<RoomAvailabilityGrid roomId={roomId} />);

    const cell = await screen.findByRole("button", { name: /monday/i });
    await user.click(cell);
    expect(cell).toHaveAttribute("aria-pressed", "true");

    // Simulate a sibling-tab change: persist a different availability set, then
    // invalidate the detail query so the inner component's parent refetches.
    roomAvailabilityByRoomId[roomId] = ["tb-some-other-block"];
    await queryClient.invalidateQueries({ queryKey: ["room", roomId] });

    // Wait one render cycle for the refetch to land.
    await screen.findByRole("button", { name: /monday/i });

    // The user's in-progress toggle is preserved; the refetch did not wipe state.
    expect(screen.getByRole("button", { name: /monday/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
```

The exact `queryKey` shape (`["room", roomId]`) must match what `useRoomDetail` uses. Read `frontend/src/features/rooms/hooks.ts` to confirm. Adjust if it is `["rooms", "detail", roomId]` or similar.

If `roomDetailById` is not the right MSW seed name for the detail endpoint, look at `frontend/tests/msw-handlers.ts` for the actual seed name.

### Step 3: Run the new room test in isolation, confirm pass

Run: `cd frontend && mise exec -- pnpm vitest run src/features/rooms/room-availability-grid.test.tsx -t "preserves toggled cells"`

Expected: PASS.

### Step 4: Add the teacher-availability test

Append the same shape to `teacher-availability-grid.test.tsx`. Use a "preferred" toggle as the in-progress edit:

```tsx
  it("preserves preferred markers when the detail query refetches in the background", async () => {
    timeBlocksBySchemeId[schemeId] = [
      {
        id: "tb-mon-1",
        day_of_week: 0,
        position: 1,
        start_time: "08:00:00",
        end_time: "08:45:00",
      },
    ];
    teacherAvailabilityByTeacherId[teacherId] = [];
    const user = userEvent.setup();
    const { queryClient } = renderWithProviders(<TeacherAvailabilityGrid teacherId={teacherId} />);

    const preferredButtons = await screen.findAllByRole("button", { name: /^preferred/i });
    const firstPreferred = preferredButtons[0];
    if (!firstPreferred) throw new Error("missing preferred button");
    await user.click(firstPreferred);
    expect(firstPreferred).toHaveAttribute("aria-pressed", "true");

    teacherAvailabilityByTeacherId[teacherId] = [
      { time_block_id: "tb-some-other-block", status: "unavailable" },
    ];
    await queryClient.invalidateQueries({ queryKey: ["teacher", teacherId] });

    await screen.findAllByRole("button", { name: /^preferred/i });

    const preferredAfter = screen.getAllByRole("button", { name: /^preferred/i });
    const firstPreferredAfter = preferredAfter[0];
    if (!firstPreferredAfter) throw new Error("missing preferred button after refetch");
    expect(firstPreferredAfter).toHaveAttribute("aria-pressed", "true");
  });
```

The `if (!firstPreferred) throw new Error(...)` pattern is required by Biome's `noNonNullAssertion` rule (see `frontend/CLAUDE.md`'s testing section).

### Step 5: Run the new teacher-availability test in isolation

Run: `cd frontend && mise exec -- pnpm vitest run src/features/teachers/teacher-availability-grid.test.tsx -t "preserves preferred markers"`

Expected: PASS.

### Step 6: Add the teacher-qualifications test

Append to `teacher-qualifications-editor.test.tsx`:

```tsx
  it("preserves added qualifications when the detail query refetches in the background", async () => {
    teacherQualsByTeacherId[teacherId] = [];
    const user = userEvent.setup();
    const { queryClient } = renderWithProviders(
      <TeacherQualificationsEditor teacherId={teacherId} />,
    );

    const add = await screen.findByRole("button", { name: /mathematik/i });
    await user.click(add);
    await screen.findByRole("button", { name: /remove mathematik/i });

    // Simulate a sibling-tab persisting a different qualification set.
    teacherQualsByTeacherId[teacherId] = ["22222222-2222-2222-2222-222222222222"];
    await queryClient.invalidateQueries({ queryKey: ["teacher", teacherId] });

    // Wait for the next render cycle; the user's draft must still be there.
    await screen.findByRole("button", { name: /remove mathematik/i });
    expect(
      screen.getByRole("button", { name: /remove mathematik/i }),
    ).toBeInTheDocument();
  });
```

### Step 7: Run the new teacher-qualifications test in isolation

Run: `cd frontend && mise exec -- pnpm vitest run src/features/teachers/teacher-qualifications-editor.test.tsx -t "preserves added qualifications"`

Expected: PASS.

### Step 8: Run the full frontend test suite

Run: `cd /home/pascal/Code/Klassenzeit && mise run fe:test`

Expected: clean. The three new specs pass. No regressions elsewhere.

If frontend coverage trips the ratchet, run `mise run fe:cov:update-baseline` and stage `.coverage-baseline-frontend` in the same commit.

### Step 9: Commit

```bash
cd /home/pascal/Code/Klassenzeit
git add frontend/src/features/rooms/room-availability-grid.test.tsx \
        frontend/src/features/teachers/teacher-availability-grid.test.tsx \
        frontend/src/features/teachers/teacher-qualifications-editor.test.tsx
# Plus .coverage-baseline-frontend if rebaselined.
git commit -m "test(frontend): assert refetch preserves in-progress edits in three editors"
```

Commit body: "Adds one Vitest spec per editor that toggles an in-progress edit, simulates a background refetch via the test's QueryClient, and asserts the edit survives. Locks in the property the prior refactor delivered."

---

## Task 3: Add the lint script + wire into `mise.toml` (one commit)

**Goal:** A Python regex script that walks `frontend/src/**/*.{ts,tsx}` and exits non-zero on `useEffect(() => setX(...), [non-empty deps])` shapes, run as part of `mise run lint:py`.

**Files:**

- Create: `scripts/check_use_effect_sync.py`
- Create: `scripts/tests/test_check_use_effect_sync.py`
- Modify: `mise.toml` (one new line in `[tasks."lint:py"].run`, plus description tweak)

### Step 1: Write the failing positive-case tests

Create `scripts/tests/test_check_use_effect_sync.py` with the positive cases first. The tests target a `find_violations(source: str, file_path: str) -> list[Violation]` function exported from `scripts.check_use_effect_sync`.

```python
"""Tests for the useEffect derived-state sync lint script."""

from __future__ import annotations

import textwrap

from scripts.check_use_effect_sync import Violation, find_violations


def test_arrow_expression_body_single_line():
    """Catch the documented anti-pattern: arrow expression body, single line."""
    source = textwrap.dedent("""\
        export function Foo({ id }: { id: string }) {
          const detail = useDetail(id);
          const persisted = detail.data ?? [];
          const [draft, setDraft] = useState(persisted);
          useEffect(() => setDraft(persisted), [persisted]);
          return null;
        }
    """)
    violations = find_violations(source, "Foo.tsx")
    assert len(violations) == 1
    assert violations[0].file == "Foo.tsx"
    assert violations[0].line == 5


def test_arrow_block_body_single_statement():
    """Catch the block-body variant of the same anti-pattern."""
    source = textwrap.dedent("""\
        export function Foo() {
          const detail = useDetail();
          const [draft, setDraft] = useState([]);
          useEffect(() => {
            setDraft(detail.data?.qualifications.map((q) => q.id) ?? []);
          }, [detail.data]);
          return null;
        }
    """)
    violations = find_violations(source, "Foo.tsx")
    assert len(violations) == 1
    assert violations[0].line == 4


def test_arrow_expression_body_multiline_call():
    """Catch the anti-pattern when the call spans multiple lines."""
    source = textwrap.dedent("""\
        export function Foo() {
          useEffect(
            () => setDraft(persisted),
            [persisted],
          );
        }
    """)
    violations = find_violations(source, "Foo.tsx")
    assert len(violations) == 1
    assert violations[0].line == 2
```

### Step 2: Run the failing positive tests

Run: `cd /home/pascal/Code/Klassenzeit && uv run pytest scripts/tests/test_check_use_effect_sync.py -v`

Expected: all three FAIL with `ModuleNotFoundError: No module named 'scripts.check_use_effect_sync'`.

### Step 3: Implement the minimal matcher

Create `scripts/check_use_effect_sync.py`:

```python
"""Lint check: useEffect derived-state sync anti-pattern.

Frontend rule (frontend/CLAUDE.md > Hooks and state):

    No `useEffect` for derived state. Compute during render. For syncing to
    props, use `key` to remount or derive inline.

This script flags `useEffect` calls whose body is a single `setX(...)` call
(arrow expression body or arrow block body with a single statement) and whose
deps array is non-empty. The mount-gate exception (`useEffect(() => setX(true),
[])`) is allowed because the documented anti-pattern is specifically about
deriving state from non-empty deps.

Limitations (intentional narrowing, document for future widening):

- Multi-statement effect bodies are NOT flagged. If a future violation slips in
  with `useEffect(() => { setA(x); setB(y); }, [x, y])`, widen `_BLOCK_BODY_RE`
  to allow multiple statements before the closing brace and add the matching
  test fixture.
- The matcher is regex-based on whitespace-normalized source; it does not parse
  TS/JSX. False positives are mitigated by requiring the called identifier to
  match `^set[A-Z][A-Za-z0-9_]*$`, which excludes plain functions like
  `setupSomething(value)` and `setLocalStorage(key, value)`.

Exits 0 if clean, 1 if violations found.
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
FRONTEND_SRC = REPO_ROOT / "frontend" / "src"

EXCLUDE_PATHS = frozenset(
    {
        FRONTEND_SRC / "routeTree.gen.ts",
        FRONTEND_SRC / "lib" / "api-types.ts",
    }
)

_SETTER_NAME = r"set[A-Z][A-Za-z0-9_]*"
_NON_EMPTY_DEPS = r"\[\s*[^\s\]][^\]]*\]"

# Arrow expression body: `useEffect(() => setX(...), [deps])`.
# Captures the whole call so we can compute the line number from the match start.
_EXPR_BODY_RE = re.compile(
    r"useEffect\s*\(\s*"
    r"\(\s*\)\s*=>\s*"
    rf"({_SETTER_NAME})\s*\([^)]*\)\s*"
    rf",\s*({_NON_EMPTY_DEPS})\s*\)",
    re.DOTALL,
)

# Arrow block body, single statement: `useEffect(() => { setX(...); }, [deps])`.
_BLOCK_BODY_RE = re.compile(
    r"useEffect\s*\(\s*"
    r"\(\s*\)\s*=>\s*\{\s*"
    rf"({_SETTER_NAME})\s*\([^)]*\)\s*;?\s*"
    rf"\}\s*,\s*({_NON_EMPTY_DEPS})\s*\)",
    re.DOTALL,
)


@dataclass(frozen=True)
class Violation:
    """A useEffect derived-state-sync violation tied to a file and line."""

    file: str
    line: int
    snippet: str


def find_violations(source: str, file_path: str) -> list[Violation]:
    """Return all derived-state-sync violations in a single source string."""
    violations: list[Violation] = []
    for regex in (_EXPR_BODY_RE, _BLOCK_BODY_RE):
        for match in regex.finditer(source):
            line = source.count("\n", 0, match.start()) + 1
            snippet = match.group(0).replace("\n", " ").strip()
            violations.append(Violation(file=file_path, line=line, snippet=snippet))
    return violations


def iter_frontend_sources() -> list[Path]:
    """Yield .ts and .tsx files under frontend/src, excluding generated files."""
    if not FRONTEND_SRC.is_dir():
        return []
    files: list[Path] = []
    for ext in ("*.ts", "*.tsx"):
        files.extend(FRONTEND_SRC.rglob(ext))
    return [f for f in files if f not in EXCLUDE_PATHS]


def main() -> int:
    all_violations: list[Violation] = []
    for path in iter_frontend_sources():
        source = path.read_text(encoding="utf-8")
        rel = path.relative_to(REPO_ROOT)
        all_violations.extend(find_violations(source, str(rel)))

    if not all_violations:
        return 0

    print(
        "Found useEffect derived-state-sync violations. "
        "See frontend/CLAUDE.md > Hooks and state for the rule.",
        file=sys.stderr,
    )
    for v in all_violations:
        print(f"{v.file}:{v.line}: {v.snippet}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
```

### Step 4: Run the positive tests, confirm pass

Run: `cd /home/pascal/Code/Klassenzeit && uv run pytest scripts/tests/test_check_use_effect_sync.py -v`

Expected: three positives PASS.

### Step 5: Add negative-case tests

Append to `scripts/tests/test_check_use_effect_sync.py`:

```python
def test_empty_deps_mount_gate_is_allowed():
    """The next-themes mount-gate pattern must NOT be flagged."""
    source = textwrap.dedent("""\
        export function ThemeToggle() {
          const [mounted, setMounted] = useState(false);
          useEffect(() => {
            setMounted(true);
          }, []);
          return mounted ? null : null;
        }
    """)
    violations = find_violations(source, "ThemeToggle.tsx")
    assert violations == []


def test_empty_deps_block_body_with_cleanup_is_allowed():
    """Document listener with cleanup and empty deps must NOT be flagged."""
    source = textwrap.dedent("""\
        export function Toaster() {
          useEffect(() => {
            function dismissOnToastClick(event) {
              setSomething(event);
            }
            document.addEventListener("click", dismissOnToastClick);
            return () => document.removeEventListener("click", dismissOnToastClick);
          }, []);
          return null;
        }
    """)
    violations = find_violations(source, "Toaster.tsx")
    assert violations == []


def test_multi_statement_body_is_not_flagged_today():
    """Documented narrowing: multi-statement bodies are out of scope."""
    source = textwrap.dedent("""\
        export function Foo() {
          useEffect(() => {
            setA(value);
            setB(value);
          }, [value]);
        }
    """)
    violations = find_violations(source, "Foo.tsx")
    assert violations == []


def test_setup_function_with_lowercase_second_char_is_allowed():
    """`setupSomething` is not a React setter; the matcher must skip it."""
    source = textwrap.dedent("""\
        export function Foo() {
          useEffect(() => setupSomething(value), [value]);
        }
    """)
    violations = find_violations(source, "Foo.tsx")
    assert violations == []


def test_use_effect_inside_string_literal_is_not_flagged():
    """A literal string containing `useEffect(...)` must NOT trip the matcher."""
    source = textwrap.dedent("""\
        export const HINT = "do not write useEffect(() => setX(p), [p])";
    """)
    violations = find_violations(source, "Hint.tsx")
    # Acceptable false positive: the matcher does NOT distinguish source from
    # string literals; if this becomes a real problem in the tree, narrow the
    # matcher to exclude content inside backticks / quotes. For now the rule
    # is documented as "regex-on-source", and no real source file has this
    # pattern in a string literal.
    assert isinstance(violations, list)
```

The last test documents an acceptable limitation: a literal string containing the pattern WILL be flagged by the regex. This is fine because no real file has that shape today; if one appears, narrow the matcher then. The test asserts only `isinstance(violations, list)` so it does not lock in the wrong behavior.

### Step 6: Run all tests, confirm pass

Run: `cd /home/pascal/Code/Klassenzeit && uv run pytest scripts/tests/test_check_use_effect_sync.py -v`

Expected: all 8 tests PASS.

### Step 7: Run the script against the actual frontend tree

Run: `cd /home/pascal/Code/Klassenzeit && uv run python scripts/check_use_effect_sync.py`

Expected: exit 0 (no output, no violations). Task 1's refactor removed all three known violations.

If the script reports any violation, the refactor missed a call site or introduced a new one. Fix it before continuing.

### Step 8: Wire into `mise.toml`

Edit `mise.toml`'s `lint:py` task. Find the existing block:

```toml
[tasks."lint:py"]
description = "Lint, format-check, type-check, and dead-code scan Python"
run = [
  "uv run ruff check",
  "uv run ruff format --check",
  "uv run ty check",
  "uv run vulture backend/src",
  "uv run python scripts/check_unique_fns.py",
]
```

Replace with:

```toml
[tasks."lint:py"]
description = "Lint, format-check, type-check, dead-code scan Python; plus cross-language lint scripts"
run = [
  "uv run ruff check",
  "uv run ruff format --check",
  "uv run ty check",
  "uv run vulture backend/src",
  "uv run python scripts/check_unique_fns.py",
  "uv run python scripts/check_use_effect_sync.py",
]
```

### Step 9: Run the full lint pipeline

Run: `cd /home/pascal/Code/Klassenzeit && mise run lint`

Expected: clean. The new script reports no violations.

### Step 10: Run the full test suite

Run: `cd /home/pascal/Code/Klassenzeit && mise run test`

Expected: clean. New pytest cases pass, no regressions.

### Step 11: Commit

```bash
cd /home/pascal/Code/Klassenzeit
git add scripts/check_use_effect_sync.py \
        scripts/tests/test_check_use_effect_sync.py \
        mise.toml
git commit -m "chore(scripts): add check_use_effect_sync.py and wire into lint:py"
```

Commit body: "Adds a regex-based Python script under scripts/ that flags `useEffect(() => setX(...), [non-empty deps])` shapes in frontend TS/TSX. Mirrors scripts/check_unique_fns.py's pattern. Single-statement bodies only; multi-statement and Biome plugin migration are documented follow-ups in the script's docstring."

---

## Task 4: Update docs (one commit)

**Goal:** `frontend/CLAUDE.md` reflects that the rule is now lint-enforced. `OPEN_THINGS.md` marks tidy-phase item 4 shipped and records the multi-statement narrowing as a follow-up.

**Files:**

- Modify: `frontend/CLAUDE.md`
- Modify: `docs/superpowers/OPEN_THINGS.md`

### Step 1: Edit `frontend/CLAUDE.md`

Find this bullet under "Hooks and state":

```md
- **No `useEffect` for derived state.** Compute during render. For syncing to props, use `key` to remount or derive inline.
```

Replace with:

```md
- **No `useEffect` for derived state.** Compute during render. For syncing to props, use `key` to remount or derive inline. Enforced by `mise run lint` via `scripts/check_use_effect_sync.py`; multi-statement effect bodies are out of scope for now (documented in the script).
```

The "mount gate" bullet a few lines below stays as-is.

### Step 2: Edit `docs/superpowers/OPEN_THINGS.md`

Find tidy-phase item 4 and mark it shipped. Before:

```md
4. **Lint rule for `useEffect` derived-state syncs.** `[P1]` `frontend/CLAUDE.md` forbids `useEffect(() => setX(fromProp), [fromProp])` but two call sites still ship it (`teacher-availability-grid.tsx`, `teacher-qualifications-editor.tsx`). Write a Biome plugin, `eslint-plugin-react-hooks` rule, or a bespoke `scripts/check_use_effect_sync.ts` that flags `useEffect` bodies that are pure `setState(f(dep))`; fix the two existing violations in the same PR so the lint can run with `-D`.
```

After:

```md
4. **Lint rule for `useEffect` derived-state syncs.** `[P1]` ✅ Shipped 2026-04-25. PR `chore/use-effect-sync-lint`: bespoke `scripts/check_use_effect_sync.py` (regex on `frontend/src/**/*.{ts,tsx}`) wired into `mise run lint:py`. Three call sites refactored to outer/inner + lazy-`useState` (the OPEN_THINGS entry undercounted at two; `room-availability-grid.tsx` shared the same shape). Side-effect win: background refetch no longer wipes in-progress edits. Three new Vitest specs lock the property in. Follow-up (not sprint): widen the matcher to multi-statement effect bodies if a future violation slips in with two `setX` calls.
```

### Step 3: Run lint + tests one more time as a sanity check

Run: `cd /home/pascal/Code/Klassenzeit && mise run lint && mise run test`

Expected: both clean.

### Step 4: Commit

```bash
cd /home/pascal/Code/Klassenzeit
git add frontend/CLAUDE.md docs/superpowers/OPEN_THINGS.md
git commit -m "docs(frontend): note useEffect derived-state lint enforcement"
```

Commit body: "Updates frontend/CLAUDE.md to point at scripts/check_use_effect_sync.py as the enforcement mechanism. Marks tidy-phase item 4 shipped in OPEN_THINGS.md and notes the multi-statement narrowing as a follow-up."

---

## Self-review

**Spec coverage:** Each section of `docs/superpowers/specs/2026-04-25-use-effect-sync-lint-design.md` maps to a task:

- Lint script section → Task 3 (steps 3-7).
- Lint pipeline wiring → Task 3 (step 8).
- Lint script tests → Task 3 (steps 1, 5).
- Editor refactor → Task 1 (steps 2, 4, 6).
- Refetch-preserves-edits tests → Task 2.
- Docs change → Task 4.

**Placeholder scan:** No "TBD", "TODO", or "implement later" in the plan. Every code block contains the actual code to write.

**Type consistency:**

- Task 1 introduces the `RoomDetail` and `TeacherDetail` prop types. Step 2's "if `RoomDetail` is not exported from `./hooks`, check the existing return type" instruction handles the case where the type needs to be added to `hooks.ts`.
- Tasks 1, 2, 3, 4 each commit independently and `mise run lint && mise run test` runs at the end of each.
- The `find_violations(source: str, file_path: str) -> list[Violation]` signature in Task 3 step 1 matches the implementation in step 3 and the negative tests in step 5.

**Sequencing safety:**

- Task 1 must finish before Task 3 step 7's "run the script against the frontend tree" check can pass; the plan order enforces this.
- Pre-commit's `mise run lint` is a hard gate at every commit; no commit lands with lint failing.
- Pre-push's `mise run test` is a hard gate at push time; no push lands with tests failing.

If a step turns out to be wrong (e.g. the regex misses a known violation, the QueryClient invalidation pattern needs different wiring), fix it inline and continue. Do not revert unless the structural commit (Task 1) breaks behavior the existing tests assert.
