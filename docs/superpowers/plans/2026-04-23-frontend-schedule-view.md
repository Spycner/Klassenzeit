# Frontend schedule view Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a `/schedule` route that reads `GET /api/classes/{class_id}/schedule` into a per-class week grid and runs `POST /api/classes/{class_id}/schedule` via a "Generate schedule" action, matching the spec at `docs/superpowers/specs/2026-04-23-frontend-schedule-view-design.md`.

**Architecture:** Search-param-driven route (`?class=<uuid>`) renders a page that joins placements against cached entity queries (subjects, rooms, lessons, week-scheme detail) client-side. The grid reuses the existing `.kz-ws-grid` CSS from WeekSchemes. Violations from POST surface inline; GET-only loads fall back to a derived "N hours unplaced" counter.

**Tech Stack:** React 19, TanStack Router + Query, shadcn/ui (`Select`, `Button`, `Dialog`), react-i18next, Zod v4 for search-param validation, MSW for test network boundary, Vitest + Testing Library. No new runtime deps.

**Commit split (4 commits):**

1. `chore(frontend): regenerate api-types for schedule endpoints`
2. `feat(frontend): add schedule feature hooks and MSW coverage`
3. `feat(frontend): add schedule view with class picker and grid`
4. `docs: close sprint step 1 and log schedule follow-ups`

**Subagent contract:** Each task is dispatched to a fresh `general-purpose` subagent via the `Agent` tool. Subagents do NOT commit; the main session reviews the diff and commits. Task 3 subagent must invoke `frontend-design` via the `Skill` tool before writing any UI; the main session's skill audit (autopilot step 7) verifies that invocation.

---

## File structure

### New files

```
docs/superpowers/plans/2026-04-23-frontend-schedule-view.md    (this file)
frontend/src/routes/_authed.schedule.tsx                       (thin route file)
frontend/src/features/schedule/
├── schedule-page.tsx                                          (page, orchestrates queries + mutation)
├── schedule-grid.tsx                                          (pure grid render)
├── schedule-toolbar.tsx                                       (class picker + Generate button + replace banner)
├── schedule-status.tsx                                        (placement count + violations / derived counter)
├── hooks.ts                                                   (useClassSchedule, useGenerateClassSchedule)
├── schedule-page.test.tsx                                     (component tests)
├── schedule-grid.test.tsx                                     (component tests)
├── schedule-toolbar.test.tsx                                  (component tests)
└── hooks.test.tsx                                             (hook tests)
```

### Modified files

```
frontend/src/lib/api-types.ts                                  (regenerated; checked in)
frontend/src/components/app-sidebar.tsx                        (add "nav.schedule" to NavLabelKey, add to NAV_GROUPS)
frontend/src/components/layout/app-shell.tsx                   (add crumb key for /schedule)
frontend/src/i18n/locales/en.json                              (add schedule.* + nav.schedule)
frontend/src/i18n/locales/de.json                              (add schedule.* + nav.schedule)
frontend/tests/msw-handlers.ts                                 (add GET + POST /schedule handlers, mutable state map)
frontend/src/routeTree.gen.ts                                  (regenerated; gitignored, NOT committed)
docs/superpowers/OPEN_THINGS.md                                (close sprint step 1, add follow-ups)
```

---

## Task 1: Regenerate `api-types.ts`

**Files:**
- Modify: `frontend/src/lib/api-types.ts`

- [ ] **Step 1: Start the backend if it isn't already running**

The types regeneration reads from the running backend's OpenAPI schema. The backend must be serving the current code (including the schedule endpoints added in PRs #119 and #120).

Run (in a terminal the subagent controls):
```bash
mise run dev
```

Verification:
```bash
curl -s http://localhost:8000/openapi.json | python3 -c "import sys, json; s = json.load(sys.stdin); print('/schedule' in [p for p in s['paths']])"
```
Expected output: `True`

- [ ] **Step 2: Regenerate the types file**

Run:
```bash
mise run fe:types
```
Expected output: file `frontend/src/lib/api-types.ts` updates; script exits 0.

- [ ] **Step 3: Verify the schedule endpoints are present**

Run:
```bash
grep -n '"/api/classes/{class_id}/schedule"' frontend/src/lib/api-types.ts | head -5
grep -n 'PlacementResponse\|ScheduleResponse\|ScheduleReadResponse\|ViolationResponse' frontend/src/lib/api-types.ts | head -10
```
Expected: the route string appears at least twice (GET + POST) and all four schema names appear.

- [ ] **Step 4: Verify the frontend still typechecks and builds**

Run:
```bash
cd frontend && mise exec -- pnpm exec tsc --noEmit
```
Expected: exit 0. Touching `api-types.ts` must not break any existing call site. If it does, the root cause is that an existing page was already using a schedule-shaped type via a path this regen has changed; surface it and pause the task. (Unlikely because nothing consumes the schedule endpoints yet.)

- [ ] **Step 5: Report to the main session for review and commit**

Subagent returns a one-line summary of the diff (e.g. "api-types.ts grew by ~300 lines; new paths and schemas land as expected"). Do NOT commit from the subagent.

Main session runs:
```bash
git add frontend/src/lib/api-types.ts
git commit -m "chore(frontend): regenerate api-types for schedule endpoints"
```

---

## Task 2: Schedule feature hooks + MSW handlers + hook tests

**Files:**
- Create: `frontend/src/features/schedule/hooks.ts`
- Create: `frontend/src/features/schedule/hooks.test.tsx`
- Modify: `frontend/tests/msw-handlers.ts`

- [ ] **Step 1: Write the failing hook tests (all five scenarios)**

