# Recently-edited dashboard tile implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Dashboard `RecentlyEdited` placeholder with a live tile that merges the six scheduling-data lists (subjects, rooms, teachers, week-schemes, school-classes, stundentafeln), sorts by `updated_at` descending, and renders the top five with relative timestamps and entity links.

**Architecture:** Pure frontend change. The tile component consumes the existing entity list hooks (no new query hook), merges their results into a single `RecentEntry[]`, sorts and slices in render, and formats timestamps with `Intl.RelativeTimeFormat` seeded from `i18n.language`. All backend list schemas already surface `updated_at` and `frontend/src/lib/api-types.ts` already reflects that.

**Tech Stack:** React 19, TanStack Query, TanStack Router `<Link>`, shadcn tokens, lucide-react icons, react-i18next, Vitest + MSW.

Spec: `docs/superpowers/specs/2026-04-20-updated-at-list-endpoints-design.md`.

---

## File map

- **Rewrite:** `frontend/src/features/dashboard/recently-edited.tsx` (currently a placeholder; becomes the live tile plus its in-file helpers).
- **Create:** `frontend/src/features/dashboard/recently-edited.test.tsx` (Vitest component test).
- **Modify:** `frontend/src/i18n/locales/en.json` and `frontend/src/i18n/locales/de.json` (add `dashboard.recentEntries.*`, drop `dashboard.recentPlaceholder`).

No new hooks, no new MSW handlers, no changes to `tests/msw-handlers.ts` defaults. Tests override handlers inline where they need non-default fixtures.

No backend changes. No Python or Rust files.

---

## Task 1: Add i18n keys (en + de), remove `recentPlaceholder`

**Files:**
- Modify: `frontend/src/i18n/locales/en.json`
- Modify: `frontend/src/i18n/locales/de.json`

- [ ] **Step 1: Edit `en.json`**

Inside the `dashboard` object, delete the existing line

```json
    "recentPlaceholder": "Recently-edited list will appear once the backend exposes updated_at.",
```

and insert, after the `"recent": "Recently edited",` line:

```json
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
    },
```

- [ ] **Step 2: Edit `de.json`**

Inside the `dashboard` object, delete the existing line

```json
    "recentPlaceholder": "Die Liste erscheint, sobald das Backend updated_at liefert.",
```

and insert, after the `"recent": "Zuletzt bearbeitet",` line:

```json
    "recentEntries": {
      "empty": "Bearbeite einen Eintrag, um ihn hier zu sehen.",
      "justNow": "Gerade eben",
      "types": {
        "subject": "Fach",
        "room": "Raum",
        "teacher": "Lehrkraft",
        "weekScheme": "Wochenraster",
        "schoolClass": "Klasse",
        "stundentafel": "Stundentafel"
      }
    },
```

- [ ] **Step 3: Sanity-check JSON**

```bash
cd /home/pascal/Code/Klassenzeit && node -e "JSON.parse(require('fs').readFileSync('frontend/src/i18n/locales/en.json','utf8')); JSON.parse(require('fs').readFileSync('frontend/src/i18n/locales/de.json','utf8'));" && echo ok
```

