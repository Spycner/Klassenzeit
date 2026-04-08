# Responsive / Mobile Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Klassenzeit frontend usable on phones (≥ 375px wide). Add a sidebar trigger via a mobile header bar, give the timetable a single-day mobile view, and convert the desktop tables on every settings tab + members + curriculum to mobile-friendly card lists.

**Architecture:** Purely additive — desktop (`md+`, ≥ 768px) is unchanged. Mobile changes are gated by Tailwind `md:` modifiers wherever possible. The single piece of JS branching is in the timetable page, which uses the existing `useIsMobile()` hook to switch to a single-day view.

**Tech Stack:** Next.js 15 / React 19, Tailwind CSS, shadcn/ui (Sidebar, Sheet, Tabs, Dialog, Table), `@dnd-kit/core`, Vitest + Testing Library, Bun.

**Spec:** `docs/superpowers/specs/2026-04-08-responsive-mobile-design.md`

---

## Conventions

- **Breakpoint:** Tailwind `md` (768px). "Mobile" = `< md`. Default-mobile, override at `md`.
- **Card list pattern (used for every reference-data table, members, curriculum):**
  - Wrap the existing `<Table>` in `<div className="hidden md:block">`.
  - Add a sibling `<div className="md:hidden space-y-2">` rendering one **card per row**: `<div className="rounded-md border bg-card p-3">` containing label/value pairs (`<div className="text-xs text-muted-foreground">{label}</div><div className="text-sm">{value}</div>`), and a footer `<div className="mt-3 flex flex-wrap gap-2">` with full-width-on-mobile action buttons.
  - Empty state: render once, gated to whichever view is visible (or render the same `<div className="py-8 text-center text-muted-foreground">{empty}</div>` inside both blocks — both is fine, only one will be visible at a time).
- **Form rows in dialogs:** any `grid grid-cols-2` becomes `grid grid-cols-1 md:grid-cols-2`. Don't touch grids that aren't 2-col.
- **Dialog content polish:** add `max-w-[95vw] max-h-[90vh] overflow-y-auto` to `<DialogContent>` only where missing. Don't churn dialogs already at `sm:max-w-...`.
- **Test runner:** `bun test` from `frontend/`. Vitest + Testing Library are wired via `frontend/vitest.config.ts`.
- **Commits:** small, scoped per task. Format: `feat(frontend): <task>` for additions; `refactor(frontend): <task>` for restructures.

---

## File Structure

**Files modified:**

- `frontend/src/app/[locale]/schools/[id]/layout.tsx` — mobile header bar with `SidebarTrigger`
- `frontend/src/components/timetable/timetable-grid.tsx` — `visibleDays` prop
- `frontend/src/components/timetable/view-mode-selector.tsx` — extend `PersistedView` with `mobileDay`, export helpers, mobile width tweaks
- `frontend/src/app/[locale]/schools/[id]/timetable/page.tsx` — mobile day-tabs, header reflow, mobile editable=false, day-aware violation pivot
- `frontend/src/components/timetable/violations-panel.tsx` — `break-words` polish
- `frontend/src/app/[locale]/schools/[id]/settings/page.tsx` — `TabsList` overflow + form grid touch-up note
- `frontend/src/app/[locale]/schools/[id]/settings/components/rooms-tab.tsx`
- `frontend/src/app/[locale]/schools/[id]/settings/components/teachers-tab.tsx`
- `frontend/src/app/[locale]/schools/[id]/settings/components/subjects-tab.tsx`
- `frontend/src/app/[locale]/schools/[id]/settings/components/classes-tab.tsx`
- `frontend/src/app/[locale]/schools/[id]/settings/components/terms-tab.tsx`
- `frontend/src/app/[locale]/schools/[id]/settings/components/timeslots-tab.tsx`
- `frontend/src/app/[locale]/schools/[id]/members/page.tsx`
- `frontend/src/app/[locale]/schools/[id]/curriculum/page.tsx`
- Dialog audit: `lesson-edit-dialog.tsx`, `room-suitability-dialog.tsx`, `teacher-availability-dialog.tsx`, `import-export-tab.tsx` (its `<ImportPreviewDialog>`), and the inline `<Dialog>`s inside the six reference-data tabs.

**Files created:**

- `frontend/src/components/layout/mobile-header.tsx` — small client component, hosts the `SidebarTrigger` and a route-derived title
- `frontend/src/__tests__/timetable-grid-visible-days.test.tsx` — new test file (keeps existing test file untouched)
- `frontend/src/__tests__/mobile-header.test.tsx` — new test file

---

## Task 1: TimetableGrid `visibleDays` prop