Create `frontend/src/features/schedule/hooks.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api-client";
import {
  scheduleQueryKey,
  useClassSchedule,
  useGenerateClassSchedule,
} from "./hooks";
import { scheduleByClassId, violationsByClassId } from "../../../tests/msw-handlers";

const CLASS_ID = "00000000-0000-0000-0000-00000000a001";
const OTHER_ID = "00000000-0000-0000-0000-0000000000ff";

function wrap() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

describe("useClassSchedule", () => {
  beforeEach(() => {
    for (const key of Object.keys(scheduleByClassId)) delete scheduleByClassId[key];
    for (const key of Object.keys(violationsByClassId)) delete violationsByClassId[key];
  });

  it("returns the placements seeded for the class", async () => {
    scheduleByClassId[CLASS_ID] = [
      {
        lesson_id: "00000000-0000-0000-0000-00000000b001",
        time_block_id: "00000000-0000-0000-0000-00000000c001",
        room_id: "00000000-0000-0000-0000-00000000d001",
      },
    ];
    const { wrapper } = wrap();
    const { result } = renderHook(() => useClassSchedule(CLASS_ID), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.placements).toHaveLength(1);
  });

  it("returns an empty placement list for a never-solved class", async () => {
    const { wrapper } = wrap();
    const { result } = renderHook(() => useClassSchedule(CLASS_ID), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.placements).toEqual([]);
  });

  it("surfaces a 404 as ApiError when the class id is unknown", async () => {
    const { wrapper } = wrap();
    const { result } = renderHook(() => useClassSchedule("deadbeef-dead-beef-dead-beefdeadbeef"), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect((result.current.error as ApiError).status).toBe(404);
  });

  it("stays disabled while classId is undefined (no request)", async () => {
    const { wrapper } = wrap();
    const { result } = renderHook(() => useClassSchedule(undefined), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.isPending).toBe(true);
  });
});

describe("useGenerateClassSchedule", () => {
  beforeEach(() => {
    for (const key of Object.keys(scheduleByClassId)) delete scheduleByClassId[key];
    for (const key of Object.keys(violationsByClassId)) delete violationsByClassId[key];
  });

  it("posts and writes placements into the GET cache", async () => {
    scheduleByClassId[CLASS_ID] = [];
    violationsByClassId[CLASS_ID] = [];
    const { client, wrapper } = wrap();
    const { result } = renderHook(() => useGenerateClassSchedule(), { wrapper });
    const response = await result.current.mutateAsync(CLASS_ID);
    expect(response.placements).toBeDefined();
    const cached = client.getQueryData(scheduleQueryKey(CLASS_ID));
    expect(cached).toEqual({ placements: response.placements });
  });
});
```

- [ ] **Step 2: Add MSW handlers and mutable state maps**

Open `frontend/tests/msw-handlers.ts` and add near the other mutable maps:

```ts
import type { components } from "@/lib/api-types";

export const scheduleByClassId: Record<string, components["schemas"]["PlacementResponse"][]> = {};
export const violationsByClassId: Record<string, components["schemas"]["ViolationResponse"][]> = {};
```