Expected: `ok`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/i18n/locales/en.json frontend/src/i18n/locales/de.json
git commit -m "feat(frontend): add recent-entries i18n keys for dashboard tile"
```

Lefthook will run `biome check` (no TS changes yet) and `cog verify`.

---

## Task 2: Write the failing test for `RecentlyEdited`

**Files:**
- Create: `frontend/src/features/dashboard/recently-edited.test.tsx`

- [ ] **Step 1: Write the test file**

Paste the whole file:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { RecentlyEdited } from "@/features/dashboard/recently-edited";
import i18n from "@/i18n/init";
import { server } from "../../../tests/msw-handlers";

const BASE = "http://localhost:3000";

type QueryClientOptions = ConstructorParameters<typeof QueryClient>[0];

function renderTile() {
  const opts: QueryClientOptions = {
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  };
  const queryClient = new QueryClient(opts);
  const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({});
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <RecentlyEdited />,
  });
  // The tile links to /subjects etc.; register them so TanStack Router accepts the Link target.
  const passthrough = (path: string) =>
    createRoute({ getParentRoute: () => rootRoute, path, component: () => null });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      passthrough("/subjects"),
      passthrough("/rooms"),
      passthrough("/teachers"),
      passthrough("/week-schemes"),
      passthrough("/school-classes"),
      passthrough("/stundentafeln"),
    ]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
    context: { queryClient },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("RecentlyEdited", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-20T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(() => {
    // Restore the default locale for the suite.
    void i18n.changeLanguage("en");
  });

  it("shows the top five entities sorted by updated_at descending, newest first", async () => {
    server.use(
      http.get(`${BASE}/api/subjects`, () =>
        HttpResponse.json([
          {
            id: "s1",
            name: "Mathematik",
            short_name: "MA",
            color: "chart-1",
            created_at: "2026-04-01T00:00:00Z",
            updated_at: "2026-04-20T11:59:30Z", // within 60s -> "just now"
          },
          {
            id: "s2",
            name: "Deutsch",
            short_name: "DE",
            color: "chart-2",
            created_at: "2026-04-01T00:00:00Z",
            updated_at: "2026-04-19T12:00:00Z", // 1 day ago
          },
        ]),
      ),
      http.get(`${BASE}/api/rooms`, () =>
        HttpResponse.json([
          {
            id: "r1",
            name: "Raum 101",
            short_name: "101",
            capacity: 30,
            created_at: "2026-04-01T00:00:00Z",
            updated_at: "2026-04-20T10:00:00Z", // 2h ago
          },
        ]),
      ),
      http.get(`${BASE}/api/teachers`, () =>
        HttpResponse.json([
          {
            id: "t1",
            first_name: "Anna",
            last_name: "Schmidt",
            short_code: "SCH",
            max_hours_per_week: 25,
            is_active: true,
            created_at: "2026-04-01T00:00:00Z",
            updated_at: "2026-04-20T11:30:00Z", // 30 min ago
          },
        ]),
      ),
      http.get(`${BASE}/api/week-schemes`, () =>
        HttpResponse.json([
          {
            id: "w1",
            name: "Standardwoche",
            description: null,
            created_at: "2026-04-01T00:00:00Z",
            updated_at: "2026-04-18T12:00:00Z", // 2 days ago
          },
        ]),
      ),
      http.get(`${BASE}/api/classes`, () =>
        HttpResponse.json([
          {
            id: "c1",
            name: "1a",
            grade_level: 1,
            stundentafel_id: "x",
            week_scheme_id: "w1",
            created_at: "2026-04-01T00:00:00Z",
            updated_at: "2026-04-10T12:00:00Z", // ~10 days ago, won't make top 5
          },
        ]),
      ),
      http.get(`${BASE}/api/stundentafeln`, () =>
        HttpResponse.json([
          {
            id: "st1",
            name: "Grundschule Klasse 1",
            grade_level: 1,
            created_at: "2026-04-01T00:00:00Z",
            updated_at: "2026-04-20T11:00:00Z", // 1h ago
          },
        ]),
      ),
    );

    renderTile();

    // Wait until the tile has pulled from every hook; the "Just now" row is the
    // most recent and the strongest signal the merge ran.
    const heading = await screen.findByRole("heading", { level: 2, name: /recently edited/i });
    const card = heading.parentElement as HTMLElement;
    await waitFor(() => {
      expect(within(card).getByText(/just now/i)).toBeVisible();
    });

    const links = within(card).getAllByRole("link");
    expect(links).toHaveLength(5);
    // Expected order by updated_at desc:
    //   Mathematik (just now), Anna Schmidt (30 min), Grundschule Klasse 1 (1h),
    //   Raum 101 (2h), Deutsch (1 day). 1a (10 days) drops off.
    expect(links[0]).toHaveTextContent(/mathematik/i);
    expect(links[1]).toHaveTextContent(/anna schmidt/i);
    expect(links[2]).toHaveTextContent(/grundschule klasse 1/i);
    expect(links[3]).toHaveTextContent(/raum 101/i);
    expect(links[4]).toHaveTextContent(/deutsch/i);
    // 1a must not appear.
    expect(within(card).queryByText(/\b1a\b/)).toBeNull();

    // Each link points at the entity's list route.
    expect(links[0]).toHaveAttribute("href", "/subjects");
    expect(links[1]).toHaveAttribute("href", "/teachers");
    expect(links[2]).toHaveAttribute("href", "/stundentafeln");
    expect(links[3]).toHaveAttribute("href", "/rooms");
    expect(links[4]).toHaveAttribute("href", "/subjects");
  });

  it("shows the empty state when every list is empty", async () => {
    server.use(
      http.get(`${BASE}/api/subjects`, () => HttpResponse.json([])),
      http.get(`${BASE}/api/rooms`, () => HttpResponse.json([])),
      http.get(`${BASE}/api/teachers`, () => HttpResponse.json([])),
      http.get(`${BASE}/api/week-schemes`, () => HttpResponse.json([])),
      http.get(`${BASE}/api/classes`, () => HttpResponse.json([])),
      http.get(`${BASE}/api/stundentafeln`, () => HttpResponse.json([])),
    );

    renderTile();

    const empty = await screen.findByText(/edit an entity to see it here/i);
    expect(empty).toBeVisible();
    const heading = screen.getByRole("heading", { level: 2, name: /recently edited/i });
    const card = heading.parentElement as HTMLElement;
    expect(within(card).queryByRole("link")).toBeNull();
  });
});
```