**Files:**
- Modify: `frontend/src/components/timetable/timetable-grid.tsx`
- Create: `frontend/src/__tests__/timetable-grid-visible-days.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/__tests__/timetable-grid-visible-days.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TimetableGrid } from "@/components/timetable/timetable-grid";
import type {
  RoomResponse,
  SchoolClassResponse,
  SubjectResponse,
  TeacherResponse,
  TimeSlotResponse,
  TimetableLesson,
} from "@/lib/types";

const subjects: SubjectResponse[] = [
  { id: "sub-1", name: "Math", abbreviation: "M", color: "#ff0000", needs_special_room: false },
  { id: "sub-2", name: "English", abbreviation: "E", color: "#00ff00", needs_special_room: false },
];
const teachers: TeacherResponse[] = [
  { id: "tch-1", first_name: "A", last_name: "B", email: null, abbreviation: "AB", max_hours_per_week: 28, is_part_time: false, is_active: true },
];
const classes: SchoolClassResponse[] = [
  { id: "cls-1", name: "5a", grade_level: 5, student_count: 20, class_teacher_id: null, is_active: true },
];
const rooms: RoomResponse[] = [
  { id: "rm-1", name: "R101", building: null, capacity: 30, max_concurrent: 1, is_active: true },
];
const timeslots: TimeSlotResponse[] = [
  { id: "ts-mon", day_of_week: 0, period: 1, start_time: "08:00:00", end_time: "08:45:00", is_break: false, label: null },
  { id: "ts-wed", day_of_week: 2, period: 1, start_time: "08:00:00", end_time: "08:45:00", is_break: false, label: null },
];
const lessons: TimetableLesson[] = [
  { class_id: "cls-1", teacher_id: "tch-1", subject_id: "sub-1", room_id: "rm-1", timeslot_id: "ts-mon" },
  { class_id: "cls-1", teacher_id: "tch-1", subject_id: "sub-2", room_id: "rm-1", timeslot_id: "ts-wed" },
];

const baseProps = {
  lessons,
  timeslots,
  subjects,
  teachers,
  rooms,
  classes,
  locale: "en",
  viewMode: "class" as const,
  selectedEntityId: "cls-1",
};

describe("TimetableGrid visibleDays", () => {
  it("renders only the specified day columns", () => {
    render(<TimetableGrid {...baseProps} visibleDays={[2]} />);
    // Wed should be present
    expect(screen.getByText("Wed")).toBeInTheDocument();
    // Mon should not
    expect(screen.queryByText("Mon")).not.toBeInTheDocument();
    // The English (Wed) lesson should be visible, Math (Mon) hidden
    expect(screen.getByText("E")).toBeInTheDocument();
    expect(screen.queryByText("M")).not.toBeInTheDocument();
  });

  it("renders all five days when visibleDays is omitted", () => {
    render(<TimetableGrid {...baseProps} />);
    expect(screen.getByText("Mon")).toBeInTheDocument();
    expect(screen.getByText("Tue")).toBeInTheDocument();
    expect(screen.getByText("Wed")).toBeInTheDocument();
    expect(screen.getByText("Thu")).toBeInTheDocument();
    expect(screen.getByText("Fri")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && bun test src/__tests__/timetable-grid-visible-days.test.tsx
```

Expected: FAIL — `visibleDays` prop is not yet recognized; the test that filters days will see Mon header.

- [ ] **Step 3: Add `visibleDays` to the grid**

In `frontend/src/components/timetable/timetable-grid.tsx`, add to the `TimetableGridProps` interface:

```ts
visibleDays?: number[];
```

In the function signature add `visibleDays`:

```ts
export function TimetableGrid({
  lessons,
  viewMode,
  selectedEntityId,
  timeslots,
  subjects,
  teachers,
  rooms,
  classes,
  locale,
  highlightedCells,
  highlightTone = "error",
  editable = false,
  visibleDays,
  onLessonMove,
  onLessonSwap,
  onLessonEdit,
}: TimetableGridProps) {
```

Compute the active day list near the top of the function (after the existing maps):

```ts
const activeDays = visibleDays ?? [0, 1, 2, 3, 4];
```

Replace the `<th>` day-header loop:

```tsx
{activeDays.map((day) => (
  <th key={`day-${day}`} className="p-2 text-center font-medium">
    {dayLabels[day]}
  </th>
))}
```

Replace the inner `[0, 1, 2, 3, 4].map((day) => {` with:

```tsx
{activeDays.map((day) => {
```

- [ ] **Step 4: Run tests**

```bash
cd frontend && bun test src/__tests__/timetable-grid-visible-days.test.tsx src/__tests__/timetable-grid.test.tsx
```

Expected: both files PASS. The original `timetable-grid.test.tsx` is a regression guard.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/timetable/timetable-grid.tsx frontend/src/__tests__/timetable-grid-visible-days.test.tsx
git commit -m "feat(frontend): TimetableGrid visibleDays prop for single-day mobile view"
```

---

## Task 2: Extend persisted view shape with `mobileDay`

**Files:**
- Modify: `frontend/src/components/timetable/view-mode-selector.tsx`

- [ ] **Step 1: Extend the `PersistedView` type and loader**

Replace the `PersistedView` interface and `loadPersistedView` function:

```ts
interface PersistedView {
  viewMode: TimetableViewMode;
  selectedEntityId: string | null;
  mobileDay?: number;
}