Add to the `defaultHandlers` array (mirroring the existing handler style; `msw`'s `http.get` / `http.post`):

```ts
http.get("/api/classes/:classId/schedule", ({ params }) => {
  const classId = String(params.classId);
  if (classId === "deadbeef-dead-beef-dead-beefdeadbeef") {
    return HttpResponse.json({ detail: "Class not found" }, { status: 404 });
  }
  return HttpResponse.json({ placements: scheduleByClassId[classId] ?? [] });
}),
http.post("/api/classes/:classId/schedule", ({ params }) => {
  const classId = String(params.classId);
  if (classId === "deadbeef-dead-beef-dead-beefdeadbeef") {
    return HttpResponse.json({ detail: "Class not found" }, { status: 404 });
  }
  const placements = scheduleByClassId[classId] ?? [];
  const violations = violationsByClassId[classId] ?? [];
  return HttpResponse.json({ placements, violations });
}),
```

Look at how existing sub-resource handlers (`stundentafelEntriesByTafelId`) are declared, and follow the same import and typing style. If `msw`'s `http` / `HttpResponse` are already imported elsewhere in the file, don't re-import.

- [ ] **Step 3: Run the tests and confirm they fail**

Run:
```bash
cd frontend && mise exec -- pnpm vitest run src/features/schedule/hooks.test.tsx
```
Expected: all five tests fail with "Cannot find module './hooks'" (module does not exist yet).

- [ ] **Step 4: Implement the hooks**

Create `frontend/src/features/schedule/hooks.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, client } from "@/lib/api-client";
import type { components } from "@/lib/api-types";

export type Placement = components["schemas"]["PlacementResponse"];
export type Violation = components["schemas"]["ViolationResponse"];
export type SchedulePostResponse = components["schemas"]["ScheduleResponse"];
export type ScheduleGetResponse = components["schemas"]["ScheduleReadResponse"];

export function scheduleQueryKey(classId: string) {
  return ["schedule", classId] as const;
}

export function useClassSchedule(classId: string | undefined) {
  return useQuery({
    enabled: Boolean(classId),
    queryKey: classId ? scheduleQueryKey(classId) : ["schedule", "disabled"],
    queryFn: async (): Promise<ScheduleGetResponse> => {
      if (!classId) {
        throw new ApiError(400, null, "useClassSchedule called without classId");
      }
      const { data } = await client.GET("/api/classes/{class_id}/schedule", {
        params: { path: { class_id: classId } },
      });
      if (!data) {
        throw new ApiError(500, null, "Empty response from GET /schedule");
      }
      return data;
    },
  });
}

export function useGenerateClassSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (classId: string): Promise<SchedulePostResponse> => {
      const { data } = await client.POST("/api/classes/{class_id}/schedule", {
        params: { path: { class_id: classId } },
      });
      if (!data) {
        throw new ApiError(500, null, "Empty response from POST /schedule");
      }
      return data;
    },
    onSuccess: (result, classId) => {
      queryClient.setQueryData(scheduleQueryKey(classId), {
        placements: result.placements,
      } satisfies ScheduleGetResponse);
    },
  });
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run:
```bash
cd frontend && mise exec -- pnpm vitest run src/features/schedule/hooks.test.tsx
```
Expected: all five tests pass.

- [ ] **Step 6: Run the full vitest suite to catch MSW regressions**

Run:
```bash
mise run fe:test
```
Expected: existing suite still green; new tests green.

- [ ] **Step 7: Run lint**

Run:
```bash
cd frontend && mise exec -- pnpm lint
```
Expected: exit 0.

- [ ] **Step 8: Report to the main session for review and commit**

Main session commits:
```bash
git add frontend/src/features/schedule/hooks.ts frontend/src/features/schedule/hooks.test.tsx frontend/tests/msw-handlers.ts
git commit -m "feat(frontend): add schedule feature hooks and MSW coverage"
```

---

## Task 3: Build the UI (grid + toolbar + status + page + route + nav + i18n + tests)

**One task, one commit.** Grid / toolbar / status / page components share i18n keys, a common style language, and a shared render contract that is best reasoned about together. A single subagent owns the whole UI surface end to end. The subagent prompt explicitly requires invoking `frontend-design` via the `Skill` tool before writing any markup.

**Files:**
- Create: `frontend/src/features/schedule/schedule-grid.tsx`
- Create: `frontend/src/features/schedule/schedule-grid.test.tsx`
- Create: `frontend/src/features/schedule/schedule-toolbar.tsx`
- Create: `frontend/src/features/schedule/schedule-toolbar.test.tsx`
- Create: `frontend/src/features/schedule/schedule-status.tsx`
- Create: `frontend/src/features/schedule/schedule-page.tsx`
- Create: `frontend/src/features/schedule/schedule-page.test.tsx`
- Create: `frontend/src/routes/_authed.schedule.tsx`
- Modify: `frontend/src/components/app-sidebar.tsx` (add `"nav.schedule"` to `NavLabelKey`, add entry to `NAV_GROUPS`)
- Modify: `frontend/src/components/layout/app-shell.tsx` (add `"/schedule"` branch to `currentCrumbKey`)
- Modify: `frontend/src/i18n/locales/en.json` (add `schedule.*` + `nav.schedule`)
- Modify: `frontend/src/i18n/locales/de.json` (same keys in German)

- [ ] **Step 0: Invoke `frontend-design` via the `Skill` tool**

Before writing any markup, the subagent MUST call the `frontend-design` skill with a prompt describing the schedule view's visual goals:
- Per-class week grid in the same visual language as `.kz-ws-grid` on the WeekSchemes page (`frontend/src/features/week-schemes/week-schemes-page.tsx:154-210`).
- Toolbar with class picker + primary "Generate schedule" button; inline amber replace-banner.
- Empty state using `EmptyState` component pattern.
- Skeleton grid while data loads.
- Violations block under the grid when present.

Let the skill return. Use its guidance to inform the visual decisions in later steps. Quote one load-bearing design call (copy, spacing, or component-choice) in the subagent report so the main session's skill audit can confirm the skill was actually consulted.

- [ ] **Step 1: Write the failing test for `schedule-grid.tsx`**

Create `frontend/src/features/schedule/schedule-grid.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import i18n from "@/i18n/init";
import { ScheduleGrid, type ScheduleCell } from "./schedule-grid";

beforeAll(() => {
  void i18n.changeLanguage("en");
});

describe("ScheduleGrid", () => {
  it("renders a day header for every day present and a row for every position", () => {
    const cells: ScheduleCell[] = [
      {
        key: "1-1",
        day: 1,
        position: 1,
        subjectName: "Mathematics",
        teacherName: "Müller",
        roomName: "Room 101",
      },
      {
        key: "2-2",
        day: 2,
        position: 2,
        subjectName: "German",
        teacherName: "Schmidt",
        roomName: "Room 102",
      },
    ];
    render(<ScheduleGrid cells={cells} daysPresent={[1, 2]} positions={[1, 2]} />);
    expect(screen.getByText("Mon")).toBeInTheDocument();
    expect(screen.getByText("Tue")).toBeInTheDocument();
    expect(screen.getByText("P1")).toBeInTheDocument();
    expect(screen.getByText("P2")).toBeInTheDocument();
    expect(screen.getByText("Mathematics")).toBeInTheDocument();
    expect(screen.getByText("German")).toBeInTheDocument();
  });

  it("renders an empty cell when no placement exists at (day, position)", () => {
    render(<ScheduleGrid cells={[]} daysPresent={[1]} positions={[1]} />);
    const cells = document.querySelectorAll<HTMLElement>(".kz-ws-cell");
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      expect(cell.textContent === "Mon" || cell.textContent === "P1" || cell.textContent === "").toBe(
        true,
      );
    }
  });
});
```

- [ ] **Step 2: Confirm the grid tests fail**

Run:
```bash
cd frontend && mise exec -- pnpm vitest run src/features/schedule/schedule-grid.test.tsx
```
Expected: "Cannot find module './schedule-grid'".

- [ ] **Step 3: Implement `schedule-grid.tsx`**

Create `frontend/src/features/schedule/schedule-grid.tsx`:

```tsx
import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { dayShortKey } from "@/i18n/day-keys";

export interface ScheduleCell {
  key: string;
  day: number;
  position: number;
  subjectName: string;
  teacherName: string | undefined;
  roomName: string;
}

interface ScheduleGridProps {
  cells: ScheduleCell[];
  daysPresent: number[];
  positions: number[];
}