- [ ] **Step 2: Confirm `tests/msw-handlers.ts` exports `server`**

Run:

```bash
grep -n "export const server" /home/pascal/Code/Klassenzeit/frontend/tests/msw-handlers.ts
```

Expected: one match. `server` is defined in `msw-handlers.ts` and re-imported from `setup.ts`; tests import it directly from `msw-handlers.ts` so they can call `server.use(...)` to override defaults.

- [ ] **Step 3: Run the test to confirm it fails**

```bash
cd /home/pascal/Code/Klassenzeit/frontend && mise exec -- pnpm vitest run src/features/dashboard/recently-edited.test.tsx
```

Expected: failure on the import line (`RecentlyEdited` does not yet export the new tile; the current `recently-edited.tsx` exports a function with no merged-list behaviour). We accept both "cannot resolve" and "test assertion failed" here as red.

---

## Task 3: Rewrite `recently-edited.tsx` to make the test pass

**Files:**
- Modify: `frontend/src/features/dashboard/recently-edited.tsx` (total rewrite)

- [ ] **Step 1: Rewrite the file**

Replace the full contents with:

```tsx
import { Link } from "@tanstack/react-router";
import {
  BookOpen,
  CalendarDays,
  DoorOpen,
  GraduationCap,
  type LucideIcon,
  Pencil,
  UserRound,
} from "lucide-react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { useRooms } from "@/features/rooms/hooks";
import { useSchoolClasses } from "@/features/school-classes/hooks";
import { useStundentafeln } from "@/features/stundentafeln/hooks";
import { useSubjects } from "@/features/subjects/hooks";
import { useTeachers } from "@/features/teachers/hooks";
import { useWeekSchemes } from "@/features/week-schemes/hooks";

type EntityKind =
  | "subject"
  | "room"
  | "teacher"
  | "weekScheme"
  | "schoolClass"
  | "stundentafel";

type EntityHref =
  | "/subjects"
  | "/rooms"
  | "/teachers"
  | "/week-schemes"
  | "/school-classes"
  | "/stundentafeln";

interface RecentEntry {
  id: string;
  kind: EntityKind;
  name: string;
  updatedAt: string;
  href: EntityHref;
}

const KIND_META: Record<EntityKind, { icon: LucideIcon; href: EntityHref }> = {
  subject: { icon: BookOpen, href: "/subjects" },
  room: { icon: DoorOpen, href: "/rooms" },
  teacher: { icon: UserRound, href: "/teachers" },
  weekScheme: { icon: CalendarDays, href: "/week-schemes" },
  schoolClass: { icon: GraduationCap, href: "/school-classes" },
  stundentafel: { icon: Pencil, href: "/stundentafeln" },
};

const MAX_ENTRIES = 5;
const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 60 * 60 * 24 * 365],
  ["month", 60 * 60 * 24 * 30],
  ["day", 60 * 60 * 24],
  ["hour", 60 * 60],
  ["minute", 60],
];

function formatRelative(
  iso: string,
  now: Date,
  locale: string,
  t: TFunction,
): string {
  const diffSec = (new Date(iso).getTime() - now.getTime()) / 1000;
  if (Math.abs(diffSec) < 60) return t("dashboard.recentEntries.justNow");
  const fmt = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, seconds] of UNITS) {
    const value = diffSec / seconds;
    if (Math.abs(value) >= 1) {
      return fmt.format(Math.round(value), unit);
    }
  }
  return t("dashboard.recentEntries.justNow");
}

function formatAbsolute(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function RecentlyEdited() {
  const { t, i18n } = useTranslation();
  const subjects = useSubjects();
  const rooms = useRooms();
  const teachers = useTeachers();
  const weekSchemes = useWeekSchemes();
  const schoolClasses = useSchoolClasses();
  const stundentafeln = useStundentafeln();

  const allLoading =
    subjects.isLoading &&
    rooms.isLoading &&
    teachers.isLoading &&
    weekSchemes.isLoading &&
    schoolClasses.isLoading &&
    stundentafeln.isLoading;

  const entries: RecentEntry[] = [
    ...(subjects.data ?? []).map<RecentEntry>((s) => ({
      id: s.id,
      kind: "subject",
      name: s.name,
      updatedAt: s.updated_at,
      href: "/subjects",
    })),
    ...(rooms.data ?? []).map<RecentEntry>((r) => ({
      id: r.id,
      kind: "room",
      name: r.name,
      updatedAt: r.updated_at,
      href: "/rooms",
    })),
    ...(teachers.data ?? []).map<RecentEntry>((te) => ({
      id: te.id,
      kind: "teacher",
      name: `${te.first_name} ${te.last_name}`,
      updatedAt: te.updated_at,
      href: "/teachers",
    })),
    ...(weekSchemes.data ?? []).map<RecentEntry>((w) => ({
      id: w.id,
      kind: "weekScheme",
      name: w.name,
      updatedAt: w.updated_at,
      href: "/week-schemes",
    })),
    ...(schoolClasses.data ?? []).map<RecentEntry>((c) => ({
      id: c.id,
      kind: "schoolClass",
      name: c.name,
      updatedAt: c.updated_at,
      href: "/school-classes",
    })),
    ...(stundentafeln.data ?? []).map<RecentEntry>((s) => ({
      id: s.id,
      kind: "stundentafel",
      name: s.name,
      updatedAt: s.updated_at,
      href: "/stundentafeln",
    })),
  ]
    .slice()
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
    .slice(0, MAX_ENTRIES);

  const now = new Date();

  return (
    <div className="rounded-xl border bg-card p-4">
      <h2 className="text-base font-semibold">{t("dashboard.recent")}</h2>
      {allLoading && entries.length === 0 ? (
        <div className="mt-3 space-y-2" aria-hidden="true">
          <div className="h-10 animate-pulse rounded bg-muted/50" />
          <div className="h-10 animate-pulse rounded bg-muted/50" />
          <div className="h-10 animate-pulse rounded bg-muted/50" />
        </div>
      ) : entries.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {t("dashboard.recentEntries.empty")}
        </p>
      ) : (
        <ul className="mt-2 divide-y">
          {entries.map((entry) => {
            const Icon = KIND_META[entry.kind].icon;
            const typeLabel = t(`dashboard.recentEntries.types.${entry.kind}` as const);
            return (
              <li key={`${entry.kind}:${entry.id}`}>
                <Link
                  to={entry.href}
                  className="flex items-center gap-3 py-2 hover:bg-accent/40 rounded px-1"
                >
                  <span
                    aria-hidden="true"
                    className="grid h-7 w-7 place-items-center rounded-full bg-muted text-muted-foreground"
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block truncate text-sm font-medium">{entry.name}</span>
                    <span className="block text-xs text-muted-foreground">{typeLabel}</span>
                  </span>
                  <time
                    dateTime={entry.updatedAt}
                    title={formatAbsolute(entry.updatedAt, i18n.language)}
                    className="text-xs text-muted-foreground"
                  >
                    {formatRelative(entry.updatedAt, now, i18n.language, t)}
                  </time>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```