export function loadPersistedView(schoolId: string): PersistedView | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(schoolId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedView;
    if (
      parsed &&
      ["class", "teacher", "room"].includes(parsed.viewMode) &&
      (typeof parsed.selectedEntityId === "string" ||
        parsed.selectedEntityId === null)
    ) {
      // mobileDay is optional and validated lazily by the consumer
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function persistMobileDay(schoolId: string, day: number) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(storageKey(schoolId));
    const prev = raw ? (JSON.parse(raw) as PersistedView) : null;
    const next: PersistedView = {
      viewMode: prev?.viewMode ?? "class",
      selectedEntityId: prev?.selectedEntityId ?? null,
      mobileDay: day,
    };
    localStorage.setItem(storageKey(schoolId), JSON.stringify(next));
  } catch {
    // ignore
  }
}
```

The existing `useEffect` that persists `viewMode + selectedEntityId` already overwrites the storage entry. Update it to preserve `mobileDay`:

```ts
useEffect(() => {
  if (typeof window === "undefined") return;
  let mobileDay: number | undefined;
  try {
    const raw = localStorage.getItem(storageKey(schoolId));
    if (raw) {
      const prev = JSON.parse(raw) as PersistedView;
      mobileDay = prev.mobileDay;
    }
  } catch {}
  localStorage.setItem(
    storageKey(schoolId),
    JSON.stringify({ viewMode, selectedEntityId, mobileDay }),
  );
}, [schoolId, viewMode, selectedEntityId]);
```

Apply the same preserve-`mobileDay` logic to the inline `persist()` helper:

```ts
function persist(next: { viewMode: TimetableViewMode; selectedEntityId: string | null }) {
  if (typeof window === "undefined") return;
  let mobileDay: number | undefined;
  try {
    const raw = localStorage.getItem(storageKey(schoolId));
    if (raw) {
      const prev = JSON.parse(raw) as PersistedView;
      mobileDay = prev.mobileDay;
    }
  } catch {}
  localStorage.setItem(storageKey(schoolId), JSON.stringify({ ...next, mobileDay }));
}
```

Also widen the trigger and entity selector for mobile:

Change the wrapper:
```tsx
<div className="flex flex-wrap items-center gap-3">
```
to:
```tsx
<div className="flex w-full flex-wrap items-center gap-3">
```

Change the `<SelectTrigger>`:
```tsx
<SelectTrigger className="w-56">
```
to:
```tsx
<SelectTrigger className="w-full md:w-56">
```

- [ ] **Step 2: Typecheck**

```bash
cd frontend && bun run typecheck
```

Expected: PASS (no type errors).

- [ ] **Step 3: Run existing tests**

```bash
cd frontend && bun test
```

Expected: all PASS (no behavior change to consumers).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/timetable/view-mode-selector.tsx
git commit -m "feat(frontend): persist mobile day in view-mode storage"
```

---

## Task 3: Wire mobile day-tabs into the timetable page

**Files:**
- Modify: `frontend/src/app/[locale]/schools/[id]/timetable/page.tsx`

- [ ] **Step 1: Add imports and the `useIsMobile` hook**

At the top of `frontend/src/app/[locale]/schools/[id]/timetable/page.tsx` add:

```ts
import { useIsMobile } from "@/hooks/use-mobile";
import {
  loadPersistedView,
  persistMobileDay,
  ViewModeSelector,
} from "@/components/timetable/view-mode-selector";
```

(Replace the existing single import of `loadPersistedView, ViewModeSelector` with the three-name version.)

Inside `TimetablePage()` add (after the existing `const isAdmin = ...` line):

```ts
const isMobile = useIsMobile();

const initialMobileDay = (() => {
  const today = new Date().getDay(); // 0 Sun .. 6 Sat
  const mapped = today === 0 || today === 6 ? 0 : today - 1;
  return mapped;
})();
const [mobileDay, setMobileDay] = useState<number>(initialMobileDay);
```

In the existing `useEffect` that calls `loadPersistedView`, after setting view mode/selected entity, add:

```ts
if (
  persisted &&
  typeof persisted.mobileDay === "number" &&
  persisted.mobileDay >= 0 &&
  persisted.mobileDay <= 4
) {
  setMobileDay(persisted.mobileDay);
}
```

- [ ] **Step 2: Render the mobile day-tab strip**

Replace the `<div className="printable-timetable">` block with:

```tsx
<div className="printable-timetable">
  {lessons.length === 0 ? (
    <div className="flex flex-1 items-center justify-center">
      <p className="text-muted-foreground">{t("noTimetable")}</p>
    </div>
  ) : (
    <>
      {isMobile && (
        <div className="mb-3 grid grid-cols-5 gap-1 rounded-md border p-1">
          {(locale === "de"
            ? ["Mo", "Di", "Mi", "Do", "Fr"]
            : ["Mon", "Tue", "Wed", "Thu", "Fri"]
          ).map((label, idx) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                setMobileDay(idx);
                persistMobileDay(schoolId, idx);
              }}
              className={`rounded px-2 py-1.5 text-sm font-medium transition-colors ${
                mobileDay === idx
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
              aria-pressed={mobileDay === idx}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <TimetableGrid
        lessons={lessons}
        viewMode={viewMode}
        selectedEntityId={selectedEntityId}
        timeslots={timeslots}
        subjects={subjects}
        teachers={teachers}
        rooms={rooms}
        classes={classes}
        locale={locale}
        highlightedCells={highlightedCells}
        highlightTone={
          highlighted?.v.severity === "soft" ? "warn" : "error"
        }
        editable={isAdmin && !isMobile}
        visibleDays={isMobile ? [mobileDay] : undefined}
        onLessonMove={handleMove}
        onLessonSwap={handleSwap}
        onLessonEdit={handleEdit}
      />
    </>
  )}
