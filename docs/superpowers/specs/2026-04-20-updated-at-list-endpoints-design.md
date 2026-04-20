# Dashboard "Recently edited" tile

**Date:** 2026-04-20
**Status:** Design approved, plan pending.

## Problem

The Dashboard ships a placeholder tile (`frontend/src/features/dashboard/recently-edited.tsx`) whose body reads "Recently-edited list will appear once the backend exposes updated_at." The OPEN_THINGS entry that tracks it ("`updated_at` on list endpoints") calls out subjects, rooms, teachers, and week-schemes as the blockers.

That backend work is already in place. Every list response on the affected entities already carries `created_at` and `updated_at` (both as ORM columns with `onupdate=func.now()` and as fields in the Pydantic list-response schemas). `frontend/src/lib/api-types.ts` already reflects this. The blocker is frontend-only: the tile must actually render.

## Goal

Replace the placeholder with a live tile that shows the top 5 most recently touched entities across the scheduling data, sorted newest first, with a relative timestamp and a link to that entity's list page.

## Non-goals

- Backend changes. `updated_at` is already on every list endpoint that matters.
- Deep-linking from the tile into an entity's edit dialog. None of the CRUD pages take an `?edit=<id>` search param yet; adding that across every page triples the scope. The tile links to the list page.
- Lessons in the merged feed. Once a school has 100+ lessons, lessons would dominate the tile purely by volume and push configuration changes out. Kept out by design.
- A new query hook. The tile reuses the existing `useSubjects`, `useRooms`, `useTeachers`, `useWeekSchemes`, `useSchoolClasses`, `useStundentafeln` hooks. They already run on the dashboard render via `StatGrid` / `ReadinessChecklist`, so adding another consumer is free at the cache layer.

## Design

### Data shape

A single in-component `RecentEntry` type:

```ts
type RecentEntry = {
  id: string;
  kind: "subject" | "room" | "teacher" | "weekScheme" | "schoolClass" | "stundentafel";
  name: string;
  updatedAt: string; // ISO8601 from the API
  href: "/subjects" | "/rooms" | "/teachers" | "/week-schemes" | "/school-classes" | "/stundentafeln";
};
```

`name` is `name` for every entity except teachers, which use `${first_name} ${last_name}`. i18n note: these are data, not translated fragments, so literal concatenation is fine. Frontend CLAUDE.md forbids concat of translated fragments, which is a different rule.

### Merge and sort

Inside the component:

1. Pull from the six hooks.
2. If every hook is `isLoading` with no cached data, render the skeleton.
3. Map each hook's data to `RecentEntry`, `flat()` them, sort by `updatedAt` descending (string compare on ISO8601 is correct), slice to 5.
4. If the sorted list is empty, render the empty state.

No `useMemo` around the merge. Six list hooks totalling a few hundred rows is cheap per render, and the frontend CLAUDE.md rule forbids defensive memoisation.

### Relative-time formatting

One helper, `formatRelativeUpdated(iso: string, now: Date, locale: string, t: TFunction)`, colocated in the component file:

- `diffSeconds = (now - parsed) / 1000`.
- Under 60s: return `t("dashboard.recentEntries.justNow")`.
- Otherwise pick the largest bucket where `Math.abs(diffInUnits) >= 1`, in order minute, hour, day, month (30 days), year (365 days).
- Return `new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-units, bucket)`.

Absolute timestamp goes in the row's `title` attribute via `new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(parsed)`. That covers the "what was the exact time?" case without a tooltip library.

Why not i18next pluralisation with hand-written keys? `Intl.RelativeTimeFormat` already handles plurals and locale-correct output for every supported language. Reinventing it in `en.json` and `de.json` would be slower and wrong for edge cases.

### Rendering

Card layout matches the surrounding dashboard tiles (`rounded-xl border bg-card p-4`). Inside:

- `<h2 className="text-base font-semibold">{t("dashboard.recent")}</h2>` (key reused from the placeholder).
- `<ul>` of five rows. Each row is a `<Link to={entry.href}>` with flex layout:
  - Lucide icon matching the entity kind (`Book`, `DoorOpen`, `UserRound`, `CalendarRange`, `GraduationCap`, `ListChecks`).
  - Column: entry.name bold, entity-type label muted underneath.
  - Right-aligned relative time in `text-xs text-muted-foreground`.
- Empty state: `<p>` with `t("dashboard.recentEntries.empty")`.
- Loading state: three skeleton rows (`<div className="h-10 animate-pulse rounded bg-muted/50" />`).

No `data-testid`; tests will use role (`link`) and accessible name.

### i18n keys

Under `dashboard`:

```json
{
  "recent": "Recently edited", // already exists, reused
  "recentEntries": {
    "empty": "Edit an entity to see it here.",
    "justNow": "Just now",
    "types": {
      "subject": "Subject",
      "room": "Room",
      "teacher": "Teacher",
      "weekScheme": "Week scheme",
      "schoolClass": "School class",
      "stundentafel": "Curriculum"
    }
  }
}
```

`dashboard.recentPlaceholder` is removed in the same commit because the placeholder is gone; leaving the key orphaned would lie to future readers. Both `en.json` and `de.json` ship in lockstep.

### Links

TanStack Router's `<Link to="/subjects">` etc. The route paths already exist as `_authed.<entity>.tsx` files under `frontend/src/routes/`. Strict typing is automatic because the Router Vite plugin regenerates `routeTree.gen.ts`.

### Accessibility

- Each row is a `<Link>` (real anchor) — middle-click, keyboard nav, screen-reader "link" announcement all work.
- Icons are decorative (`aria-hidden="true"`); accessible name comes from the name + type combination.
- Relative time has a machine-readable `<time dateTime={iso}>` wrapper with the formatted relative string as its text; screen readers get "2 hours ago" and sighted users with hover get the absolute datetime via `title`.

## Testing

Component test in `frontend/src/features/dashboard/recently-edited.test.tsx`:

1. **Happy path.** Seed MSW with subjects, rooms, teachers, week-schemes, school-classes, stundentafeln, each list holding 2 items with varying `updated_at`. Freeze time via `vi.setSystemTime("2026-04-20T12:00:00Z")`. Assert that the first five rows render in the expected `updated_at`-descending order, by accessible name. Locale pinned to `en` per the frontend CLAUDE.md rule.
2. **Empty state.** Override the six list handlers to return `[]`. Assert that `t("dashboard.recentEntries.empty")` renders and no `role="link"` children exist inside the card.
3. **Loading state.** Not tested explicitly; the skeleton is visual polish and flakes easily under jsdom with query-cache state.

No backend tests. Pure frontend change.

## Coverage

The existing line-coverage ratchet lives at `.coverage-baseline-frontend` (currently 61%). The new component has its own tests so the net change should be neutral or slightly positive. If the baseline drops anyway, `mise run fe:cov:update-baseline` before committing. No floor change.

## MSW handlers

`tests/msw-handlers.ts` already stubs every list endpoint the tile reads from. The test file will override the relevant handlers inline via `server.use(http.get(...))` rather than editing defaults, so other tests keep their current fixtures.

## Risk and rollback

Zero backend risk. Frontend risk is scoped to the one component; rollback is a revert of the file edits.

## Follow-ups queued for OPEN_THINGS

- Deep-linking from the tile into an entity's edit dialog, once a second use case demands bookmarkable edits.
- Time-of-day-aware greeting (already tracked; orthogonal to this work).