Key points the reviewer should confirm:
- No `useMemo` around the merge (frontend CLAUDE.md forbids defensive memoisation).
- The `slice().sort(...)` is on a fresh array, never on React-Query data (mutating cache would break the app).
- Icons have `aria-hidden="true"` because the row's accessible name comes from the link text.
- `formatRelative` ignores the sign of the diff by design (past dates only; if `diffSec` is positive, we still fall through to the largest-unit branch and return a future-tense format, which is harmless for clock drift).

- [ ] **Step 2: Run the focused test**

```bash
cd /home/pascal/Code/Klassenzeit/frontend && mise exec -- pnpm vitest run src/features/dashboard/recently-edited.test.tsx
```

Expected: both tests pass. If the sort comparator or the link-href assertions fail, the most likely cause is a typo in one of the `KIND_META` entries or in the mapping lambdas.

- [ ] **Step 3: Regenerate router types just in case**

Because the tile's `<Link to="/stundentafeln">` uses a typed target, the router plugin must have seen the route file. Run:

```bash
cd /home/pascal/Code/Klassenzeit/frontend && mise exec -- pnpm build
```

Expected: build completes. Not running `tsc --noEmit` here yet (that belongs in Task 5 alongside the i18n typecheck).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/dashboard/recently-edited.tsx \
        frontend/src/features/dashboard/recently-edited.test.tsx