</div>
```

The two key additions: `editable={isAdmin && !isMobile}` (mobile is read-only) and `visibleDays={isMobile ? [mobileDay] : undefined}`.

- [ ] **Step 3: Update violation pivot to also switch the active day**

Inside the existing `onHighlight={(v) => { ... }}` of `<ViolationsPanel>`, after the `setHighlighted({ v, id })` call, add:

```ts
const ts = timeslots.find((t) => t.id === ref?.timeslot_id);
if (ts && typeof ts.day_of_week === "number") {
  setMobileDay(ts.day_of_week);
  persistMobileDay(schoolId, ts.day_of_week);
}
```

Place that block right after `const ref = v.lesson_refs[0];`. (`ref` is already declared in scope; reuse it.)

- [ ] **Step 4: Reflow page header for mobile**

Update the header `<div>`:

```tsx
<div className="flex flex-wrap items-center justify-between gap-3">
  <div>
    <h1 className="text-2xl font-bold">{t("title")}</h1>
    <p className="hidden text-sm text-muted-foreground md:block">{t("description")}</p>
  </div>
  <div className="flex w-full flex-wrap items-center gap-3 md:w-auto">
    {isAdmin && (
      <UndoToolbar canUndo={undoStack.length > 0} onUndo={handleUndo} />
    )}
    {terms.length > 0 && selectedTermId && (
      <Select
        value={selectedTermId}
        onValueChange={(val) => setSelectedTermId(val)}
      >
        <SelectTrigger className="w-full md:w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {terms.map((term) => (
            <SelectItem key={term.id} value={term.id}>
              {term.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )}
    <Button
      variant="outline"
      size="sm"
      className="hidden md:inline-flex"
      onClick={() => window.print()}
    >
      <Printer className="mr-2 h-4 w-4" />
      {t("print")}
    </Button>
  </div>
</div>
```

- [ ] **Step 5: Typecheck and run tests**

```bash
cd frontend && bun run typecheck && bun test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/[locale]/schools/[id]/timetable/page.tsx
git commit -m "feat(frontend): single-day mobile view and reflowed header for timetable page"
```

---

## Task 4: Mobile header bar with `SidebarTrigger`

**Files:**
- Create: `frontend/src/components/layout/mobile-header.tsx`
- Create: `frontend/src/__tests__/mobile-header.test.tsx`
- Modify: `frontend/src/app/[locale]/schools/[id]/layout.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/__tests__/mobile-header.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import { MobileHeader } from "@/components/layout/mobile-header";
import { SidebarProvider } from "@/components/ui/sidebar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/schools/abc/timetable",
}));

const messages = {
  school: {
    dashboard: "Dashboard",
    members: "Members",
  },
  curriculum: { title: "Curriculum" },
  scheduler: { title: "Scheduler" },
  timetable: { title: "Timetable" },
  settings: { title: "Settings" },
};

function wrap(node: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <SidebarProvider>{node}</SidebarProvider>
    </NextIntlClientProvider>
  );
}

