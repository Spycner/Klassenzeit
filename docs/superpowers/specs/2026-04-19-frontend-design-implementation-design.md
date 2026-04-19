# Frontend design implementation (PK tokens, dashboard, redesigned CRUD pages)

Spec date: 2026-04-19
Status: accepted
Owner: pgoell

## Motivation

A handoff bundle from Claude Design (`api.anthropic.com/v1/design/h/fHV8rWEZBX4Gl0RpXn6BLw`) captures the intended visual and UX direction for Klassenzeit. The bundle contains: a React-via-unpkg HTML prototype, a tokens.css / app.css pair backed by Pascal's PK design system (moss-green primary, warm off-white background, Quicksand + Lora + Fira Code + Special Elite fonts), per-page layouts (dense tables for Subjects / Rooms / Teachers, split view for Week schemes), a new post-login dashboard, guided empty states, a Claude-style collapsible sidebar, and bilingual copy. The chat transcript shows the user iterating to a specific final shape and explicitly dropping the prototype's variation switcher and Tweaks panel.

The existing frontend ships CRUD pages for all four entities (PR #82) plus i18n and theming scaffolding (PR #79), but with the neutral shadcn palette, system fonts, a utilitarian sidebar, a stub dashboard, and plain one-line empty strings. This spec ports the "relevant aspects" of the design onto that foundation.

## Goals

- Replace the neutral shadcn token set in `frontend/src/styles/app.css` with the PK token set (colors, fonts, radii, shadow ramp, sidebar tokens, chart tokens, tracking scale), adding Google Fonts for Quicksand / Lora / Fira Code / Special Elite.
- Port the Claude-style collapsible sidebar, persisted via a `SidebarProvider` context.
- Replace the dashboard stub with a real dashboard: stat grid (live counts via TanStack Query), readiness checklist, next-steps tiles, quick-add grid, recently-edited list.
- Redesign each CRUD page: dense table for Subjects / Rooms / Teachers, split view for Week schemes. Shared `Toolbar` with search. Shared `EmptyState` with onboarding steps for the first entity of each type.
- Add i18n keys for all new copy in both `en.json` and `de.json`.
- Keep every existing CRUD test green; add targeted tests for sidebar toggle, empty state, and dashboard counts.

## Non-goals

- No backend changes: no new fields on Room / Teacher / Subject / WeekScheme, no new endpoints.
- No import / export or bulk-delete wiring. Buttons that appear in the design but lack backend support render as disabled placeholders with a `title` attribute explaining.
- No variation switcher, no Tweaks panel. Layouts are locked per page.
- No `/dashboard` route alias. `/` stays the landing URL.
- No new entity pages (SchoolClass, Lesson, Stundentafel).
- No teacher qualification chips, no room suitability chips. Those need backend associations that do not exist yet.
- No coverage ratchet bump unless we actually dip.
- No time-of-day-aware welcome greeting. Locale-neutral "Welcome back." only.

## Stack (unchanged)

- Vite 7 + React 19, TanStack Router + Query.
- shadcn/ui primitives under `frontend/src/components/ui/`.
- React Hook Form + Zod, react-i18next.
- Tailwind 4 with `@theme inline` mapping CSS vars to utility tokens.
- `next-themes` for light/dark toggle, already in place.

No new dependencies. Google Fonts is imported at the top of `app.css` via `@import url(...)`, matching the prototype.

## Design tokens

Replace the `:root` and `.dark` blocks in `frontend/src/styles/app.css` with the PK palette. The block comes verbatim from the prototype's `tokens.css`, minus the `--wordle-*` game tokens which are not relevant here.

Additions beyond the current token set:

- `--sidebar`, `--sidebar-foreground`, `--sidebar-primary`, `--sidebar-primary-foreground`, `--sidebar-accent`, `--sidebar-accent-foreground`, `--sidebar-border`, `--sidebar-ring`.
- `--chart-1` through `--chart-5`.
- `--font-sans`, `--font-serif`, `--font-mono`. Dark mode swaps `--font-mono` to `"Special Elite"` (typewriter personality).
- `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-xl` derived from `--radius: 1rem`.
- `--tracking-normal`, `--tracking-tight`, `--tracking-wide`, etc.
- `--shadow-xs` through `--shadow-2xl` (warm and subtle in light, pure-black and dramatic in dark).

`@theme inline` extends to expose the new tokens to Tailwind utilities: `--color-sidebar`, `--color-sidebar-foreground`, etc., so `bg-sidebar`, `border-sidebar-border` work. Chart tokens are exposed as `--color-chart-1` … `--color-chart-5` for future chart work.

`html, body` get `font-family: var(--font-sans)` and `letter-spacing: var(--tracking-normal)`. Existing component-level font declarations stay empty; Tailwind's `font-sans` picks up the variable.

## Architecture

### Directory layout

```
frontend/src/
  components/
    app-sidebar.tsx            # new: sidebar shell with collapse toggle
    empty-state.tsx            # new: shared <EmptyState/>
    toolbar.tsx                # new: shared search + count <Toolbar/>
    sidebar-provider.tsx       # new: collapsed-state context + localStorage
    language-switcher.tsx      # rework: pill-style EN/DE switch
    theme-toggle.tsx           # unchanged
    layout/
      app-shell.tsx            # rework: wire sidebar provider, breadcrumbs
  features/
    dashboard/
      dashboard-page.tsx       # new
      stat-grid.tsx            # new (four stat cards, live counts)
      readiness-checklist.tsx  # new (heuristic over live data)
      next-steps.tsx           # new (heuristic tiles)
      quick-add.tsx            # new (four link cards)
      recently-edited.tsx      # new (placeholder-driven list)
    rooms/rooms-page.tsx       # rework
    subjects/subjects-page.tsx # rework
    teachers/teachers-page.tsx # rework
    week-schemes/week-schemes-page.tsx  # rework (split view)
  routes/
    _authed.index.tsx          # thin wrapper, renders DashboardPage
  styles/
    app.css                    # PK tokens, @theme inline extensions, local helper classes
  i18n/locales/
    en.json                    # + dashboard.*, <entity>.subtitle / empty.*, common.*
    de.json                    # parity
```

### Sidebar + app shell

`components/sidebar-provider.tsx` exports a context `{ collapsed, toggle, setCollapsed }`. On mount, read `kz_sidebar_collapsed` from `localStorage`; `collapsed` starts false if unset. Writes to `localStorage` happen inline with state updates; no effect hook (collapse is a user action, not derived state).

`components/app-sidebar.tsx` renders the sidebar itself: brand + toggle header, grouped nav (Main: Dashboard; Scheduling data: Subjects, Rooms, Teachers, Week schemes; disabled placeholders for School classes, Lessons), user card at the bottom with a "Log out" entry. Nav items are `<Link>` not `<div>`. The toggle uses a `Button variant="ghost" size="icon"` with an `aria-label` keyed to the collapsed state (`"Collapse sidebar"` / `"Expand sidebar"`). Icon: lucide-react's `PanelLeft` — same shape as the prototype's hand-drawn "sidebar panel" icon (rectangle with a filled left column). Using lucide keeps the icon import path consistent with every other icon in the shell.

The sidebar is 240px expanded, 56px collapsed. Transition: `grid-template-columns 180ms ease`. Text labels hide when collapsed; icons stay; tooltips appear via native `title` attributes.

`components/layout/app-shell.tsx` wraps children with the provider, renders the sidebar, and a top bar. Top bar: breadcrumb trail on the left (`Klassenzeit / <current page>`), language switcher + theme toggle on the right. Auth is unchanged.

Count badges in the sidebar come from lightweight `useQuery` calls on the list endpoints (the same queries the CRUD pages use). Each query runs only once on first render of the shell; results are cached and shared.

### Dashboard

`features/dashboard/dashboard-page.tsx` composes the children. Layout:

- Page head with title `t("dashboard.welcome")` subtitle `t("dashboard.subtitle")` and two actions (Import placeholder, primary "Open planner" placeholder).
- `StatGrid`: four cards for Classes, Teachers, Rooms, Subjects. "Classes" count is static `0` (no endpoint yet); the other three come from `useSubjects`, `useRooms`, `useTeachers`, `useWeekSchemes` query data. Hints on each card are heuristic strings: e.g. teachers card shows "{count} total" when populated, "none yet" when empty.
- Two-column grid below: left column has `ReadinessChecklist` and `NextSteps`, right column has `QuickAdd` and `RecentlyEdited`.
- `ReadinessChecklist`: six items, each a boolean derived from list length or a static placeholder ("Week scheme defined" = `weekSchemes.length > 0`). Each item is an inline hstack with a filled-or-outlined check box and a label. No interactivity.
- `NextSteps`: three tiles, each a row with an avatar-style icon, title, subtitle, and an "Open" button navigating to the relevant route. Shown only when the relevant heuristic fails (no teachers, no active week scheme, etc.).
- `QuickAdd`: four `<Link>` cards in a 2×2 grid, each linking to the relevant `/entity` route with a query string that triggers the create dialog (e.g. `/subjects?create=1`). The page components read the search param and pre-open the dialog.
- `RecentlyEdited`: a static list with placeholder copy ("Data lands once entity updated_at is exposed" via an info badge) until the backend surfaces updated_at on the list endpoints. File an OPEN_THINGS follow-up.

All copy is i18n-keyed. Heuristics are pure functions over query data; no refs, no effects.

### CRUD page redesign

Shared `components/empty-state.tsx`:

```ts
export interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  body: string;
  steps: [string, string, string];
  createLabel: string;
  onCreate: () => void;
}
```

Shared `components/toolbar.tsx`:

```ts
export interface ToolbarProps {
  search: string;
  onSearch: (value: string) => void;
  placeholder: string;
  right?: ReactNode;   // trailing content, e.g. a total chip
}
```

No filters pane, no bulk-delete, no chips — toolbar is deliberately minimal in v1.

#### Subjects / Rooms / Teachers (dense table layout)

- `PageHead` (title + subtitle + actions: "Import" disabled placeholder, "New <entity>" primary button).
- `Toolbar` with search input bound to a URL search param `q`.
- Empty state when `list.length === 0` and no `q` filter.
- Dense `<Table>`: thin row padding (`py-1.5`), sortable headers (click cycles asc → desc → none), icon-only action buttons on hover.
- Table columns take the existing shadcn primitive; densify with a `dense` prop or a `className` that applies `[&_td]:py-1.5 [&_th]:py-1.5`.
- Cell-level visuals:
  - **Rooms**: Name, Short, Capacity (right-aligned mono), Mode (badge: solid primary for `general`, secondary for `specialized`), actions.
  - **Teachers**: Name ("LastName, FirstName"), Code (mono), Max hours (right-aligned mono), actions. Extra columns (Qualifications, Availability) omitted until backend data exists.
  - **Subjects**: Name (with color swatch), Short (mono), Color (swatch row), Used-in (count, placeholder `—` until backend exposes it), actions. Swatch color comes from a per-subject mapping derived from `id` modulo `chart-*` palette, since the backend has no color field; this is UI-only.

URL search params: `q: string, sort: "name" | "short" | "capacity" | …, dir: "asc" | "desc"`. Schemas use TanStack Router's `validateSearch` with Zod.

Selection state (checkbox column) is NOT added in this pass. No bulk action exists to hang it on; the design includes checkboxes but the chat log never landed on a bulk-delete story. Deferred to OPEN_THINGS.

#### Week schemes (split view layout)

Two-column grid inside a rounded card: left list (300px), right detail (flex-1).

Left list rows: name, `active` badge if the scheme has an `active` flag (backend field does not exist yet → always false → badge never renders in v1).

Right detail: large heading, description, a "big grid" preview laid out with CSS Grid: time column (80px) + 5 day columns. Periods derived from the scheme's `days` and `periods` fields (fall back to 5 × 8 if either is missing). Slot labels are `P1` … `P8`; days come from a locale-aware `days` array in i18n (`["Mo","Tu","We","Th","Fr"]` / `["Mo","Di","Mi","Do","Fr"]`). No break rows in v1.

Action row at the bottom of the detail pane: Edit (opens the existing dialog), Delete (opens the existing confirm dialog).

The `active` selection is URL-driven: `?id=<scheme-id>` via search params; falling back to the first scheme in the list.

### `create=1` query param trick for QuickAdd

Each CRUD page watches its route search params; if `create=1`, it pre-opens the create dialog on mount and then clears the param via `router.navigate({ search: (prev) => ({ ...prev, create: undefined }) })`. Lets the dashboard "Quick add <entity>" cards deep-link into the create flow without a new route.

### i18n keys

Additive, not rewritten. Mirror existing shape.

- `dashboard.welcome`, `dashboard.subtitle`, `dashboard.stats.{classes,teachers,rooms,subjects}`, `dashboard.readiness`, `dashboard.readinessSub`, `dashboard.readinessItems.{subjectsCatalogue,roomsDefined,teachersDefined,weekSchemeDefined,lessonsAssigned}`, `dashboard.nextSteps`, `dashboard.nextStepsSub`, `dashboard.quickAdd`, `dashboard.recent`, `dashboard.recentPlaceholder`, `dashboard.hint.*`.
- `common.new` (generic "New"), `common.import`, `common.search`, `common.noResults`.
- `<entity>.subtitle`, `<entity>.empty.{title,body,step1,step2,step3}`.
- `weekSchemes.preview`, `weekSchemes.days`.
- `sidebar.collapse`, `sidebar.expand`, `sidebar.main`, `sidebar.data`, `sidebar.schoolClasses`, `sidebar.lessons`, `sidebar.disabled` (title attr explaining "coming soon").

DE copy lifted from prototype `i18n.js` where applicable; EN matches the prototype EN.

### Testing

- `tests/app-shell.test.tsx` or extend `tests/app-shell.*`: sidebar collapse toggle flips the `[data-collapsed]` attr (or class) on the sidebar; `localStorage.kz_sidebar_collapsed` is written.
- `tests/dashboard-page.test.tsx`: renders, shows stat cards with counts seeded via MSW handlers, renders a "next steps" tile when `teachers.length === 0`.
- `tests/empty-state.test.tsx`: `<EmptyState/>` renders title, body, three steps with correct numerals, and calls `onCreate` when clicked.
- Existing `tests/rooms-page.test.tsx`, `teachers-page.test.tsx`, `week-schemes-page.test.tsx`, `subjects-page.test.tsx`: update row/column assertions to match the new markup (column labels may change slightly); the mutation flow assertions stay unchanged.
- `tests/i18n.test.tsx`: already walks keys; will catch any EN/DE drift automatically as long as the test is structured key-by-key (verify).

MSW handlers already cover list + CRUD endpoints for the four entities; add any new stubs (e.g. for dashboard heuristics) only if a real endpoint is called.

## Key decisions (with pointers into the brainstorm)

- **Wholesale PK token swap** in `app.css` rather than layered themes (Q3).
- **Google Fonts `@import`** to match the prototype; self-hosting is a follow-up (Q4).
- **Tailwind utilities over inline styles**, with a small set of semantic classes for composite visuals (Q5).
- **`SidebarProvider` context** for collapse state, mirroring `ThemeProvider` (Q6).
- **Dashboard mixes live counts with heuristic messaging** (Q7).
- **Keep shadcn `Table` primitive; densify with Tailwind classes on cells** (Q8).
- **URL search params for search / sort / filter** per frontend CLAUDE.md (Q9).
- **Drop selection column for v1**; no bulk action exists (revised from Q9).
- **No visual-only multi-select chips** in dialogs (Q10).
- **Shared `<EmptyState>` + `<Toolbar>` components** (Q11).
- **Namespaced i18n additions**, no renaming of existing keys (Q12).
- **Additive tests**, not a rewrite (Q13).

## Acceptance criteria

1. Light mode looks like the prototype: warm off-white background, moss-green primary, Quicksand display font, Fira Code mono. Dark mode swaps mono to Special Elite.
2. Sidebar collapses to 56px and expands to 240px via a toggle button; the state survives a full-page reload.
3. Dashboard renders stat cards with live counts, a readiness checklist, next-steps tiles when heuristics fail, quick-add cards linking to the four CRUD pages with `?create=1`, and a placeholder recently-edited list.
4. Each CRUD page shows the empty-state when its list is empty and no search filter is active.
5. Search input filters the list in-memory and persists via URL.
6. Week schemes shows a split list / detail with a big preview grid.
7. Language switch flips every new copy string between EN and DE.
8. `mise run lint` and `mise run fe:test` pass; existing tests continue to pass.
9. Frontend coverage ratchet passes (bump baseline if warranted).
10. No backend changes, no new dependencies, no new shadcn primitives.

## Risks and mitigations

- **Font loading jank.** Google Fonts `@import` blocks render briefly. Acceptable for v1; if CLS becomes a real complaint, switch to `@font-face` with locally hosted woff2 in a follow-up.
- **Dark mode with Special Elite is polarizing.** Some users will dislike the typewriter mono. Mitigation: the spec documents it as a deliberate personality choice from the design chat; revisiting is trivial (one token).
- **Token swap breaks existing tests that hardcode neutral colors.** Unlikely, the tests assert semantics not colors, but keep a close eye on any regression.
- **URL search param changes may break tests.** The existing page tests don't exercise URL-driven state; the new tests do. Mitigation: `renderWithProviders` already sets up a fresh router per test; no cross-test state.
- **Collapsed-sidebar initial render flash.** The provider reads localStorage synchronously in `useState` initializer so the first paint reflects the persisted state. No flash expected.
- **`create=1` deep link.** If the CRUD page's route was not already mounted, the query is consumed on first render; if it was mounted (via client nav), the effect must still fire. Mitigation: parse search params in the page component's render; pre-open the dialog via a `useState` initializer; clear the param via `router.navigate({ search })` after mount. No `useEffect` for derived state.

## Rollback plan

Revert the feature branch commits. Token swap is contained to `app.css`. New components are additive. `_authed.index.tsx` is a thin wrapper that can be restored. CRUD pages changes are visual; the existing tests guard against breakage in the mutation flow.

## Open questions (deferred to OPEN_THINGS)

- Selection column + bulk delete.
- Multi-select suitability / qualification chips (requires backend associations).
- Availability mini-grid and availability editor (requires backend availability model).
- Import / export wiring.
- Recently-edited data source (requires `updated_at` on list endpoints).
- Subject color persistence (requires backend column).
- Active week scheme flag.
- Time-of-day-aware welcome greeting.
- Self-hosted fonts.