git commit -m "feat(frontend): replace dashboard recently-edited placeholder with live tile"
```

---

## Task 4: Verify the dashboard page test still passes

**Files:**
- Check: `frontend/tests/dashboard-page.test.tsx`

The existing dashboard-page test renders the whole dashboard. If MSW isn't serving `stundentafeln` or `classes` by default, the new tile will fire network errors. The default handlers in `tests/msw-handlers.ts` already cover every list endpoint the tile reads (verified during brainstorm), but run the page test to be sure.

- [ ] **Step 1: Run the page test**

```bash
cd /home/pascal/Code/Klassenzeit/frontend && mise exec -- pnpm vitest run tests/dashboard-page.test.tsx
```

Expected: both assertions pass. No MSW `onUnhandledRequest: "error"` noise.

- [ ] **Step 2: No commit**

Task 4 only runs a test. If it passes, proceed.

If the test fails with an unhandled request warning, the tile is hitting an endpoint the default handlers don't stub. In that case, add the missing GET to `defaultHandlers` in `tests/msw-handlers.ts` returning the existing `initialX` seed (every entity's seed is already exported from that file), and make that the **first** edit of this task before re-running.

---

## Task 5: Full lint, typecheck, and test sweep

**Files:** none new; this is a verification task.

- [ ] **Step 1: Biome + ruff via lefthook's lint runner**

```bash
cd /home/pascal/Code/Klassenzeit && mise run lint
```

Expected: all checks pass. Biome should be happy with the new TSX. If Biome complains about `a11y/noStaticElementInteractions` or `useButtonType`, re-check that the row is a `<Link>` (anchor) and not a `<div onClick={...}>`.

- [ ] **Step 2: Full TypeScript typecheck**

```bash
cd /home/pascal/Code/Klassenzeit/frontend && mise exec -- pnpm exec tsc --noEmit
```

Expected: no errors. The i18n key-type declaration in `frontend/src/i18n/types.d.ts` is generated from `en.json` at typecheck time (see `frontend/tsconfig.json` or the i18next resources typing), so the new `dashboard.recentEntries.*` keys must be reachable. If `tsc` reports that `dashboard.recentEntries.types.subject` is not assignable, the JSON change from Task 1 didn't land; re-run Task 1 step 3 and confirm.

- [ ] **Step 3: Full frontend test suite**

```bash
cd /home/pascal/Code/Klassenzeit && mise run fe:test
```

Expected: all tests green.

- [ ] **Step 4: Coverage**

```bash
cd /home/pascal/Code/Klassenzeit && mise run fe:test:cov
```

Expected: the summary reports a `total.lines.pct` at or above `.coverage-baseline-frontend` (currently 61). The new file has its own test; the net change is usually neutral or positive. If the baseline drops by more than a percentage point, stop and investigate (the tile test is probably not covering what we think it is).

- [ ] **Step 5: Only if the baseline dropped, rebaseline**

```bash
cd /home/pascal/Code/Klassenzeit && mise run fe:cov:update-baseline
```

Then commit the updated `.coverage-baseline-frontend` in its own follow-up commit:

```bash
git add .coverage-baseline-frontend
git commit -m "chore(frontend): ratchet coverage baseline after recently-edited tile"
```

Otherwise skip this step. Do not rebaseline when coverage is stable or improved — the ratchet only moves up.

---

## Task 6: Update OPEN_THINGS.md

**Files:**
- Modify: `docs/superpowers/OPEN_THINGS.md`

- [ ] **Step 1: Remove the `updated_at` entry**

Open `docs/superpowers/OPEN_THINGS.md`. Delete the line starting with `- **\`updated_at\` on list endpoints.**` and its following body (the single list item described in the product-capabilities section).