export function ScheduleGrid({ cells, daysPresent, positions }: ScheduleGridProps) {
  const { t } = useTranslation();
  const byKey = new Map<string, ScheduleCell>();
  for (const cell of cells) {
    byKey.set(`${cell.day}:${cell.position}`, cell);
  }
  return (
    <div
      className="kz-ws-grid"
      style={{ gridTemplateColumns: `56px repeat(${daysPresent.length}, 1fr)` }}
    >
      <div className="kz-ws-cell" data-variant="header" />
      {daysPresent.map((day) => (
        <div key={`head-${day}`} className="kz-ws-cell" data-variant="header">
          {t(dayShortKey(day))}
        </div>
      ))}
      {positions.map((position) => (
        <Fragment key={`row-${position}`}>
          <div className="kz-ws-cell" data-variant="time">
            P{position}
          </div>
          {daysPresent.map((day) => {
            const cell = byKey.get(`${day}:${position}`);
            return (
              <div
                key={`${day}:${position}`}
                className="kz-ws-cell"
                {...(cell ? { "data-variant": "period" } : {})}
              >
                {cell ? (
                  <div className="flex flex-col leading-tight">
                    <span className="font-semibold">{cell.subjectName}</span>
                    <span className="opacity-70">
                      {[cell.teacherName, cell.roomName].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                ) : null}
              </div>
            );
          })}
        </Fragment>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Confirm grid tests pass**

Run:
```bash
cd frontend && mise exec -- pnpm vitest run src/features/schedule/schedule-grid.test.tsx
```
Expected: both tests pass.

- [ ] **Step 5: Add i18n keys (`schedule.*` + `nav.schedule`)**

Open `frontend/src/i18n/locales/en.json` and add under a new top-level `schedule` object (alphabetical order among siblings):

```json
"schedule": {
  "title": "Schedule",
  "subtitle": "Review and regenerate a class's schedule.",
  "picker": {
    "label": "Class",
    "placeholder": "Select a class",
    "none": "Pick a class to view its schedule."
  },
  "generate": {
    "action": "Generate schedule",
    "replaceBanner": "This will replace {{count}} placements.",
    "confirmReplace": "Generate anyway",
    "cancel": "Cancel",
    "successToast_one": "Schedule generated. 1 placement saved.",
    "successToast_other": "Schedule generated. {{count}} placements saved.",
    "errorToast": "Failed to generate schedule."
  },
  "empty": {
    "title": "No schedule yet",
    "body": "Click Generate to run the solver for this class.",
    "step1": "Confirm the class has lessons",
    "step2": "Run the solver",
    "step3": "Review violations if any"
  },
  "loadError": "Failed to load schedule.",
  "stats": {
    "placements_one": "1 placement",
    "placements_other": "{{count}} placements",
    "unplaced_one": "1 hour unplaced",
    "unplaced_other": "{{count}} hours unplaced"
  },
  "violations": {
    "title": "Unplaced hours",
    "item": "{{subject}} (hour {{hour}}): {{message}}"
  },
  "cellDeletedLesson": "(deleted lesson)"
}
```

Add under the existing `nav` object (keep alphabetical order inside the object):

```json
"nav": {
  "...existing keys...": "...",
  "schedule": "Schedule"
}
```

Do the same for `frontend/src/i18n/locales/de.json`:

```json
"schedule": {
  "title": "Stundenplan",
  "subtitle": "Stundenplan einer Klasse überprüfen und neu generieren.",
  "picker": {
    "label": "Klasse",
    "placeholder": "Klasse auswählen",
    "none": "Wähle eine Klasse, um ihren Stundenplan zu sehen."
  },
  "generate": {
    "action": "Stundenplan generieren",
    "replaceBanner": "Dadurch werden {{count}} vorhandene Einträge überschrieben.",
    "confirmReplace": "Trotzdem generieren",
    "cancel": "Abbrechen",
    "successToast_one": "Stundenplan erstellt. 1 Eintrag gespeichert.",
    "successToast_other": "Stundenplan erstellt. {{count}} Einträge gespeichert.",
    "errorToast": "Stundenplan konnte nicht erstellt werden."
  },
  "empty": {
    "title": "Noch kein Stundenplan",
    "body": "Klicke auf Generieren, um den Solver für diese Klasse auszuführen.",
    "step1": "Sicherstellen, dass die Klasse Unterrichtsstunden hat",
    "step2": "Solver ausführen",
    "step3": "Verletzungen prüfen, falls vorhanden"
  },
  "loadError": "Stundenplan konnte nicht geladen werden.",
  "stats": {
    "placements_one": "1 Eintrag",
    "placements_other": "{{count}} Einträge",
    "unplaced_one": "1 Stunde nicht eingeplant",
    "unplaced_other": "{{count}} Stunden nicht eingeplant"
  },
  "violations": {
    "title": "Nicht eingeplante Stunden",
    "item": "{{subject}} (Stunde {{hour}}): {{message}}"
  },
  "cellDeletedLesson": "(gelöschte Unterrichtsstunde)"
}
```

Add under the existing `nav` object:

```json
"schedule": "Stundenplan"
```

- [ ] **Step 6: Write the failing test for `schedule-toolbar.tsx`**

Create `frontend/src/features/schedule/schedule-toolbar.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n/init";
import { ScheduleToolbar } from "./schedule-toolbar";

beforeAll(() => {
  void i18n.changeLanguage("en");
});

const CLASSES = [
  { id: "c1", name: "1a", grade_level: 1 },
  { id: "c2", name: "2b", grade_level: 2 },
];

describe("ScheduleToolbar", () => {
  it("renders the Generate button and calls onGenerate when clicked with no placements", () => {
    const onGenerate = vi.fn();
    render(
      <ScheduleToolbar
        classes={CLASSES}
        classId="c1"
        onClassChange={vi.fn()}
        onGenerate={onGenerate}
        onCancelConfirm={vi.fn()}
        placementsCount={0}
        confirming={false}
        pending={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /generate schedule/i }));
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it("renders the replace banner when confirming is true", () => {
    render(
      <ScheduleToolbar
        classes={CLASSES}
        classId="c1"
        onClassChange={vi.fn()}
        onGenerate={vi.fn()}
        onCancelConfirm={vi.fn()}
        placementsCount={18}
        confirming={true}
        pending={false}
      />,
    );
    expect(screen.getByText(/will replace 18 placements/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generate anyway/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("disables the Generate button while pending and shows the saving label", () => {
    render(
      <ScheduleToolbar
        classes={CLASSES}
        classId="c1"
        onClassChange={vi.fn()}
        onGenerate={vi.fn()}
        onCancelConfirm={vi.fn()}
        placementsCount={0}
        confirming={false}
        pending={true}
      />,
    );
    const button = screen.getByRole("button", { name: /saving/i });
    expect(button).toBeDisabled();
  });
});
```

- [ ] **Step 7: Confirm toolbar tests fail**

Run:
```bash
cd frontend && mise exec -- pnpm vitest run src/features/schedule/schedule-toolbar.test.tsx
```
Expected: "Cannot find module './schedule-toolbar'".

- [ ] **Step 8: Implement `schedule-toolbar.tsx`**

Create `frontend/src/features/schedule/schedule-toolbar.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ClassOption {
  id: string;
  name: string;
  grade_level: number;
}

interface ScheduleToolbarProps {
  classes: ClassOption[];
  classId: string | undefined;
  onClassChange: (id: string) => void;
  onGenerate: () => void;
  onCancelConfirm: () => void;
  placementsCount: number;
  confirming: boolean;
  pending: boolean;
}

export function ScheduleToolbar({
  classes,
  classId,
  onClassChange,
  onGenerate,
  onCancelConfirm,
  placementsCount,
  confirming,
  pending,
}: ScheduleToolbarProps) {
  const { t } = useTranslation();
  const disabled = pending || !classId;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-[220px]">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            {t("schedule.picker.label")}
          </label>
          <Select value={classId ?? ""} onValueChange={onClassChange}>
            <SelectTrigger aria-label={t("schedule.picker.label")}>
              <SelectValue placeholder={t("schedule.picker.placeholder")} />
            </SelectTrigger>
            <SelectContent>
              {classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={onGenerate} disabled={disabled}>
          {pending ? t("common.saving") : t("schedule.generate.action")}
        </Button>
      </div>
      {confirming ? (
        <div
          role="alert"
          aria-live="polite"
          className="flex flex-wrap items-center gap-3 rounded-md border border-amber-400/60 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-400/40 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <span>
            {t("schedule.generate.replaceBanner", { count: placementsCount })}
          </span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" onClick={onCancelConfirm}>
              {t("schedule.generate.cancel")}
            </Button>
            <Button size="sm" onClick={onGenerate} disabled={pending}>
              {t("schedule.generate.confirmReplace")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 9: Confirm toolbar tests pass**

Run:
```bash
cd frontend && mise exec -- pnpm vitest run src/features/schedule/schedule-toolbar.test.tsx
```
Expected: all three tests pass.

- [ ] **Step 10: Implement `schedule-status.tsx`**

Create `frontend/src/features/schedule/schedule-status.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import type { Violation } from "./hooks";

interface ScheduleStatusProps {
  placementsCount: number;
  expectedHours: number;
  violations: Violation[] | undefined;
  subjectNameByLessonId: Map<string, string>;
}

export function ScheduleStatus({
  placementsCount,
  expectedHours,
  violations,
  subjectNameByLessonId,
}: ScheduleStatusProps) {
  const { t } = useTranslation();
  const derivedUnplaced = Math.max(0, expectedHours - placementsCount);
  const hasTypedViolations = violations && violations.length > 0;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
        <span>{t("schedule.stats.placements", { count: placementsCount })}</span>
        {!hasTypedViolations && derivedUnplaced > 0 ? (
          <span className="text-amber-600 dark:text-amber-400">
            {t("schedule.stats.unplaced", { count: derivedUnplaced })}
          </span>
        ) : null}
      </div>
      {hasTypedViolations ? (
        <div className="rounded-md border border-amber-400/60 bg-amber-50 px-3 py-2 text-sm dark:border-amber-400/40 dark:bg-amber-950/40">
          <div className="font-semibold text-amber-900 dark:text-amber-200">
            {t("schedule.violations.title")}
          </div>
          <ul className="mt-1 list-disc pl-5 text-amber-900 dark:text-amber-200">
            {violations?.map((v, idx) => (
              <li key={`${v.lesson_id}:${v.hour_index}:${idx}`}>
                {t("schedule.violations.item", {
                  subject: subjectNameByLessonId.get(v.lesson_id) ?? t("schedule.cellDeletedLesson"),
                  hour: v.hour_index + 1,
                  message: v.message,
                })}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
```

No dedicated test for `schedule-status.tsx`; its behaviour is covered by the page-level tests in step 15 (violation rendering, derived counter).

- [ ] **Step 11: Write the failing test for `schedule-page.tsx`**

Create `frontend/src/features/schedule/schedule-page.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import i18n from "@/i18n/init";
import { renderWithProviders } from "../../../tests/render-helpers";
import {
  lessonsSeed,
  roomsSeed,
  scheduleByClassId,
  schoolClassesSeed,
  subjectsSeed,
  weekSchemeDetailById,
} from "../../../tests/msw-handlers";
import { SchedulePage } from "./schedule-page";

beforeAll(() => {
  void i18n.changeLanguage("en");
});

beforeEach(() => {
  for (const key of Object.keys(scheduleByClassId)) delete scheduleByClassId[key];
});

describe("SchedulePage", () => {
  it("renders the pick-a-class empty state when no class is selected", async () => {
    await renderWithProviders(<SchedulePage />, { initialEntries: ["/schedule"] });
    expect(await screen.findByText(/pick a class/i)).toBeInTheDocument();
  });

  it("renders the Generate CTA when the selected class has no placements", async () => {
    const classId = schoolClassesSeed[0]!.id;
    scheduleByClassId[classId] = [];
    await renderWithProviders(<SchedulePage />, { initialEntries: [`/schedule?class=${classId}`] });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /generate schedule/i })).toBeInTheDocument(),
    );
  });

  it("renders a cell for each placement with resolved subject + room labels", async () => {
    const schoolClass = schoolClassesSeed[0]!;
    const lesson = lessonsSeed.find((l) => l.school_class_id === schoolClass.id);
    const room = roomsSeed[0]!;
    const weekScheme = weekSchemeDetailById[schoolClass.week_scheme_id];
    const timeBlock = weekScheme?.time_blocks[0];
    if (!lesson || !timeBlock) throw new Error("seed missing");
    scheduleByClassId[schoolClass.id] = [
      { lesson_id: lesson.id, time_block_id: timeBlock.id, room_id: room.id },
    ];
    await renderWithProviders(<SchedulePage />, {
      initialEntries: [`/schedule?class=${schoolClass.id}`],
    });
    const subject = subjectsSeed.find((s) => s.id === lesson.subject_id);
    await waitFor(() =>
      expect(screen.getByText(subject?.name ?? "")).toBeInTheDocument(),
    );
  });
});
```

Notes for the subagent:
- `schoolClassesSeed`, `lessonsSeed`, `roomsSeed`, `subjectsSeed`, and `weekSchemeDetailById` are the existing MSW seed names used elsewhere. If any of those names differ in `tests/msw-handlers.ts`, adjust the import line to match reality rather than inventing new exports.
- `weekSchemeDetailById[...]` may not be keyed that way today. Check `tests/msw-handlers.ts` for the actual shape; if the seed's week scheme lookup is a flat list, iterate to find the right one. Prefer the real seed shape over inventing fixtures.

- [ ] **Step 12: Confirm page tests fail**

Run:
```bash
cd frontend && mise exec -- pnpm vitest run src/features/schedule/schedule-page.test.tsx
```
Expected: "Cannot find module './schedule-page'".

- [ ] **Step 13: Implement `schedule-page.tsx`**

Create `frontend/src/features/schedule/schedule-page.tsx`:

```tsx
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Calendar } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { useLessons } from "@/features/lessons/hooks";
import { useRooms } from "@/features/rooms/hooks";
import { useSchoolClasses } from "@/features/school-classes/hooks";
import { useSubjects } from "@/features/subjects/hooks";
import { useWeekSchemeDetail } from "@/features/week-schemes/hooks";
import { ApiError } from "@/lib/api-client";
import { useClassSchedule, useGenerateClassSchedule, type Violation } from "./hooks";
import { ScheduleGrid, type ScheduleCell } from "./schedule-grid";
import { ScheduleStatus } from "./schedule-status";
import { ScheduleToolbar } from "./schedule-toolbar";

export function SchedulePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { class?: string };
  const classId = search.class;

  const classes = useSchoolClasses();
  const schedule = useClassSchedule(classId);
  const lessons = useLessons();
  const subjects = useSubjects();
  const rooms = useRooms();
  const schoolClass = classes.data?.find((c) => c.id === classId);
  const weekScheme = useWeekSchemeDetail(schoolClass?.week_scheme_id);
  const generate = useGenerateClassSchedule();

  const [confirming, setConfirming] = useState(false);
  const [postViolations, setPostViolations] = useState<Violation[] | undefined>();

  function onClassChange(id: string) {
    setConfirming(false);
    setPostViolations(undefined);
    void navigate({ to: "/schedule", search: { class: id } });
  }

  async function runGenerate() {
    if (!classId) return;
    const placementsNow = schedule.data?.placements.length ?? 0;
    if (placementsNow > 0 && !confirming) {
      setConfirming(true);
      return;
    }
    try {
      const result = await generate.mutateAsync(classId);
      setPostViolations(result.violations);
      setConfirming(false);
      toast.success(t("schedule.generate.successToast", { count: result.placements.length }));
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : t("schedule.generate.errorToast");
      toast.error(msg || t("schedule.generate.errorToast"));
    }
  }

  if (!classId) {
    return (
      <div className="space-y-4">
        <Header title={t("schedule.title")} subtitle={t("schedule.subtitle")} />
        <p className="text-sm text-muted-foreground">{t("schedule.picker.none")}</p>
        <ScheduleToolbar
          classes={classes.data ?? []}
          classId={undefined}
          onClassChange={onClassChange}
          onGenerate={runGenerate}
          onCancelConfirm={() => setConfirming(false)}
          placementsCount={0}
          confirming={false}
          pending={false}
        />
      </div>
    );
  }

  const loading =
    classes.isLoading ||
    schedule.isLoading ||
    lessons.isLoading ||
    subjects.isLoading ||
    rooms.isLoading ||
    weekScheme.isLoading;
  const errored =
    classes.isError ||
    schedule.isError ||
    lessons.isError ||
    subjects.isError ||
    rooms.isError ||
    weekScheme.isError;

  const placements = schedule.data?.placements ?? [];
  const lessonById = new Map((lessons.data ?? []).map((l) => [l.id, l]));
  const subjectById = new Map((subjects.data ?? []).map((s) => [s.id, s]));
  const roomById = new Map((rooms.data ?? []).map((r) => [r.id, r]));
  const timeBlockById = new Map((weekScheme.data?.time_blocks ?? []).map((b) => [b.id, b]));

  const classLessons = (lessons.data ?? []).filter((l) => l.school_class_id === classId);
  const expectedHours = classLessons.reduce((sum, l) => sum + l.hours_per_week, 0);
  const subjectNameByLessonId = new Map(
    classLessons.map((l) => [l.id, subjectById.get(l.subject_id)?.name ?? t("schedule.cellDeletedLesson")]),
  );

  const cells: ScheduleCell[] = placements
    .map((p): ScheduleCell | undefined => {
      const lesson = lessonById.get(p.lesson_id);
      const block = timeBlockById.get(p.time_block_id);
      if (!lesson || !block) return undefined;
      const subject = subjectById.get(lesson.subject_id);
      const room = roomById.get(p.room_id);
      return {
        key: `${block.day_of_week}:${block.position}`,
        day: block.day_of_week,
        position: block.position,
        subjectName: subject?.name ?? t("schedule.cellDeletedLesson"),
        teacherName: undefined,
        roomName: room?.name ?? t("schedule.cellDeletedLesson"),
      };
    })
    .filter((c): c is ScheduleCell => c !== undefined);

  const daysPresent = Array.from(
    new Set((weekScheme.data?.time_blocks ?? []).map((b) => b.day_of_week)),
  ).sort((a, b) => a - b);
  const positions = Array.from(
    new Set((weekScheme.data?.time_blocks ?? []).map((b) => b.position)),
  ).sort((a, b) => a - b);

  return (
    <div className="space-y-5">
      <Header title={t("schedule.title")} subtitle={t("schedule.subtitle")} />
      <ScheduleToolbar
        classes={classes.data ?? []}
        classId={classId}
        onClassChange={onClassChange}
        onGenerate={runGenerate}
        onCancelConfirm={() => setConfirming(false)}
        placementsCount={placements.length}
        confirming={confirming}
        pending={generate.isPending}
      />
      {loading ? (
        <SkeletonGrid daysCount={Math.max(daysPresent.length, 5)} positionsCount={Math.max(positions.length, 6)} />
      ) : errored ? (
        <div className="space-y-2 text-sm text-destructive">
          <p>{t("schedule.loadError")}</p>
          <Button variant="outline" size="sm" onClick={() => schedule.refetch()}>
            {t("common.retry")}
          </Button>
        </div>
      ) : placements.length === 0 ? (
        <EmptyState
          icon={<Calendar className="h-7 w-7" />}
          title={t("schedule.empty.title")}
          body={t("schedule.empty.body")}
          steps={[t("schedule.empty.step1"), t("schedule.empty.step2"), t("schedule.empty.step3")]}
          onCreate={runGenerate}
          createLabel={t("schedule.generate.action")}
        />
      ) : (
        <>
          <ScheduleStatus
            placementsCount={placements.length}
            expectedHours={expectedHours}
            violations={postViolations}
            subjectNameByLessonId={subjectNameByLessonId}
          />
          <ScheduleGrid cells={cells} daysPresent={daysPresent} positions={positions} />
        </>
      )}
    </div>
  );
}

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function SkeletonGrid({ daysCount, positionsCount }: { daysCount: number; positionsCount: number }) {
  const days = Array.from({ length: daysCount }, (_, i) => i + 1);
  const positions = Array.from({ length: positionsCount }, (_, i) => i + 1);
  return (
    <div
      className="kz-ws-grid animate-pulse"
      style={{ gridTemplateColumns: `56px repeat(${daysCount}, 1fr)` }}
    >
      <div className="kz-ws-cell" data-variant="header" />
      {days.map((d) => (
        <div key={`skel-h-${d}`} className="kz-ws-cell" data-variant="header" />
      ))}
      {positions.map((p) => (
        <>
          <div key={`skel-t-${p}`} className="kz-ws-cell" data-variant="time" />
          {days.map((d) => (
            <div key={`skel-${d}-${p}`} className="kz-ws-cell" />
          ))}
        </>
      ))}
    </div>
  );
}
```

Notes for the subagent:
- The `useNavigate`, `useSearch`, `useSchoolClasses`, `useSubjects`, `useRooms`, `useLessons`, `useWeekSchemeDetail` imports must point at the real exports in the repo. If `useWeekSchemeDetail(schemeId: string)` requires a non-undefined argument, wrap it behind a conditional or add an `enabled` guard; do not pass `undefined` into it if its types reject that.
- The `onCreate` prop on `EmptyState` is synchronous. Wrap `runGenerate` in `() => void runGenerate()` if the TypeScript signature rejects `Promise<void>`.
- Replace `SkeletonGrid`'s fragmenting `<>` with an explicit `Fragment key={...}` if Biome's `noArrayIndexKey` or `useUniqueElementIds` flags it.
- Biome may flag the `ScheduleStatus` key `${v.lesson_id}:${v.hour_index}:${idx}` as using an index; idx is only a disambiguator when the same (lesson, hour) repeats. If Biome rejects, fold idx into the preceding composite key without a trailing index: `${v.lesson_id}:${v.hour_index}:${v.kind}` is also stable.
- `toast.success` / `toast.error` uses `sonner`, already imported elsewhere.

- [ ] **Step 14: Confirm page tests pass**

Run:
```bash
cd frontend && mise exec -- pnpm vitest run src/features/schedule/schedule-page.test.tsx
```
Expected: all three tests pass. If the test harness complains about missing seed names, reconcile seed names with the actual exports in `tests/msw-handlers.ts` and update the imports in `schedule-page.test.tsx` without inventing new seed data.

- [ ] **Step 15: Add the route file**

Create `frontend/src/routes/_authed.schedule.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { SchedulePage } from "@/features/schedule/schedule-page";

const scheduleSearchSchema = z.object({
  class: z.string().min(1).optional(),
});

export const Route = createFileRoute("/_authed/schedule")({
  component: SchedulePage,
  validateSearch: scheduleSearchSchema,
});
```

- [ ] **Step 16: Build so TanStack Router regenerates the route tree**

Run:
```bash
mise exec -- pnpm -C frontend build
```
Expected: build succeeds and `frontend/src/routeTree.gen.ts` now contains the `/schedule` route. That file is gitignored and does not ship in the commit; it is rebuilt in CI.

- [ ] **Step 17: Add the sidebar nav entry and crumb branch**

Edit `frontend/src/components/app-sidebar.tsx`. Extend the `NavLabelKey` union and `NAV_GROUPS`:

```tsx
import {
  BookOpen,
  Calendar,
  CalendarDays,
  ClipboardList,
  DoorOpen,
  GraduationCap,
  Layers,
  LayoutDashboard,
  LogOut,
  type LucideIcon,
  PanelLeft,
  Users,
} from "lucide-react";

// ...

type NavLabelKey =
  | "nav.dashboard"
  | "nav.schedule"
  | "nav.subjects"
  | "nav.rooms"
  | "nav.teachers"
  | "nav.weekSchemes"
  | "sidebar.schoolClasses"
  | "sidebar.stundentafeln"
  | "sidebar.lessons";

// ...

const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: "sidebar.main",
    items: [
      { to: "/", labelKey: "nav.dashboard", icon: LayoutDashboard },
      { to: "/schedule", labelKey: "nav.schedule", icon: Calendar },
    ],
  },
  // ... existing data group unchanged
];
```

Edit `frontend/src/components/layout/app-shell.tsx`'s `currentCrumbKey`:

```tsx
function currentCrumbKey(pathname: string) {
  if (pathname.startsWith("/schedule")) return "nav.schedule";
  if (pathname.startsWith("/subjects")) return "nav.subjects";
  // ... rest unchanged
}
```

- [ ] **Step 18: Run the full frontend test suite**

Run:
```bash
mise run fe:test
```
Expected: all tests pass, including new schedule tests.

- [ ] **Step 19: Typecheck and lint**

Run:
```bash
cd frontend && mise exec -- pnpm exec tsc --noEmit
cd frontend && mise exec -- pnpm lint
```
Expected: exit 0 for both.

- [ ] **Step 20: Browser smoke test (dev server)**

Start the dev server (backend + frontend) and drive the page manually. The frontend CLAUDE.md requires a browser verification for behaviour-changing UI work:

Run in two separate terminals (or background one):
```bash
mise run dev
mise run fe:dev
```

Visit `http://localhost:5173/schedule` in a browser:

1. Log in as the seeded admin if needed.
2. Observe "Pick a class" empty state with disabled Generate button.
3. Select a class from the picker; observe the empty state or grid depending on data.
4. Click Generate; observe the mutation runs (button shows "Saving…") and the grid populates after success.
5. Click Generate again; observe the replace banner; confirm Generate; observe the grid updates.
6. Navigate away and back; observe the GET-only state (no typed violations, derived counter if applicable).

Report any visual oddities in the subagent summary. Do NOT commit yet.

- [ ] **Step 21: Report to the main session for review and commit**

Main session reviews the diff, verifies the browser smoke outcome in the subagent report, and commits:

```bash
git add frontend/src/features/schedule/ frontend/src/routes/_authed.schedule.tsx frontend/src/components/app-sidebar.tsx frontend/src/components/layout/app-shell.tsx frontend/src/i18n/locales/en.json frontend/src/i18n/locales/de.json
git commit -m "feat(frontend): add schedule view with class picker and grid"
```

---

## Task 4: Close sprint step 1 in OPEN_THINGS and file follow-ups

**Files:**
- Modify: `docs/superpowers/OPEN_THINGS.md`

- [ ] **Step 1: Remove the closed sprint step**

In `docs/superpowers/OPEN_THINGS.md`, the "Prototype sprint" section lists three remaining steps. Step 1 (schedule view) is now shipped. Replace the enumerated list with:

```markdown
Steps 1 (PyO3 binding + `POST /api/classes/{id}/schedule` compute endpoint), 2 (placement persistence: `scheduled_lessons` table, per-class upsert on POST, `GET /api/classes/{id}/schedule`), and 3 (frontend `/schedule` route with class picker, `kz-ws-grid` week grid, and Generate action) shipped. Remaining steps:

1. **Realistic Hessen Grundschule seed.** A one-shot `uv run python -m klassenzeit_backend.seed.demo_grundschule` ...
2. **E2E smoke test.** One Playwright spec that hits `/login`, runs the seed via a test-only endpoint, clicks through generate-lessons + generate-schedule, and asserts the grid renders.
```

Keep the rest of the file untouched.

- [ ] **Step 2: Add follow-ups surfaced by this PR**

Add the following bullets under the existing "Backlog" → "Product capabilities" section, ordered after the existing "Deep-linked entity edit" item (before "Duplicate a Stundentafel"):

```markdown
- **Teacher-centric schedule view.** Today `/schedule` shows one class at a time. A teacher-centric view answers "where is Frau Müller all week" and needs either a new `GET /api/teachers/{id}/schedule` endpoint or frontend aggregation across all classes a teacher has qualifications for. Ship after a demo reveals the need; the per-class view is enough for the prototype.
- **Room-centric schedule view.** Mirror of the teacher view; "what happens in Room 101 all week". Same trade-off, same follow-up timing.
- **Persist violations so `GET /schedule` surfaces them.** Frontend currently shows violations only from the most recent POST response plus a derived `expectedHours - placements.length` counter on GET-only loads. When the schedule view needs a stable "why is this incomplete?" diagnostic across page refreshes, add the `schedule_violations` table already noted under "Acknowledged, not in scope this sprint" and teach the frontend to render typed violations on GET. Today the derived counter is the only cross-refresh signal.
```

- [ ] **Step 3: Verify the edit**

Run:
```bash
grep -n "schedule view in the frontend\|Teacher-centric schedule view\|Room-centric schedule view" docs/superpowers/OPEN_THINGS.md | head -5
```
Expected: the old "schedule view" bullet is gone; both new bullets are present.

- [ ] **Step 4: Report to the main session for review and commit**

Main session commits:

```bash
git add docs/superpowers/OPEN_THINGS.md
git commit -m "docs: close sprint step 1 and log schedule follow-ups"
```

---

## Self-review checklist (main-session ritual after Task 4)

- [ ] **Spec coverage:** Every spec section has a task that implements it (route/nav, hooks, grid, toolbar, status, violations, loading, empty, error, tests, i18n, follow-ups, docs).
- [ ] **Type consistency:** `ScheduleCell`, `Placement`, `Violation`, `SchedulePostResponse`, `ScheduleGetResponse`, `scheduleQueryKey(classId)` names match across hooks and components.
- [ ] **Placeholder scan:** Every step names real files, commands, and code. No TBDs.
- [ ] **Commit split matches spec:** 4 commits in the listed order.
- [ ] **`frontend-design` invoked:** Task 3 step 0 was executed by the subagent; main session's skill audit confirms it.
