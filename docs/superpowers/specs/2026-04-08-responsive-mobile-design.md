# Responsive / Mobile Layout — Design Spec

**Roadmap item:** 2f (Tier 2 — UX polish)
**Date:** 2026-04-08
**Scope:** Full pass — sidebar, timetable, reference-data tables, settings, members, curriculum

## Goal

Make the Klassenzeit frontend usable on a phone (≥ 375px wide). Today the app is desktop-first: the sidebar can't be opened on mobile (no trigger is rendered), the timetable is a 5-day table that doesn't fit, and several pages render dense desktop tables. After this work, every page a real user touches should be navigable, readable, and editable on a phone.

This is purely additive — desktop layout (`md+`) does not change. Below `md` (768px) we adapt.

## Non-goals

- Touch drag-and-drop for the timetable (edits stay desktop-only)
- Rewriting the timetable grid as CSS grid
- Bottom nav bar (sidebar Sheet is sufficient)
- PWA / offline / install prompts
- New e2e tests (suite is empty by design for now)
- Landing/login page polish beyond a sanity check

## Breakpoint convention

Use Tailwind's existing `md` breakpoint (768px). "Mobile" means `< md`. No new breakpoint introduced. Where possible, use `md:` modifiers rather than the existing `useIsMobile` hook — the hook is reserved for places that need real JS branching (e.g. `<TimetableGrid>` filtering days).

## 1. Sidebar + mobile header bar

**Problem:** `<Sidebar>` from shadcn already supports mobile via a Sheet, but `SidebarTrigger` is never rendered, so phone users have no way to open the nav.

**Fix:** Add a sticky top bar inside `SidebarInset` in `frontend/src/app/[locale]/schools/[id]/layout.tsx`:

- `md:hidden` — only shown below `md`
- Sticky to top (`sticky top-0 z-30`), uses `bg-background border-b`
- Contains, left to right: `SidebarTrigger`, current page title (text-sm font-medium)
- Page title is derived per route via a small map keyed by the last path segment (`dashboard | members | curriculum | schedule | timetable | settings`). Falls back to the school name.
- No right-side actions in v1.

The existing in-content `<h1>` per page is preserved on mobile (visible duplication is acceptable — keeps each page self-contained for desktop and avoids coupling them to the layout).

`sidebar.tsx` itself is **not modified** — the Sheet behavior already works.

## 2. Timetable page

`frontend/src/app/[locale]/schools/[id]/timetable/page.tsx` and `frontend/src/components/timetable/timetable-grid.tsx`.

### 2.1 Page header reflow

Current: a `flex flex-wrap` row with title/description on the left and undo + term selector + print on the right. Reflow:

- Description (`<p>` under the title): `hidden md:block`
- Print button: `hidden md:inline-flex` (no useful target on mobile)
- Term selector: full-width on mobile (`w-full md:w-48`), drops to its own row via existing `flex-wrap`
- Undo toolbar: stays visible if admin, but on mobile sits on its own line below the view-mode selector

### 2.2 View-mode selector

`<ViewModeSelector>` already uses tabs + an entity dropdown. On mobile:

- Tabs: keep, but allow `overflow-x-auto` on the tab list so labels don't squeeze
- Entity dropdown: `w-full md:w-auto`

### 2.3 Single-day grid view

`TimetableGrid` gains:

```ts
visibleDays?: number[]; // 0..4 (Mon..Fri); default = [0,1,2,3,4]
```

When set, only those day columns are rendered. Headers, rows, and highlight logic all filter to the same set. This keeps the desktop call site identical (omit the prop).

The timetable page:

1. Calls `useIsMobile()` (hook already exists at `@/hooks/use-mobile`).
2. When mobile, renders a day-tab strip directly above the grid (`Mo Di Mi Do Fr`, locale-aware via the existing `DAY_LABELS_DE/EN` constants). Tab triggers are equal-width (`grid grid-cols-5`).
3. Active day persists to `localStorage` under the existing view-persistence key — extend the persisted shape with `mobileDay?: number`. Default = today's weekday if Mon-Fri, else 0.
4. Passes `visibleDays={[activeDay]}` to `<TimetableGrid>`.
5. **Forces `editable={false}` on mobile** regardless of admin status. The kebab-menu lesson edit dialog is also disabled (it's part of the editable cell renderer, so this is automatic). Mobile is read-only for v1.

### 2.4 Highlighted-cell pivot

When a violation is clicked and the page pivots view mode, on mobile it should also switch the active day to the day of the first matching lesson ref. Add this to the existing `onHighlight` handler.

### 2.5 Violations panel

Already a vertical list. Verify it doesn't overflow horizontally on small screens — wrap long resource names with `break-words`. No structural change.

## 3. Reference-data tables

Pages under settings tabs / sub-routes for: rooms, teachers, subjects, classes, terms, timeslots. Each currently renders a desktop `<table>`.

**Pattern (apply uniformly):**

- Wrap the existing `<table>` in `<div className="hidden md:block">`.
- Add a sibling `<div className="md:hidden space-y-2">` rendering one **card** per row:
  - Card uses existing shadcn `<Card>` (or a plain `border rounded-md p-3 bg-card` if importing Card is heavy).
  - Inside: each column becomes a label/value pair (label `text-xs text-muted-foreground`, value below or beside).
  - Action buttons (Edit, Delete, plus entity-specific affordances like "Availability" for teachers, "Suitability" for rooms) become full-width buttons in a `flex gap-2 mt-2` row at the card foot.
- Search/filter input: `w-full md:w-auto` and stacks above any "Add" button on mobile.
- "Add new" buttons keep their existing position; on mobile they go full-width if alone in a row.

**Why duplicate the table and the card list rather than abstract:** the existing pages are short and the per-entity field set differs enough that a generic `<ResponsiveTable>` would have more configuration than the duplication saves. If a third use case appears later we extract.

**Files:**

- `frontend/src/app/[locale]/schools/[id]/settings/` — locate the per-tab editor components for rooms, teachers, subjects, classes, terms, timeslots. (The settings page composes these as tab content.)
- Each gets the table → card-list pattern.

## 4. Settings page

`frontend/src/app/[locale]/schools/[id]/settings/page.tsx`.

- `<TabsList>` gets `overflow-x-auto` so the row of triggers can scroll horizontally on mobile. Don't switch to a select-based tab picker — the count is small.
- Form rows currently using `grid grid-cols-2`: switch to `grid-cols-1 md:grid-cols-2`.
- The Import / Export tab uses `<ImportPreviewDialog>` — add `max-w-[95vw] max-h-[90vh] overflow-y-auto` to its dialog content if missing.

## 5. Members page

`frontend/src/app/[locale]/schools/[id]/members/page.tsx`. Apply the table → card-list pattern from §3. Invite form inputs stack vertically and go full-width on mobile.

## 6. Curriculum page

`frontend/src/app/[locale]/schools/[id]/curriculum/page.tsx`.

- Verify current layout when implementing. If multi-class matrix: on mobile, present a single class selector (full-width dropdown) and render a vertical list of subjects with one number input per row.
- If already class-at-a-time: only ensure inputs and buttons are full-width on mobile.

## 7. Dialog audit

For every dialog touched by these pages, ensure dialog content has:

```
sm:max-w-lg max-w-[95vw] max-h-[90vh] overflow-y-auto
```

(Apply only where missing — don't churn dialogs that already work.) Specific dialogs to check: `LessonEditDialog`, `ImportPreviewDialog`, teacher availability dialog, room suitability dialog, all "Add/Edit X" reference-data dialogs.

## 8. i18n

No new translation keys. Day labels reuse existing `DAY_LABELS_DE/EN` constants from `timetable-grid.tsx`. Mobile header bar titles reuse existing `school.dashboard`, `school.members`, `curriculum.title`, `scheduler.title`, `timetable.title`, `settings.title`.

## 9. Testing

Bun + Testing Library component tests:

- `TimetableGrid` with `visibleDays={[2]}` renders only the Wed column header and only Wed lessons.
- `TimetableGrid` with no `visibleDays` prop renders all 5 days (regression guard).
- Mobile day tabs persist selected day to localStorage and re-hydrate on mount.
- One representative reference-data page (e.g. rooms): verify both the table and the card list render the same rows, each gated by the right responsive class.

Manual visual verification: dev server at 375×667 (iPhone SE) and 390×844 (iPhone 14) in Chrome devtools. Walk every page in the scope above.

No new backend tests — this is a pure frontend change.

## 10. Out of scope

- Any backend change
- Touch drag-and-drop on the timetable
- Bottom nav bar
- New translation keys
- A shared `<ResponsiveTable>` abstraction
- Any accessibility audit beyond what the existing components already provide
- Tablet-specific breakpoints

## 11. Files touched (anticipated)

- `frontend/src/app/[locale]/schools/[id]/layout.tsx` — mobile header bar with `SidebarTrigger`
- `frontend/src/components/timetable/timetable-grid.tsx` — `visibleDays` prop
- `frontend/src/app/[locale]/schools/[id]/timetable/page.tsx` — mobile day tabs, header reflow, mobile editable=false, day persistence
- `frontend/src/components/timetable/view-mode-selector.tsx` — mobile width tweaks, persistence shape extension
- `frontend/src/components/timetable/violations-panel.tsx` — `break-words` polish if needed
- Reference-data tab components (rooms, teachers, subjects, classes, terms, timeslots) — table + card-list pattern
- `frontend/src/app/[locale]/schools/[id]/settings/page.tsx` — TabsList scroll + form grid
- `frontend/src/app/[locale]/schools/[id]/members/page.tsx` — table + card-list pattern
- `frontend/src/app/[locale]/schools/[id]/curriculum/page.tsx` — verify, adapt
- A few dialogs — `max-w-[95vw]` polish

## Open questions

None. Proceed to implementation plan.