- [ ] **Step 2: Add a new follow-up for deep-linked edits**

Below the `active` flag on WeekScheme entry (or wherever is the right priority slot in the product-capabilities list), add:

```markdown
- **Deep-linked entity edit.** The Dashboard "Recently edited" tile links to the entity's list page without opening the edit dialog for that row. Add a `?edit=<id>` search param (validated by Zod in `validateSearch`) on each CRUD page, and teach the list component to open the matching dialog on mount. Defer until a second use case demands bookmarkable edits.
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/OPEN_THINGS.md
git commit -m "docs: close updated_at-on-lists item, queue deep-link follow-up"
```

---

## Task 7: Plan wrap-up

- [ ] **Step 1: Verify the branch is clean**

```bash
git status
git log --oneline origin/master..HEAD
```

Expected: a clean working tree and commits that form a tidy sequence (spec, i18n, component + test, docs). If any commit doesn't build cleanly, squash it with its predecessor via `git rebase -i origin/master`.

- [ ] **Step 2: Hand off to the autopilot CI + PR steps**

The autopilot driver handles:
- `mise run test` (full suite: Rust + Python + frontend)
- push + `gh pr create`
- brainstorm Q&A as PR comments
- green-CI loop

Nothing in this plan spans that boundary.

---

## Self-review

- **Spec coverage:** every spec section has a task — i18n (Task 1), component rewrite (Task 3), test (Task 2 → Task 3), dashboard-level regression guard (Task 4), lint/type/test/coverage (Task 5), OPEN_THINGS cleanup (Task 6).
- **Placeholder scan:** every code step ships complete code; no "TBD", no "handle appropriately", no "similar to Task N".
- **Type consistency:** `EntityKind` and `EntityHref` are declared once at the top of the file and every downstream reference uses the same identifiers. `RecentEntry` members are spelled identically in the interface declaration, the `map<RecentEntry>(...)` call sites, and the test fixtures.
- **Ambiguity:** Task 2 step 2 explicitly tells the engineer what to do if `tests/setup.ts` doesn't export `server` yet; all other dependencies (MSW defaults, render-helpers, i18n init) are already in place.