describe("MobileHeader", () => {
  it("renders the route title and sidebar trigger", () => {
    render(wrap(<MobileHeader />));
    expect(screen.getByText("Timetable")).toBeInTheDocument();
    // SidebarTrigger renders a button with label "Toggle Sidebar"
    expect(screen.getByRole("button", { name: /sidebar/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && bun test src/__tests__/mobile-header.test.tsx
```

Expected: FAIL — `MobileHeader` does not exist.

- [ ] **Step 3: Create the component**

Create `frontend/src/components/layout/mobile-header.tsx`:

```tsx
"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { SidebarTrigger } from "@/components/ui/sidebar";

export function MobileHeader() {
  const pathname = usePathname();
  const tSchool = useTranslations("school");
  const tCurriculum = useTranslations("curriculum");
  const tScheduler = useTranslations("scheduler");
  const tTimetable = useTranslations("timetable");
  const tSettings = useTranslations("settings");

  // Last meaningful path segment determines the title
  const segments = pathname.split("/").filter(Boolean);
  const last = segments[segments.length - 1];

  let title = "";
  switch (last) {
    case "members":
      title = tSchool("members");
      break;
    case "curriculum":
      title = tCurriculum("title");
      break;
    case "schedule":
      title = tScheduler("title");
      break;
    case "timetable":
      title = tTimetable("title");
      break;
    case "settings":
      title = tSettings("title");
      break;
    default:
      title = tSchool("dashboard");
  }

  return (
    <header className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b bg-background px-3 md:hidden">
      <SidebarTrigger />
      <span className="text-sm font-medium">{title}</span>
    </header>
  );
}
```

- [ ] **Step 4: Mount it in the school layout**

In `frontend/src/app/[locale]/schools/[id]/layout.tsx`, add the import:

```ts
import { MobileHeader } from "@/components/layout/mobile-header";
```

Replace `<SidebarInset>{children}</SidebarInset>` with:

```tsx
<SidebarInset>
  <MobileHeader />
  {children}
</SidebarInset>
```

- [ ] **Step 5: Run tests**

```bash
cd frontend && bun test src/__tests__/mobile-header.test.tsx && bun run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/layout/mobile-header.tsx frontend/src/__tests__/mobile-header.test.tsx frontend/src/app/[locale]/schools/[id]/layout.tsx
git commit -m "feat(frontend): mobile header bar with sidebar trigger"
```

---

## Task 5: Settings page — `TabsList` overflow + form helpers

**Files:**
- Modify: `frontend/src/app/[locale]/schools/[id]/settings/page.tsx`

- [ ] **Step 1: Allow horizontal scroll on the tab strip**

Replace the tab-strip wrapper:

```tsx
<div className="flex gap-1 border-b">
```

with:

```tsx
<div className="-mx-6 flex gap-1 overflow-x-auto border-b px-6 md:mx-0 md:px-0">
```

(Negative-margin pattern lets the scroller bleed past the page padding so users can swipe past edges on mobile while remaining flush on desktop.)

Also tighten the per-tab button so it doesn't shrink:

```tsx
className={`flex-shrink-0 px-4 py-2 text-sm font-medium transition-colors ${
```

- [ ] **Step 2: Tighten outer padding on mobile**

Replace the outer wrapper:

```tsx
<div className="flex flex-1 flex-col gap-6 p-6">
```

with:

```tsx
<div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
```

- [ ] **Step 3: Typecheck**

```bash
cd frontend && bun run typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/[locale]/schools/[id]/settings/page.tsx
git commit -m "feat(frontend): mobile-friendly settings tab strip and padding"
```

---

## Task 6: Rooms tab — table → mobile cards

**Files:**
- Modify: `frontend/src/app/[locale]/schools/[id]/settings/components/rooms-tab.tsx`

- [ ] **Step 1: Wrap the existing `<Table>` for desktop only**

Find the `<Table>...</Table>` block (around lines 219–288). Wrap it:

```tsx
<div className="hidden md:block">
  <Table>
    {/* unchanged */}
  </Table>
</div>
```

- [ ] **Step 2: Add the mobile card list as a sibling**

Immediately after the closing `</div>` of the desktop wrapper, add:

```tsx
<div className="space-y-2 md:hidden">
  {items.map((item) => (
    <div
      key={`card-${item.id}`}
      ref={(el) => {
        if (el) rowRefs.current.set(item.id, el);
      }}
      className="rounded-md border bg-card p-3"
    >
      <div className="font-medium">{item.name}</div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
        <div>
          <div className="text-xs text-muted-foreground">{t("building")}</div>
          <div>{item.building ?? "\u2014"}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{t("capacity")}</div>
          <div>{item.capacity ?? "\u2014"}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{t("maxConcurrent")}</div>
          <div>{item.max_concurrent}</div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => setSuitabilityRoom(item)}
        >
          <BookOpen className="mr-2 h-4 w-4" />
          {tSuitability("button_label")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => openEditDialog(item)}
        >
          <Pencil className="mr-2 h-4 w-4" />
          {ta("edit")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1 text-destructive hover:text-destructive"
          onClick={() => {
            setItemToDelete(item);
            setDeleteDialogOpen(true);
          }}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          {ta("delete")}
        </Button>
      </div>
    </div>
  ))}
  {items.length === 0 && (
    <div className="rounded-md border bg-card py-8 text-center text-muted-foreground">
      {t("empty")}
    </div>
  )}
</div>
```

If `ta("edit")` or `ta("delete")` keys don't exist, fall back to inline literals (`"Edit"` / `"Delete"`) — first verify by checking `frontend/messages/en.json` for `settings.actions.edit` / `settings.actions.delete`. The component already imports `ta` from `useTranslations("settings.actions")`. If keys are missing, use the existing keys from `t` or `tc` instead.

- [ ] **Step 3: Make the dialog form responsive**

In the Add/Edit dialog content (around line 307), change `grid grid-cols-2 gap-4` to `grid grid-cols-1 gap-4 md:grid-cols-2`.

- [ ] **Step 4: Polish dialog widths**

Change `<DialogContent>` (the big edit dialog around line 291) to:

```tsx
<DialogContent className="max-h-[90vh] max-w-[95vw] overflow-y-auto sm:max-w-lg">
```

Apply the same to the delete-confirm `<DialogContent>` (around line 369).

- [ ] **Step 5: Typecheck and run tests**

```bash
cd frontend && bun run typecheck && bun test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/[locale]/schools/[id]/settings/components/rooms-tab.tsx
git commit -m "feat(frontend): mobile card list for rooms tab"
```

---

## Task 7: Teachers tab — table → mobile cards

**Files:**
- Modify: `frontend/src/app/[locale]/schools/[id]/settings/components/teachers-tab.tsx`

- [ ] **Step 1: Read the file to identify the columns**

```bash
cat "frontend/src/app/[locale]/schools/[id]/settings/components/teachers-tab.tsx" | head -50
```

Note the existing `<TableHead>` columns and the action buttons inside `<TableRow>`. Typical fields: name, abbreviation, max hours, active flag; actions: availability, edit, delete.

- [ ] **Step 2: Wrap the existing `<Table>` block in `<div className="hidden md:block">`.**

Same pattern as Task 6 Step 1.

- [ ] **Step 3: Add the mobile card list sibling**

```tsx
<div className="space-y-2 md:hidden">
  {items.map((item) => (
    <div key={`card-${item.id}`} className="rounded-md border bg-card p-3">
      <div className="font-medium">
        {item.first_name} {item.last_name}
        {item.abbreviation ? (
          <span className="ml-2 text-xs text-muted-foreground">({item.abbreviation})</span>
        ) : null}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
        <div>
          <div className="text-xs text-muted-foreground">{t("maxHoursPerWeek")}</div>
          <div>{item.max_hours_per_week}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{t("partTime")}</div>
          <div>{item.is_part_time ? tc("yes") : tc("no")}</div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {/* Reuse the same action handlers as the desktop row.
            Substitute the actual button labels and onClicks from the
            desktop block (availability, edit, delete). */}
      </div>
    </div>
  ))}
  {items.length === 0 && (
    <div className="rounded-md border bg-card py-8 text-center text-muted-foreground">
      {t("empty")}
    </div>
  )}
</div>
```

When filling the action buttons, copy the `onClick` handlers verbatim from the desktop row's icon buttons. Each becomes a `flex-1` outline button with leading icon and label. If a translation key for the label doesn't exist, use the same label that the desktop tooltip/aria-label uses.

If `tc("yes")` / `tc("no")` keys are missing from `frontend/messages/en.json`, substitute hardcoded `"Yes"` / `"Ja"` via a small ternary on `locale`, or keep `Boolean.toString()`. Don't add new translation keys in this task.

- [ ] **Step 4: Make the edit dialog form responsive**

Change any `grid-cols-2` on form rows in the edit dialog to `grid-cols-1 md:grid-cols-2`.

- [ ] **Step 5: Polish dialog widths**

Add `max-h-[90vh] max-w-[95vw] overflow-y-auto` to each `<DialogContent>` className that doesn't already have viewport-aware sizing.

- [ ] **Step 6: Typecheck and run tests**

```bash
cd frontend && bun run typecheck && bun test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/[locale]/schools/[id]/settings/components/teachers-tab.tsx
git commit -m "feat(frontend): mobile card list for teachers tab"
```

---

## Task 8: Subjects tab — table → mobile cards

**Files:**
- Modify: `frontend/src/app/[locale]/schools/[id]/settings/components/subjects-tab.tsx`

Follow the pattern from Task 6 (Rooms). Adapt to subject fields. Read the file first to identify columns and actions, then:

- [ ] **Step 1: Wrap existing `<Table>` in `<div className="hidden md:block">`.**

- [ ] **Step 2: Add `<div className="space-y-2 md:hidden">` sibling rendering one card per `item`** with: name (font-medium), abbreviation (small label), and any additional columns the desktop table shows (color swatch, "needs special room" badge, etc.). Action button row uses `flex flex-wrap gap-2`, each button `flex-1 variant="outline" size="sm"` with the icon + label, copying handlers from the desktop row.

- [ ] **Step 3: Convert any `grid-cols-2` form rows in the edit dialog to `grid-cols-1 md:grid-cols-2`.**

- [ ] **Step 4: Add `max-h-[90vh] max-w-[95vw] overflow-y-auto` to `<DialogContent>` (preserving any existing `sm:max-w-...`).**

- [ ] **Step 5: Typecheck**

```bash
cd frontend && bun run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/[locale]/schools/[id]/settings/components/subjects-tab.tsx
git commit -m "feat(frontend): mobile card list for subjects tab"
```

---

## Task 9: Classes tab — table → mobile cards

**Files:**
- Modify: `frontend/src/app/[locale]/schools/[id]/settings/components/classes-tab.tsx`

Follow the pattern from Task 6. Adapt to class fields (name, grade level, student count, class teacher, active flag).

- [ ] **Step 1: Read the file** to identify columns and action buttons.

- [ ] **Step 2: Wrap existing `<Table>` in `<div className="hidden md:block">`.**

- [ ] **Step 3: Add `<div className="space-y-2 md:hidden">` sibling** with one card per class, matching the desktop columns as label/value pairs and reusing the action handlers from the desktop row.

- [ ] **Step 4: Convert any `grid-cols-2` form rows in the edit dialog to `grid-cols-1 md:grid-cols-2`.**

- [ ] **Step 5: Polish `<DialogContent>` width as in Task 6 Step 4.**

- [ ] **Step 6: Typecheck**

```bash
cd frontend && bun run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/[locale]/schools/[id]/settings/components/classes-tab.tsx
git commit -m "feat(frontend): mobile card list for classes tab"
```

---

## Task 10: Terms tab — table → mobile cards

**Files:**
- Modify: `frontend/src/app/[locale]/schools/[id]/settings/components/terms-tab.tsx`

Follow Task 6 pattern. Term fields: name, start date, end date, is_current. Mark the current term with a small badge in the card header.

- [ ] **Step 1: Read the file** to confirm columns.

- [ ] **Step 2: Wrap existing `<Table>` in `<div className="hidden md:block">`.**

- [ ] **Step 3: Add the mobile card list sibling.** Card header shows term name + a small `bg-primary text-primary-foreground rounded px-1.5 py-0.5 text-xs` badge if `is_current`. Body shows start/end dates as label/value pairs. Footer has Edit / Delete / Set Current buttons matching the desktop row handlers.

- [ ] **Step 4: Convert form `grid-cols-2` to `grid-cols-1 md:grid-cols-2` in the edit dialog.**

- [ ] **Step 5: Polish `<DialogContent>` widths.**

- [ ] **Step 6: Typecheck**

```bash
cd frontend && bun run typecheck
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/[locale]/schools/[id]/settings/components/terms-tab.tsx
git commit -m "feat(frontend): mobile card list for terms tab"
```

---

## Task 11: Timeslots tab — table → mobile cards

**Files:**
- Modify: `frontend/src/app/[locale]/schools/[id]/settings/components/timeslots-tab.tsx`

Timeslots are denser (5 days × N periods). On mobile, group cards by day or render a flat list — flat is simpler and matches the existing table.

- [ ] **Step 1: Read the file** to confirm columns (day, period, start/end time, is_break, label).

- [ ] **Step 2: Wrap existing `<Table>` in `<div className="hidden md:block">`.**

- [ ] **Step 3: Add the mobile card list sibling.** Each card header: day label + " · Period " + period number (or "Break" badge if `is_break`). Body: start/end time as a single inline string `08:00 – 08:45`, optional `label` line. Footer: Edit / Delete buttons reusing desktop handlers. Use `DAY_LABELS_DE / DAY_LABELS_EN` constants — if not exported from elsewhere, inline them at the top of the file.

- [ ] **Step 4: Convert form `grid-cols-2` to `grid-cols-1 md:grid-cols-2`.**

- [ ] **Step 5: Polish `<DialogContent>` widths.**

- [ ] **Step 6: Typecheck**

```bash
cd frontend && bun run typecheck
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/[locale]/schools/[id]/settings/components/timeslots-tab.tsx
git commit -m "feat(frontend): mobile card list for timeslots tab"
```

---

## Task 12: Members page — table → mobile cards

**Files:**
- Modify: `frontend/src/app/[locale]/schools/[id]/members/page.tsx`

- [ ] **Step 1: Read the file** to confirm columns (likely: name, email, role, joined date, actions like change role / remove).

- [ ] **Step 2: Tighten outer padding** — change any `p-6` outer wrapper to `p-4 md:p-6`.

- [ ] **Step 3: Make the invite form stack on mobile** — change any `flex` row containing the invite inputs to `flex-col gap-2 md:flex-row md:items-end md:gap-3`. Inputs become `w-full md:w-auto`.

- [ ] **Step 4: Wrap existing `<Table>` in `<div className="hidden md:block">`.**

- [ ] **Step 5: Add the mobile card list sibling** with one card per member: name (font-medium), email (small muted), role (badge), and footer with the same action buttons as desktop (each `flex-1 variant="outline" size="sm"`).

- [ ] **Step 6: Polish any `<DialogContent>` widths.**

- [ ] **Step 7: Typecheck and run tests**

```bash
cd frontend && bun run typecheck && bun test
```

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app/[locale]/schools/[id]/members/page.tsx
git commit -m "feat(frontend): mobile card list for members page"
```

---

## Task 13: Curriculum page — table → mobile cards

**Files:**
- Modify: `frontend/src/app/[locale]/schools/[id]/curriculum/page.tsx`

The curriculum is a flat list of (class, subject, teacher, hours per week) entries. Apply the same pattern.

- [ ] **Step 1: Tighten outer padding** — `p-6` → `p-4 md:p-6`.

- [ ] **Step 2: Make the term/class/filter row stack on mobile** — outer `flex` becomes `flex flex-col gap-3 md:flex-row md:items-center`. Any `<SelectTrigger>` inside becomes `w-full md:w-48` (or whatever existing width).

- [ ] **Step 3: Wrap existing `<Table>` (around lines 230–290) in `<div className="hidden md:block">`.**

- [ ] **Step 4: Add the mobile card list sibling.**

```tsx
<div className="space-y-2 md:hidden">
  {entries.map((entry) => {
    // Look up display values the same way the desktop cells do — copy
    // the existing class/subject/teacher name lookups verbatim.
    const className = classes.find((c) => c.id === entry.class_id)?.name ?? "";
    const subjectName = subjects.find((s) => s.id === entry.subject_id)?.name ?? "";
    const teacherName = entry.teacher_id
      ? (() => {
          const tch = teachers.find((tt) => tt.id === entry.teacher_id);
          return tch ? `${tch.first_name} ${tch.last_name}` : "";
        })()
      : t("autoAssign");
    return (
      <div key={`card-${entry.id}`} className="rounded-md border bg-card p-3">
        <div className="font-medium">
          {className} · {subjectName}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">{t("teacher")}</div>
            <div>{teacherName}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">{t("hoursPerWeek")}</div>
            <div>{entry.hours_per_week}</div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {/* Copy the action button(s) from the desktop row — typically a delete icon button.
              Make it a full Button with `flex-1 variant="outline" size="sm"`. */}
        </div>
      </div>
    );
  })}
  {entries.length === 0 && (
    <div className="rounded-md border bg-card py-8 text-center text-muted-foreground">
      {t("empty")}
    </div>
  )}
</div>
```

Adjust the lookup expressions to match the actual property names used in the desktop `<TableRow>` block — read that block first.

- [ ] **Step 5: Make the Add Entry dialog form rows responsive** — `grid-cols-2` → `grid-cols-1 md:grid-cols-2`.

- [ ] **Step 6: Polish `<DialogContent>` widths.**

- [ ] **Step 7: Typecheck and run tests**

```bash
cd frontend && bun run typecheck && bun test
```

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app/[locale]/schools/[id]/curriculum/page.tsx
git commit -m "feat(frontend): mobile card list for curriculum page"
```

---

## Task 14: Dialog audit + violations panel polish

**Files:**
- Modify: `frontend/src/components/timetable/lesson-edit-dialog.tsx`
- Modify: `frontend/src/components/timetable/violations-panel.tsx`
- Modify: `frontend/src/app/[locale]/schools/[id]/settings/components/room-suitability-dialog.tsx`
- Modify: `frontend/src/app/[locale]/schools/[id]/settings/components/teacher-availability-dialog.tsx`
- Modify: `frontend/src/components/import-preview-dialog.tsx` (or wherever `<ImportPreviewDialog>` lives — confirm path with `Glob`)

- [ ] **Step 1: Audit each `<DialogContent>`**

For each file above, read the file. If `<DialogContent>` does **not** have `max-w-[95vw]` and `max-h-[90vh] overflow-y-auto`, add them, preserving any existing `sm:max-w-...`. Example:

```tsx
<DialogContent className="max-h-[90vh] max-w-[95vw] overflow-y-auto sm:max-w-2xl">
```

If the dialog already has both, skip it.

- [ ] **Step 2: Violations panel — wrap long resource names**

In `frontend/src/components/timetable/violations-panel.tsx`, find any `<span>` or `<div>` rendering a teacher/room/class name (typically inside a list item). Add `break-words` to its className. If they already wrap, leave them.

- [ ] **Step 3: Typecheck and run tests**

```bash
cd frontend && bun run typecheck && bun test
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/timetable/lesson-edit-dialog.tsx frontend/src/components/timetable/violations-panel.tsx frontend/src/app/[locale]/schools/[id]/settings/components/room-suitability-dialog.tsx frontend/src/app/[locale]/schools/[id]/settings/components/teacher-availability-dialog.tsx
# add the import-preview-dialog path here too
git commit -m "feat(frontend): viewport-aware dialog widths and violation text wrapping"
```

---

## Task 15: Final verification + roadmap update

**Files:**
- Modify: `docs/superpowers/next-steps.md`
- Modify: `docs/STATUS.md`

- [ ] **Step 1: Run the full check suite**

```bash
just check && cd frontend && bun test
```

Expected: PASS for lint, format, typecheck, and tests. If anything fails, fix the underlying issue rather than skipping.

- [ ] **Step 2: Manual visual smoke test**

```bash
just dev
```

Open `http://localhost:3000` in Chrome, toggle device toolbar (Cmd-Shift-M), set viewport to **iPhone SE (375×667)**. Walk through:

1. Login → school list → enter a school → confirm the mobile header bar is visible and the hamburger opens the sidebar.
2. Navigate to **Timetable**: confirm the day-tab strip is visible, switching days works, the term selector is full-width, the print button is hidden, and the grid shows only the selected day with no horizontal scroll.
3. Navigate to **Curriculum**: confirm filters stack vertically and entries render as cards.
4. Navigate to **Members**: confirm cards render and action buttons are full-width.
5. Open **Settings**, swipe through every tab (terms, classes, subjects, teachers, rooms, timeslots, scheduler, importExport): confirm tab strip scrolls, each list view renders as cards, and Add/Edit dialogs fit the viewport.

For anything broken, file it as a follow-up task in `next-steps.md` rather than expanding this PR's scope.

- [ ] **Step 3: Update the roadmap**

In `docs/superpowers/next-steps.md`, mark item **2f** as done. Move it under "Done" under a "Tier 2 — UX polish" or similar section, matching the format of other completed entries. Add the spec/plan paths.

- [ ] **Step 4: Update `docs/STATUS.md`** with a one-line entry under the most recent section noting the responsive/mobile layout shipped.

- [ ] **Step 5: Commit docs**

```bash
git add docs/superpowers/next-steps.md docs/STATUS.md
git commit -m "docs: mark 2f (responsive/mobile layout) complete"
```

- [ ] **Step 6: Open a PR**

```bash
gh pr create --title "feat(frontend): responsive / mobile layout (2f)" --body "$(cat <<'EOF'
## Summary
- Mobile header bar with sidebar trigger so phone users can open the nav
- Single-day timetable view on mobile via new `visibleDays` prop, with day-tab strip and persistence
- Mobile card-list rendering for every reference-data tab, members, and curriculum
- Settings tab strip scrolls horizontally; dialog widths are viewport-aware

## Test plan
- [x] `just check` clean
- [x] `bun test` in `frontend/` clean
- [x] Manual walkthrough at 375×667 (iPhone SE) covering sidebar, timetable, curriculum, members, every settings tab
EOF
)"
```

---

## Self-Review

**Spec coverage check:**
- §1 Sidebar + mobile header bar → Task 4 ✓
- §2 Timetable page (header reflow, day tabs, single-day view, edit gating, pivot) → Tasks 1, 2, 3 ✓
- §3 Reference-data tables (rooms, teachers, subjects, classes, terms, timeslots) → Tasks 6, 7, 8, 9, 10, 11 ✓
- §4 Settings page (tab strip scroll, form grid) → Task 5 + per-tab dialog form grid in Tasks 6–11 ✓
- §5 Members page → Task 12 ✓
- §6 Curriculum page → Task 13 ✓
- §7 Dialog audit → Task 14 ✓
- §8 i18n: no new keys — confirmed in tasks (notes call out fallbacks) ✓
- §9 Testing: TimetableGrid `visibleDays` test (Task 1), MobileHeader test (Task 4), regression guards via existing tests (Task 1 Step 4) ✓
- §10 Out of scope items are not introduced ✓
- §11 Files touched list matches Tasks 1–14 ✓

**Placeholder scan:** None found. Tasks 7–13 reference "copy desktop handlers verbatim" rather than spelling out unknown handler signatures, but each task is preceded by a step that requires reading the file first to learn those handlers — that's bounded, not a TBD.

**Type consistency:** `visibleDays?: number[]` is consistent across Tasks 1 and 3. `mobileDay?: number` and `persistMobileDay` are consistent across Tasks 2 and 3.
