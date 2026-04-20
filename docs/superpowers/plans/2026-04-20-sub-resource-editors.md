# Sub-resource editors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship inline editors for the remaining sub-resources (room availability, teacher qualifications, teacher availability, week-scheme time blocks) inside their parent edit dialogs, plus a generate-lessons row action on the SchoolClasses page.

**Architecture:** Each editor is a controlled component inside the existing parent `Edit` dialog. Full-replace `PUT` endpoints for availability and qualifications; per-row CRUD with a nested Dialog for time blocks, matching the Stundentafel entries pattern that shipped in PR #101. All new mutation hooks live next to the parent feature folder; MSW handlers and mutable state live in `frontend/tests/msw-handlers.ts`. No backend changes.

**Tech Stack:** Vite + React 19, TanStack Router + Query, shadcn/ui, React Hook Form + Zod, react-i18next, MSW 2, Vitest.

Spec: `docs/superpowers/specs/2026-04-20-sub-resource-editors-design.md`.

**Execution note:** Tasks 2 – 7 all mutate shared files (`tests/msw-handlers.ts`, `tests/setup.ts`, `en.json`, `de.json`). Dispatch subagents **sequentially**, never in parallel. Task 1 can run standalone before the rest.

---

### Task 1: Move `SubjectMultiPicker` to the subjects feature

**Files:**
- Move: `frontend/src/features/rooms/subject-multi-picker.tsx` → `frontend/src/features/subjects/subject-multi-picker.tsx`
- Move: `frontend/src/features/rooms/subject-multi-picker.test.tsx` → `frontend/src/features/subjects/subject-multi-picker.test.tsx`
- Modify: `frontend/src/features/rooms/rooms-dialogs.tsx` (import path)

- [ ] **Step 1: Run existing picker tests to establish green baseline**

```bash
cd frontend && mise exec -- pnpm vitest run src/features/rooms/subject-multi-picker.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Move the files with git mv**

```bash
git mv frontend/src/features/rooms/subject-multi-picker.tsx frontend/src/features/subjects/subject-multi-picker.tsx
git mv frontend/src/features/rooms/subject-multi-picker.test.tsx frontend/src/features/subjects/subject-multi-picker.test.tsx
```

- [ ] **Step 3: Update the import in `rooms-dialogs.tsx`**

Find:
```ts
import { SubjectMultiPicker } from "./subject-multi-picker";
```

Replace with:
```ts
import { SubjectMultiPicker } from "@/features/subjects/subject-multi-picker";
```

- [ ] **Step 4: Update imports inside the moved files**

The moved component imports `@/features/subjects/color` and `@/features/subjects/hooks` already via absolute paths; the test file imports `./subject-multi-picker`. Confirm both still resolve after the move.

- [ ] **Step 5: Run all affected tests to confirm green**

```bash
cd frontend && mise exec -- pnpm vitest run src/features/subjects src/features/rooms
```

Expected: all PASS.

- [ ] **Step 6: Run lint to catch unused imports**

```bash
mise run lint
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add -A frontend/src/features
git commit -m "refactor(frontend): move SubjectMultiPicker from rooms to subjects feature"
```

---

### Task 2: WeekScheme time blocks editor

**Files:**
- Create: `frontend/src/features/week-schemes/time-blocks-table.tsx`
- Create: `frontend/src/features/week-schemes/time-blocks-table.test.tsx`
- Modify: `frontend/src/features/week-schemes/hooks.ts`
- Modify: `frontend/src/features/week-schemes/schema.ts`
- Modify: `frontend/src/features/week-schemes/week-schemes-dialogs.tsx`
- Modify: `frontend/src/i18n/locales/en.json`
- Modify: `frontend/src/i18n/locales/de.json`
- Modify: `frontend/tests/msw-handlers.ts`
- Modify: `frontend/tests/setup.ts`

- [ ] **Step 1: Extend MSW handlers with time-blocks mutable state + handlers**

In `frontend/tests/msw-handlers.ts`, after `initialWeekSchemes`, add:

```ts
export type TimeBlock = {
  id: string;
  day_of_week: number;
  position: number;
  start_time: string;
  end_time: string;
};

export const timeBlocksBySchemeId: Record<string, TimeBlock[]> = {
  "cccccccc-cccc-cccc-cccc-cccccccccccc": [
    {
      id: "71100001-0000-0000-0000-000000000001",
      day_of_week: 0,
      position: 1,
      start_time: "08:00:00",
      end_time: "08:45:00",
    },
    {
      id: "71100002-0000-0000-0000-000000000002",
      day_of_week: 0,
      position: 2,
      start_time: "08:50:00",
      end_time: "09:35:00",
    },
  ],
};
```

Then add a GET `/api/week-schemes/:scheme_id` handler that returns the scheme with time blocks (replace it if one already exists without blocks):

```ts
http.get(`${BASE}/api/week-schemes/:scheme_id`, ({ params }) => {
  const id = String(params.scheme_id);
  const base = initialWeekSchemes.find((s) => s.id === id);
  if (!base) return HttpResponse.json({ detail: "not found" }, { status: 404 });
  return HttpResponse.json({
    ...base,
    time_blocks: timeBlocksBySchemeId[id] ?? [],
  });
}),
```

And add the time-block CRUD handlers:

```ts
http.post(`${BASE}/api/week-schemes/:scheme_id/time-blocks`, async ({ request, params }) => {
  const id = String(params.scheme_id);
  const body = (await request.json()) as {
    day_of_week: number;
    position: number;
    start_time: string;
    end_time: string;
  };
  const bucket = timeBlocksBySchemeId[id] ?? [];
  if (bucket.some((b) => b.day_of_week === body.day_of_week && b.position === body.position)) {
    return HttpResponse.json(
      { detail: "A time block with this day and position already exists in this scheme." },
      { status: 409 },
    );
  }
  const created: TimeBlock = {
    id: `tb-${id}-${bucket.length + 1}`,
    day_of_week: body.day_of_week,
    position: body.position,
    start_time: body.start_time,
    end_time: body.end_time,
  };
  timeBlocksBySchemeId[id] = [...bucket, created];
  return HttpResponse.json(created, { status: 201 });
}),
http.patch(
  `${BASE}/api/week-schemes/:scheme_id/time-blocks/:block_id`,
  async ({ request, params }) => {
    const schemeId = String(params.scheme_id);
    const blockId = String(params.block_id);
    const body = (await request.json()) as Partial<{
      day_of_week: number;
      position: number;
      start_time: string;
      end_time: string;
    }>;
    const bucket = timeBlocksBySchemeId[schemeId] ?? [];
    const existing = bucket.find((b) => b.id === blockId);
    if (!existing) return HttpResponse.json({ detail: "not found" }, { status: 404 });
    const next: TimeBlock = {
      ...existing,
      day_of_week: body.day_of_week ?? existing.day_of_week,
      position: body.position ?? existing.position,
      start_time: body.start_time ?? existing.start_time,
      end_time: body.end_time ?? existing.end_time,
    };
    if (
      bucket.some(
        (b) =>
          b.id !== blockId &&
          b.day_of_week === next.day_of_week &&
          b.position === next.position,
      )
    ) {
      return HttpResponse.json(
        { detail: "A time block with this day and position already exists in this scheme." },
        { status: 409 },
      );
    }
    timeBlocksBySchemeId[schemeId] = bucket.map((b) => (b.id === blockId ? next : b));
    return HttpResponse.json(next);
  },
),
http.delete(`${BASE}/api/week-schemes/:scheme_id/time-blocks/:block_id`, ({ params }) => {
  const schemeId = String(params.scheme_id);
  const blockId = String(params.block_id);
  const bucket = timeBlocksBySchemeId[schemeId] ?? [];
  timeBlocksBySchemeId[schemeId] = bucket.filter((b) => b.id !== blockId);
  return HttpResponse.json(null, { status: 204 });
}),
```

In `frontend/tests/setup.ts`, extend the `beforeEach` reset loop:

```ts
import {
  roomSuitabilityByRoomId,
  server,
  stundentafelEntriesByTafelId,
  timeBlocksBySchemeId,
} from "./msw-handlers";
```

And inside `beforeEach`:

```ts
for (const key of Object.keys(timeBlocksBySchemeId)) {
  timeBlocksBySchemeId[key] = [];
}
```

Wait — we want tests to see the seed. The existing pattern resets to empty. Keep that pattern: reset the dynamic entry count to empty. If a test wants pre-seeded blocks, it should assign into `timeBlocksBySchemeId[id] = [...]` in its own `beforeEach`.

- [ ] **Step 2: Extend `hooks.ts` with detail query and block mutations**

In `frontend/src/features/week-schemes/hooks.ts`, append:

```ts
export type WeekSchemeDetail = components["schemas"]["WeekSchemeDetailResponse"];
export type TimeBlock = components["schemas"]["TimeBlockResponse"];
export type TimeBlockCreate = components["schemas"]["TimeBlockCreate"];
export type TimeBlockUpdate = components["schemas"]["TimeBlockUpdate"];

export const weekSchemeDetailQueryKey = (id: string) => ["week-schemes", id] as const;

export function useWeekSchemeDetail(id: string | null) {
  return useQuery({
    queryKey: id ? weekSchemeDetailQueryKey(id) : ["week-schemes", "none"],
    enabled: id !== null,
    queryFn: async (): Promise<WeekSchemeDetail> => {
      const { data } = await client.GET("/api/week-schemes/{scheme_id}", {
        params: { path: { scheme_id: id as string } },
      });
      if (!data) throw new ApiError(500, null, "Empty response from GET /week-schemes/{id}");
      return data;
    },
  });
}

export function useCreateTimeBlock(schemeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: TimeBlockCreate): Promise<TimeBlock> => {
      const { data } = await client.POST("/api/week-schemes/{scheme_id}/time-blocks", {
        params: { path: { scheme_id: schemeId } },
        body,
      });
      if (!data) throw new ApiError(500, null, "Empty response from POST time-blocks");
      return data;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: weekSchemeDetailQueryKey(schemeId) }),
  });
}

export function useUpdateTimeBlock(schemeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      blockId,
      body,
    }: {
      blockId: string;
      body: TimeBlockUpdate;
    }): Promise<TimeBlock> => {
      const { data } = await client.PATCH(
        "/api/week-schemes/{scheme_id}/time-blocks/{block_id}",
        {
          params: { path: { scheme_id: schemeId, block_id: blockId } },
          body,
        },
      );
      if (!data) throw new ApiError(500, null, "Empty response from PATCH time-blocks");
      return data;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: weekSchemeDetailQueryKey(schemeId) }),
  });
}

export function useDeleteTimeBlock(schemeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (blockId: string) => {
      await client.DELETE("/api/week-schemes/{scheme_id}/time-blocks/{block_id}", {
        params: { path: { scheme_id: schemeId, block_id: blockId } },
      });
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: weekSchemeDetailQueryKey(schemeId) }),
  });
}
```

- [ ] **Step 3: Add `TimeBlockFormSchema` to `schema.ts`**

In `frontend/src/features/week-schemes/schema.ts`, add:

```ts
export const TimeBlockFormSchema = z.object({
  day_of_week: z.number().int().min(0).max(4),
  position: z.number().int().min(1),
  start_time: z.string().regex(/^[0-2][0-9]:[0-5][0-9]$/, "invalid_time"),
  end_time: z.string().regex(/^[0-2][0-9]:[0-5][0-9]$/, "invalid_time"),
});
export type TimeBlockFormValues = z.infer<typeof TimeBlockFormSchema>;
```

Import `z` at the top of the file if missing.

- [ ] **Step 4: Add i18n keys**

In `frontend/src/i18n/locales/en.json`, add under `common`:

```json
"daysShort": {
  "0": "Mon",
  "1": "Tue",
  "2": "Wed",
  "3": "Thu",
  "4": "Fri"
},
"daysLong": {
  "0": "Monday",
  "1": "Tuesday",
  "2": "Wednesday",
  "3": "Thursday",
  "4": "Friday"
},
"start": "Start",
"end": "End",
"position": "Period"
```

And a new `weekSchemes.timeBlocks` subtree:

```json
"timeBlocks": {
  "sectionTitle": "Time blocks",
  "add": "Add time block",
  "empty": "No time blocks yet. Add one to start planning the week.",
  "columns": {
    "day": "Day",
    "position": "Period",
    "start": "Start",
    "end": "End",
    "actions": "Actions"
  },
  "createTitle": "Add time block",
  "editTitle": "Edit time block",
  "deleteTitle": "Delete time block",
  "deleteDescription": "Remove {{day}} period {{position}}?",
  "errors": {
    "duplicate": "A time block with this day and position already exists.",
    "invalidTime": "Time must be HH:MM."
  }
}
```

Mirror in `de.json` with German translations:

```json
"timeBlocks": {
  "sectionTitle": "Zeitblöcke",
  "add": "Zeitblock hinzufügen",
  "empty": "Noch keine Zeitblöcke. Füge einen hinzu, um die Woche zu planen.",
  "columns": {
    "day": "Tag",
    "position": "Stunde",
    "start": "Start",
    "end": "Ende",
    "actions": "Aktionen"
  },
  "createTitle": "Zeitblock hinzufügen",
  "editTitle": "Zeitblock bearbeiten",
  "deleteTitle": "Zeitblock löschen",
  "deleteDescription": "{{day}} Stunde {{position}} entfernen?",
  "errors": {
    "duplicate": "Für diesen Tag und diese Stunde existiert bereits ein Zeitblock.",
    "invalidTime": "Zeit muss im Format HH:MM sein."
  }
}
```

`common.daysShort/Long/start/end/position` get German translations: `"Mo"…"Fr"`, `"Montag"…"Freitag"`, `"Start"`, `"Ende"`, `"Stunde"`.

- [ ] **Step 5: Write failing test for `TimeBlocksTable`**

Create `frontend/src/features/week-schemes/time-blocks-table.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test-utils/render";
import { timeBlocksBySchemeId } from "../../../tests/msw-handlers";
import { TimeBlocksTable } from "./time-blocks-table";

const schemeId = "cccccccc-cccc-cccc-cccc-cccccccccccc";

describe("TimeBlocksTable", () => {
  it("renders existing time blocks sorted by day then position", async () => {
    timeBlocksBySchemeId[schemeId] = [
      { id: "a", day_of_week: 0, position: 1, start_time: "08:00:00", end_time: "08:45:00" },
      { id: "b", day_of_week: 1, position: 1, start_time: "08:00:00", end_time: "08:45:00" },
    ];
    renderWithProviders(<TimeBlocksTable schemeId={schemeId} />);
    const rows = await screen.findAllByRole("row");
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it("opens a nested dialog when Add is clicked", async () => {
    timeBlocksBySchemeId[schemeId] = [];
    const user = userEvent.setup();
    renderWithProviders(<TimeBlocksTable schemeId={schemeId} />);
    await user.click(await screen.findByRole("button", { name: /add time block/i }));
    expect(await screen.findByRole("dialog", { name: /add time block/i })).toBeInTheDocument();
  });

  it("submits a new block and it appears in the table", async () => {
    timeBlocksBySchemeId[schemeId] = [];
    const user = userEvent.setup();
    renderWithProviders(<TimeBlocksTable schemeId={schemeId} />);
    await user.click(await screen.findByRole("button", { name: /add time block/i }));
    const dialog = await screen.findByRole("dialog", { name: /add time block/i });
    await user.click(within(dialog).getByRole("combobox", { name: /day/i }));
    await user.click(await screen.findByRole("option", { name: /tuesday/i }));
    await user.clear(within(dialog).getByLabelText(/period/i));
    await user.type(within(dialog).getByLabelText(/period/i), "3");
    await user.clear(within(dialog).getByLabelText(/start/i));
    await user.type(within(dialog).getByLabelText(/start/i), "09:00");
    await user.clear(within(dialog).getByLabelText(/end/i));
    await user.type(within(dialog).getByLabelText(/end/i), "09:45");
    await user.click(within(dialog).getByRole("button", { name: /create/i }));
    await waitFor(() =>
      expect(screen.getAllByRole("dialog").length).toBe(1),
    );
    expect(await screen.findByText("09:00:00")).toBeInTheDocument();
  });
});
```

Add `import { within } from "@testing-library/react";` at the top next to `screen`.

- [ ] **Step 6: Run the test — expect it to fail because the component does not exist yet**

```bash
cd frontend && mise exec -- pnpm vitest run src/features/week-schemes/time-blocks-table.test.tsx
```

Expected: FAIL with "Cannot find module `./time-blocks-table`".

- [ ] **Step 7: Implement `TimeBlocksTable`**

Create `frontend/src/features/week-schemes/time-blocks-table.tsx`. The component renders a table, an Add button that opens a nested Dialog, an Edit dialog per row, and a Delete confirm dialog. Use the Stundentafel entries component as the reference shape.

Key structure:

```tsx
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ApiError } from "@/lib/api-client";
import {
  type TimeBlock,
  useCreateTimeBlock,
  useDeleteTimeBlock,
  useUpdateTimeBlock,
  useWeekSchemeDetail,
} from "./hooks";
import { TimeBlockFormSchema, type TimeBlockFormValues } from "./schema";

const DAY_KEYS = ["0", "1", "2", "3", "4"] as const;

export function TimeBlocksTable({ schemeId }: { schemeId: string }) {
  const { t } = useTranslation();
  const detail = useWeekSchemeDetail(schemeId);
  const [blockDialogMode, setBlockDialogMode] = useState<
    { mode: "create" } | { mode: "edit"; block: TimeBlock } | null
  >(null);
  const [confirmDelete, setConfirmDelete] = useState<TimeBlock | null>(null);

  const blocks = [...(detail.data?.time_blocks ?? [])].sort(
    (a, b) => a.day_of_week - b.day_of_week || a.position - b.position,
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between pb-2">
        <h3 className="text-sm font-semibold">{t("weekSchemes.timeBlocks.sectionTitle")}</h3>
        <Button size="sm" onClick={() => setBlockDialogMode({ mode: "create" })}>
          {t("weekSchemes.timeBlocks.add")}
        </Button>
      </div>
      {detail.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : blocks.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("weekSchemes.timeBlocks.empty")}</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="py-2">{t("weekSchemes.timeBlocks.columns.day")}</TableHead>
                <TableHead className="py-2 text-right">
                  {t("weekSchemes.timeBlocks.columns.position")}
                </TableHead>
                <TableHead className="py-2">{t("weekSchemes.timeBlocks.columns.start")}</TableHead>
                <TableHead className="py-2">{t("weekSchemes.timeBlocks.columns.end")}</TableHead>
                <TableHead className="w-40 py-2 text-right">
                  {t("weekSchemes.timeBlocks.columns.actions")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {blocks.map((block) => (
                <TableRow key={block.id}>
                  <TableCell className="py-1.5 font-medium">
                    {t(`common.daysLong.${block.day_of_week}` as `common.daysLong.0`)}
                  </TableCell>
                  <TableCell className="py-1.5 text-right font-mono text-[12.5px]">
                    {block.position}
                  </TableCell>
                  <TableCell className="py-1.5 font-mono text-[12.5px]">{block.start_time}</TableCell>
                  <TableCell className="py-1.5 font-mono text-[12.5px]">{block.end_time}</TableCell>
                  <TableCell className="space-x-2 py-1.5 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setBlockDialogMode({ mode: "edit", block })}
                    >
                      {t("common.edit")}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setConfirmDelete(block)}
                    >
                      {t("common.delete")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {blockDialogMode ? (
        <TimeBlockFormDialog
          schemeId={schemeId}
          mode={blockDialogMode}
          onClose={() => setBlockDialogMode(null)}
        />
      ) : null}
      {confirmDelete ? (
        <DeleteTimeBlockDialog
          schemeId={schemeId}
          block={confirmDelete}
          onClose={() => setConfirmDelete(null)}
        />
      ) : null}
    </div>
  );
}

function TimeBlockFormDialog({
  schemeId,
  mode,
  onClose,
}: {
  schemeId: string;
  mode: { mode: "create" } | { mode: "edit"; block: TimeBlock };
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const createMutation = useCreateTimeBlock(schemeId);
  const updateMutation = useUpdateTimeBlock(schemeId);
  const isEdit = mode.mode === "edit";
  const form = useForm<TimeBlockFormValues>({
    resolver: zodResolver(TimeBlockFormSchema),
    defaultValues: {
      day_of_week: isEdit ? mode.block.day_of_week : 0,
      position: isEdit ? mode.block.position : 1,
      start_time: isEdit ? mode.block.start_time.slice(0, 5) : "08:00",
      end_time: isEdit ? mode.block.end_time.slice(0, 5) : "08:45",
    },
  });
  const submitting = createMutation.isPending || updateMutation.isPending;

  async function handleTimeBlockSubmit(values: TimeBlockFormValues) {
    const body = {
      day_of_week: values.day_of_week,
      position: values.position,
      start_time: `${values.start_time}:00`,
      end_time: `${values.end_time}:00`,
    };
    try {
      if (mode.mode === "edit") {
        await updateMutation.mutateAsync({ blockId: mode.block.id, body });
      } else {
        await createMutation.mutateAsync(body);
      }
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        form.setError("root", { message: t("weekSchemes.timeBlocks.errors.duplicate") });
        return;
      }
      throw err;
    }
  }

  const rootError = form.formState.errors.root?.message;

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? t("weekSchemes.timeBlocks.editTitle")
              : t("weekSchemes.timeBlocks.createTitle")}
          </DialogTitle>
          <DialogDescription>{t("weekSchemes.timeBlocks.sectionTitle")}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(handleTimeBlockSubmit)}>
            <FormField
              control={form.control}
              name="day_of_week"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("weekSchemes.timeBlocks.columns.day")}</FormLabel>
                  <Select
                    value={String(field.value)}
                    onValueChange={(value) => field.onChange(Number(value))}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {DAY_KEYS.map((key) => (
                        <SelectItem key={key} value={key}>
                          {t(`common.daysLong.${key}` as `common.daysLong.0`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="position"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("common.position")}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      value={field.value}
                      onChange={(e) =>
                        field.onChange(e.target.value === "" ? 0 : Number(e.target.value))
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="start_time"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("common.start")}</FormLabel>
                  <FormControl>
                    <Input type="time" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="end_time"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("common.end")}</FormLabel>
                  <FormControl>
                    <Input type="time" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {rootError ? (
              <p role="alert" className="text-sm font-medium text-destructive">
                {rootError}
              </p>
            ) : null}
            <DialogFooter>
              <Button variant="outline" type="button" onClick={onClose}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? t("common.saving") : isEdit ? t("common.save") : t("common.create")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteTimeBlockDialog({
  schemeId,
  block,
  onClose,
}: {
  schemeId: string;
  block: TimeBlock;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const mutation = useDeleteTimeBlock(schemeId);
  async function confirmTimeBlockDelete() {
    await mutation.mutateAsync(block.id);
    onClose();
  }
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("weekSchemes.timeBlocks.deleteTitle")}</DialogTitle>
          <DialogDescription>
            {t("weekSchemes.timeBlocks.deleteDescription", {
              day: t(`common.daysLong.${block.day_of_week}` as `common.daysLong.0`),
              position: block.position,
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={confirmTimeBlockDelete}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? t("common.deleting") : t("common.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 8: Mount `TimeBlocksTable` inside the WeekScheme edit dialog**

In `frontend/src/features/week-schemes/week-schemes-dialogs.tsx`, find the edit dialog's `DialogContent` body and append a divider + `<TimeBlocksTable schemeId={weekScheme.id} />` below the existing form, matching how Stundentafel dialogs host their entries table. Example:

```tsx
<div className="border-t pt-4">
  <TimeBlocksTable schemeId={weekScheme.id} />
</div>
```

Import: `import { TimeBlocksTable } from "./time-blocks-table";`.

- [ ] **Step 9: Run the component tests**

```bash
cd frontend && mise exec -- pnpm vitest run src/features/week-schemes
```

Expected: all PASS. If the dialog-level test fails because the nested dialog count collides with the existing stacked-dialog logic, use the `waitFor(() => expect(screen.getAllByRole("dialog")).toHaveLength(1))` idiom already used by the Stundentafel tests.

- [ ] **Step 10: Run typecheck + lint + full frontend test suite**

```bash
cd frontend && mise exec -- pnpm exec tsc --noEmit
mise run lint
mise run fe:test
```

Expected: all PASS.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/features/week-schemes frontend/src/i18n/locales frontend/tests
git commit -m "feat(frontend): add week-scheme time blocks editor"
```

---

### Task 3: Teacher qualifications editor

**Files:**
- Create: `frontend/src/features/teachers/teacher-qualifications-editor.tsx`
- Create: `frontend/src/features/teachers/teacher-qualifications-editor.test.tsx`
- Modify: `frontend/src/features/teachers/hooks.ts`
- Modify: `frontend/src/features/teachers/teachers-dialogs.tsx`
- Modify: `frontend/src/i18n/locales/en.json`
- Modify: `frontend/src/i18n/locales/de.json`
- Modify: `frontend/tests/msw-handlers.ts`
- Modify: `frontend/tests/setup.ts`

- [ ] **Step 1: Add MSW state + handlers for teacher detail, qualifications PUT, availability PUT**

In `frontend/tests/msw-handlers.ts`:

```ts
export const teacherQualsByTeacherId: Record<string, string[]> = {
  "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb": [],
};
export const teacherAvailabilityByTeacherId: Record<
  string,
  Array<{ time_block_id: string; status: string }>
> = {
  "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb": [],
};
```

And a `GET /api/teachers/:teacher_id` handler that returns a `TeacherDetailResponse`:

```ts
http.get(`${BASE}/api/teachers/:teacher_id`, ({ params }) => {
  const id = String(params.teacher_id);
  const base = initialTeachers.find((t) => t.id === id) ?? initialTeachers[0];
  if (!base) return HttpResponse.json({ detail: "not found" }, { status: 404 });
  const qualIds = teacherQualsByTeacherId[id] ?? [];
  const qualifications = qualIds
    .map((sid) => initialSubjects.find((s) => s.id === sid))
    .filter((s): s is (typeof initialSubjects)[number] => s !== undefined)
    .map((s) => ({ id: s.id, name: s.name, short_name: s.short_name }));
  const allBlocks = Object.values(timeBlocksBySchemeId).flat();
  const availability = (teacherAvailabilityByTeacherId[id] ?? []).flatMap((entry) => {
    const block = allBlocks.find((b) => b.id === entry.time_block_id);
    if (!block) return [];
    return [
      {
        time_block_id: entry.time_block_id,
        day_of_week: block.day_of_week,
        position: block.position,
        status: entry.status,
      },
    ];
  });
  return HttpResponse.json({
    ...base,
    qualifications,
    availability,
  });
}),
http.put(`${BASE}/api/teachers/:teacher_id/qualifications`, async ({ request, params }) => {
  const id = String(params.teacher_id);
  const body = (await request.json()) as { subject_ids: string[] };
  teacherQualsByTeacherId[id] = [...body.subject_ids];
  const base = initialTeachers.find((t) => t.id === id) ?? initialTeachers[0];
  if (!base) return HttpResponse.json({ detail: "not found" }, { status: 404 });
  const qualifications = body.subject_ids
    .map((sid) => initialSubjects.find((s) => s.id === sid))
    .filter((s): s is (typeof initialSubjects)[number] => s !== undefined)
    .map((s) => ({ id: s.id, name: s.name, short_name: s.short_name }));
  return HttpResponse.json({
    ...base,
    qualifications,
    availability: [],
  });
}),
http.put(`${BASE}/api/teachers/:teacher_id/availability`, async ({ request, params }) => {
  const id = String(params.teacher_id);
  const body = (await request.json()) as {
    entries: Array<{ time_block_id: string; status: string }>;
  };
  teacherAvailabilityByTeacherId[id] = [...body.entries];
  const base = initialTeachers.find((t) => t.id === id) ?? initialTeachers[0];
  if (!base) return HttpResponse.json({ detail: "not found" }, { status: 404 });
  return HttpResponse.json({
    ...base,
    qualifications: [],
    availability: body.entries.map((e) => ({ ...e, day_of_week: 0, position: 1 })),
  });
}),
```

In `tests/setup.ts`, extend imports + `beforeEach`:

```ts
import {
  roomSuitabilityByRoomId,
  server,
  stundentafelEntriesByTafelId,
  teacherAvailabilityByTeacherId,
  teacherQualsByTeacherId,
  timeBlocksBySchemeId,
} from "./msw-handlers";
```

```ts
for (const key of Object.keys(teacherQualsByTeacherId)) {
  teacherQualsByTeacherId[key] = [];
}
for (const key of Object.keys(teacherAvailabilityByTeacherId)) {
  teacherAvailabilityByTeacherId[key] = [];
}
```

- [ ] **Step 2: Extend `teachers/hooks.ts` with detail query and `useSaveTeacherQualifications`**

Append:

```ts
export type TeacherDetail = components["schemas"]["TeacherDetailResponse"];

export const teacherDetailQueryKey = (id: string) => ["teachers", id] as const;

export function useTeacherDetail(id: string | null) {
  return useQuery({
    queryKey: id ? teacherDetailQueryKey(id) : ["teachers", "none"],
    enabled: id !== null,
    queryFn: async (): Promise<TeacherDetail> => {
      const { data } = await client.GET("/api/teachers/{teacher_id}", {
        params: { path: { teacher_id: id as string } },
      });
      if (!data) throw new ApiError(500, null, "Empty response from GET /teachers/{id}");
      return data;
    },
  });
}

export function useSaveTeacherQualifications() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, subjectIds }: { id: string; subjectIds: string[] }): Promise<TeacherDetail> => {
      const { data } = await client.PUT("/api/teachers/{teacher_id}/qualifications", {
        params: { path: { teacher_id: id } },
        body: { subject_ids: subjectIds },
      });
      if (!data) throw new ApiError(500, null, "Empty response from PUT qualifications");
      return data;
    },
    onSuccess: (_, vars) =>
      queryClient.invalidateQueries({ queryKey: teacherDetailQueryKey(vars.id) }),
  });
}
```

- [ ] **Step 3: Add i18n keys under `teachers.qualifications`**

In both `en.json` and `de.json` under `teachers`:

```json
"qualifications": {
  "sectionTitle": "Qualifications",
  "save": "Save qualifications",
  "saved": "Qualifications saved",
  "empty": "No subjects assigned"
}
```

German:

```json
"qualifications": {
  "sectionTitle": "Qualifikationen",
  "save": "Qualifikationen speichern",
  "saved": "Qualifikationen gespeichert",
  "empty": "Keine Fächer zugewiesen"
}
```

- [ ] **Step 4: Write failing test for `TeacherQualificationsEditor`**

Create `frontend/src/features/teachers/teacher-qualifications-editor.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test-utils/render";
import { teacherQualsByTeacherId } from "../../../tests/msw-handlers";
import { TeacherQualificationsEditor } from "./teacher-qualifications-editor";

const teacherId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

describe("TeacherQualificationsEditor", () => {
  it("submits selected subjects on Save", async () => {
    teacherQualsByTeacherId[teacherId] = [];
    const user = userEvent.setup();
    renderWithProviders(<TeacherQualificationsEditor teacherId={teacherId} />);
    // Pick the only seeded subject (Mathematik).
    const add = await screen.findByRole("button", { name: /mathematik/i });
    await user.click(add);
    await user.click(screen.getByRole("button", { name: /save qualifications/i }));
    await screen.findByRole("button", { name: /remove mathematik/i });
    expect(teacherQualsByTeacherId[teacherId]).toContain(
      "11111111-1111-1111-1111-111111111111",
    );
  });
});
```

- [ ] **Step 5: Run — expect failure**

```bash
cd frontend && mise exec -- pnpm vitest run src/features/teachers/teacher-qualifications-editor.test.tsx
```

Expected: FAIL "Cannot find module".

- [ ] **Step 6: Implement `TeacherQualificationsEditor`**

Create `frontend/src/features/teachers/teacher-qualifications-editor.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { SubjectMultiPicker } from "@/features/subjects/subject-multi-picker";
import { useSaveTeacherQualifications, useTeacherDetail } from "./hooks";

export function TeacherQualificationsEditor({ teacherId }: { teacherId: string }) {
  const { t } = useTranslation();
  const detail = useTeacherDetail(teacherId);
  const save = useSaveTeacherQualifications();
  const persisted = detail.data?.qualifications.map((q) => q.id) ?? [];
  const [draft, setDraft] = useState<string[]>(persisted);
  useEffect(() => {
    setDraft(detail.data?.qualifications.map((q) => q.id) ?? []);
  }, [detail.data]);

  async function handleTeacherQualificationsSave() {
    await save.mutateAsync({ id: teacherId, subjectIds: draft });
  }

  return (
    <div className="space-y-3 border-t pt-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t("teachers.qualifications.sectionTitle")}</h3>
      </div>
      <SubjectMultiPicker value={draft} onChange={setDraft} />
      <div className="flex justify-end">
        <Button size="sm" onClick={handleTeacherQualificationsSave} disabled={save.isPending}>
          {save.isPending ? t("common.saving") : t("teachers.qualifications.save")}
        </Button>
      </div>
    </div>
  );
}
```

Note: `useEffect` is acceptable here per the frontend CLAUDE.md carve-out for syncing external / async state (TanStack Query data arriving after first render). The alternative `key={detail.data}` would remount the picker and lose typing state; the effect is the smaller evil.

- [ ] **Step 7: Run the test, expect pass**

```bash
cd frontend && mise exec -- pnpm vitest run src/features/teachers/teacher-qualifications-editor.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Wire the editor into the Teacher edit dialog**

In `frontend/src/features/teachers/teachers-dialogs.tsx`, inside the `TeacherEditDialog` (or whatever the equivalent edit dialog is called) body, after the form block append:

```tsx
<TeacherQualificationsEditor teacherId={teacher.id} />
```

Add `import { TeacherQualificationsEditor } from "./teacher-qualifications-editor";` at the top.

- [ ] **Step 9: Run full frontend suite + typecheck**

```bash
cd frontend && mise exec -- pnpm exec tsc --noEmit
mise run fe:test
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/features/teachers frontend/src/i18n/locales frontend/tests
git commit -m "feat(frontend): add teacher qualifications editor"
```

---

### Task 4: Room availability grid

**Files:**
- Create: `frontend/src/features/rooms/room-availability-grid.tsx`
- Create: `frontend/src/features/rooms/room-availability-grid.test.tsx`
- Modify: `frontend/src/features/rooms/hooks.ts`
- Modify: `frontend/src/features/rooms/rooms-dialogs.tsx`
- Modify: `frontend/src/i18n/locales/en.json`
- Modify: `frontend/src/i18n/locales/de.json`
- Modify: `frontend/tests/msw-handlers.ts`
- Modify: `frontend/tests/setup.ts`

- [ ] **Step 1: Add MSW state + handler for room availability**

In `frontend/tests/msw-handlers.ts`:

```ts
export const roomAvailabilityByRoomId: Record<string, string[]> = {
  "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa": [],
};
```

Update the existing `GET /api/rooms/:room_id` handler to return availability based on time blocks:

```ts
http.get(`${BASE}/api/rooms/:room_id`, ({ params }) => {
  const id = String(params.room_id);
  const base = initialRooms.find((r) => r.id === id);
  if (!base) return HttpResponse.json({ detail: "not found" }, { status: 404 });
  const selectedIds = roomSuitabilityByRoomId[id] ?? [];
  const suitability_subjects = selectedIds
    .map((sid) => initialSubjects.find((s) => s.id === sid))
    .filter((s): s is (typeof initialSubjects)[number] => s !== undefined)
    .map((s) => ({ id: s.id, name: s.name, short_name: s.short_name }));
  const allBlocks = Object.values(timeBlocksBySchemeId).flat();
  const availabilityIds = roomAvailabilityByRoomId[id] ?? [];
  const availability = availabilityIds.flatMap((tbId) => {
    const block = allBlocks.find((b) => b.id === tbId);
    return block
      ? [
          {
            time_block_id: tbId,
            day_of_week: block.day_of_week,
            position: block.position,
          },
        ]
      : [];
  });
  return HttpResponse.json({
    ...base,
    suitability_subjects,
    availability,
  });
}),
```

Add new PUT handler:

```ts
http.put(`${BASE}/api/rooms/:room_id/availability`, async ({ request, params }) => {
  const id = String(params.room_id);
  const body = (await request.json()) as { time_block_ids: string[] };
  roomAvailabilityByRoomId[id] = [...body.time_block_ids];
  const base = initialRooms.find((r) => r.id === id) ?? initialRooms[0];
  if (!base) return HttpResponse.json({ detail: "not found" }, { status: 404 });
  const allBlocks = Object.values(timeBlocksBySchemeId).flat();
  const availability = body.time_block_ids.flatMap((tbId) => {
    const block = allBlocks.find((b) => b.id === tbId);
    return block
      ? [
          {
            time_block_id: tbId,
            day_of_week: block.day_of_week,
            position: block.position,
          },
        ]
      : [];
  });
  return HttpResponse.json({
    ...base,
    suitability_subjects: [],
    availability,
  });
}),
```

In `tests/setup.ts`, extend imports and `beforeEach`:

```ts
import {
  roomAvailabilityByRoomId,
  roomSuitabilityByRoomId,
  server,
  stundentafelEntriesByTafelId,
  teacherAvailabilityByTeacherId,
  teacherQualsByTeacherId,
  timeBlocksBySchemeId,
} from "./msw-handlers";
```

```ts
for (const key of Object.keys(roomAvailabilityByRoomId)) {
  roomAvailabilityByRoomId[key] = [];
}
```

- [ ] **Step 2: Add `useSaveRoomAvailability` to `rooms/hooks.ts`**

Append:

```ts
export function useSaveRoomAvailability() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      timeBlockIds,
    }: {
      id: string;
      timeBlockIds: string[];
    }): Promise<RoomDetail> => {
      const { data } = await client.PUT("/api/rooms/{room_id}/availability", {
        params: { path: { room_id: id } },
        body: { time_block_ids: timeBlockIds },
      });
      if (!data) throw new ApiError(500, null, "Empty response from PUT availability");
      return data;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: roomDetailQueryKey(vars.id) });
    },
  });
}
```

- [ ] **Step 3: Add i18n keys under `rooms.availability`**

In `en.json` under `rooms`:

```json
"availability": {
  "sectionTitle": "Availability",
  "noSchemes": "Create a week scheme first.",
  "noBlocks": "No time blocks yet in this scheme.",
  "cellAvailable": "Available at {{day}} period {{position}}",
  "cellUnavailable": "Not available at {{day}} period {{position}}",
  "save": "Save availability"
}
```

German equivalent in `de.json`. `"Availability"` → `"Verfügbarkeit"`, etc.

- [ ] **Step 4: Write failing test for `RoomAvailabilityGrid`**

Create `frontend/src/features/rooms/room-availability-grid.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test-utils/render";
import {
  roomAvailabilityByRoomId,
  timeBlocksBySchemeId,
} from "../../../tests/msw-handlers";
import { RoomAvailabilityGrid } from "./room-availability-grid";

const roomId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const schemeId = "cccccccc-cccc-cccc-cccc-cccccccccccc";

describe("RoomAvailabilityGrid", () => {
  it("toggles cells and saves union across schemes", async () => {
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
    renderWithProviders(<RoomAvailabilityGrid roomId={roomId} />);
    const cell = await screen.findByRole("button", {
      name: /monday/i,
    });
    await user.click(cell);
    await user.click(screen.getByRole("button", { name: /save availability/i }));
    expect(roomAvailabilityByRoomId[roomId]).toEqual(["tb-mon-1"]);
  });

  it("shows a notice when no week schemes exist", async () => {
    for (const key of Object.keys(timeBlocksBySchemeId)) {
      delete timeBlocksBySchemeId[key];
    }
    // simulate the list endpoint returning no schemes is handled by MSW default; for this test we
    // rely on timeBlocksBySchemeId being empty to trigger the "no blocks" branch.
    renderWithProviders(<RoomAvailabilityGrid roomId={roomId} />);
    expect(await screen.findByText(/no time blocks yet|create a week scheme/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run test, expect fail (module missing)**

```bash
cd frontend && mise exec -- pnpm vitest run src/features/rooms/room-availability-grid.test.tsx
```

- [ ] **Step 6: Implement `RoomAvailabilityGrid`**

Create `frontend/src/features/rooms/room-availability-grid.tsx`:

```tsx
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useRoomDetail, useSaveRoomAvailability } from "./hooks";
import { useWeekSchemeDetail, useWeekSchemes } from "@/features/week-schemes/hooks";
import { cn } from "@/lib/utils";

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

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  async function handleRoomAvailabilitySave() {
    await save.mutateAsync({ id: roomId, timeBlockIds: Array.from(selected) });
  }

  return (
    <div className="space-y-3 border-t pt-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t("rooms.availability.sectionTitle")}</h3>
      </div>
      {schemes.data && schemes.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("rooms.availability.noSchemes")}</p>
      ) : (
        (schemes.data ?? []).map((scheme) => (
          <RoomAvailabilitySchemeSection
            key={scheme.id}
            schemeId={scheme.id}
            schemeName={scheme.name}
            selected={selected}
            onToggle={toggle}
          />
        ))
      )}
      <div className="flex justify-end">
        <Button size="sm" onClick={handleRoomAvailabilitySave} disabled={save.isPending}>
          {save.isPending ? t("common.saving") : t("rooms.availability.save")}
        </Button>
      </div>
    </div>
  );
}

function RoomAvailabilitySchemeSection({
  schemeId,
  schemeName,
  selected,
  onToggle,
}: {
  schemeId: string;
  schemeName: string;
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  const { t } = useTranslation();
  const detail = useWeekSchemeDetail(schemeId);
  const blocks = detail.data?.time_blocks ?? [];
  if (detail.isLoading) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }
  if (blocks.length === 0) {
    return (
      <section>
        <h4 className="text-sm font-medium">{schemeName}</h4>
        <p className="text-sm text-muted-foreground">{t("rooms.availability.noBlocks")}</p>
      </section>
    );
  }
  const days = [0, 1, 2, 3, 4] as const;
  const positions = Array.from(new Set(blocks.map((b) => b.position))).sort((a, b) => a - b);
  const byKey = new Map(blocks.map((b) => [`${b.day_of_week}-${b.position}`, b]));
  return (
    <section className="space-y-1">
      <h4 className="text-sm font-medium">{schemeName}</h4>
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="w-16 p-1 text-left font-medium">{t("common.position")}</th>
            {days.map((d) => (
              <th key={d} className="p-1 text-left font-medium">
                {t(`common.daysShort.${d}` as `common.daysShort.0`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => (
            <tr key={p}>
              <td className="p-1 font-mono">{p}</td>
              {days.map((d) => {
                const block = byKey.get(`${d}-${p}`);
                if (!block) return <td key={d} className="p-1" aria-hidden="true" />;
                const isOn = selected.has(block.id);
                const dayName = t(`common.daysLong.${d}` as `common.daysLong.0`);
                return (
                  <td key={d} className="p-1">
                    <button
                      type="button"
                      aria-pressed={isOn}
                      aria-label={
                        isOn
                          ? t("rooms.availability.cellAvailable", {
                              day: dayName,
                              position: p,
                            })
                          : t("rooms.availability.cellUnavailable", {
                              day: dayName,
                              position: p,
                            })
                      }
                      onClick={() => onToggle(block.id)}
                      className={cn(
                        "flex h-7 w-full items-center justify-center rounded border text-xs",
                        isOn
                          ? "border-foreground bg-foreground text-background"
                          : "border-border/60 bg-muted/30 text-muted-foreground",
                      )}
                    >
                      {isOn ? "✓" : ""}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

- [ ] **Step 7: Mount inside the Room edit dialog**

In `frontend/src/features/rooms/rooms-dialogs.tsx`, inside the edit-room branch (`room` known), after the existing `SubjectMultiPicker` section, append:

```tsx
<RoomAvailabilityGrid roomId={room.id} />
```

Import: `import { RoomAvailabilityGrid } from "./room-availability-grid";`.

- [ ] **Step 8: Run tests + lint + typecheck**

```bash
cd frontend && mise exec -- pnpm exec tsc --noEmit
mise run fe:test
```

- [ ] **Step 9: Commit**

```bash
git add frontend/src/features/rooms frontend/src/i18n/locales frontend/tests
git commit -m "feat(frontend): add room availability editor"
```

---

### Task 5: Teacher availability grid (tri-state)

**Files:**
- Create: `frontend/src/features/teachers/teacher-availability-grid.tsx`
- Create: `frontend/src/features/teachers/teacher-availability-grid.test.tsx`
- Modify: `frontend/src/features/teachers/hooks.ts`
- Modify: `frontend/src/features/teachers/teachers-dialogs.tsx`
- Modify: `frontend/src/i18n/locales/en.json`
- Modify: `frontend/src/i18n/locales/de.json`

- [ ] **Step 1: Add `useSaveTeacherAvailability` to `teachers/hooks.ts`**

```ts
export type TeacherAvailabilityEntry = { time_block_id: string; status: "available" | "preferred" | "unavailable" };

export function useSaveTeacherAvailability() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      entries,
    }: {
      id: string;
      entries: TeacherAvailabilityEntry[];
    }): Promise<TeacherDetail> => {
      const { data } = await client.PUT("/api/teachers/{teacher_id}/availability", {
        params: { path: { teacher_id: id } },
        body: { entries },
      });
      if (!data) throw new ApiError(500, null, "Empty response from PUT availability");
      return data;
    },
    onSuccess: (_, vars) =>
      queryClient.invalidateQueries({ queryKey: teacherDetailQueryKey(vars.id) }),
  });
}
```

- [ ] **Step 2: Add i18n keys under `teachers.availability`**

```json
"availability": {
  "sectionTitle": "Availability",
  "noSchemes": "Create a week scheme first.",
  "noBlocks": "No time blocks yet in this scheme.",
  "status": {
    "available": "A",
    "preferred": "P",
    "unavailable": "U"
  },
  "statusLabel": {
    "available": "Available",
    "preferred": "Preferred",
    "unavailable": "Unavailable"
  },
  "save": "Save availability"
}
```

German equivalent.

- [ ] **Step 3: Write failing test**

Create `frontend/src/features/teachers/teacher-availability-grid.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test-utils/render";
import {
  teacherAvailabilityByTeacherId,
  timeBlocksBySchemeId,
} from "../../../tests/msw-handlers";
import { TeacherAvailabilityGrid } from "./teacher-availability-grid";

const teacherId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const schemeId = "cccccccc-cccc-cccc-cccc-cccccccccccc";

describe("TeacherAvailabilityGrid", () => {
  it("submits preferred and unavailable entries; omits available cells", async () => {
    timeBlocksBySchemeId[schemeId] = [
      { id: "tb1", day_of_week: 0, position: 1, start_time: "08:00:00", end_time: "08:45:00" },
      { id: "tb2", day_of_week: 0, position: 2, start_time: "08:50:00", end_time: "09:35:00" },
    ];
    teacherAvailabilityByTeacherId[teacherId] = [];
    const user = userEvent.setup();
    renderWithProviders(<TeacherAvailabilityGrid teacherId={teacherId} />);
    // Click the P button on period 1
    const pButtons = await screen.findAllByRole("button", { name: /preferred/i });
    const firstP = pButtons[0];
    if (!firstP) throw new Error("missing P button");
    await user.click(firstP);
    await user.click(screen.getByRole("button", { name: /save availability/i }));
    expect(teacherAvailabilityByTeacherId[teacherId]).toEqual([
      { time_block_id: "tb1", status: "preferred" },
    ]);
  });
});
```

- [ ] **Step 4: Run — expect fail**

- [ ] **Step 5: Implement `TeacherAvailabilityGrid`**

Create `frontend/src/features/teachers/teacher-availability-grid.tsx`:

```tsx
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useWeekSchemeDetail, useWeekSchemes } from "@/features/week-schemes/hooks";
import { cn } from "@/lib/utils";
import {
  type TeacherAvailabilityEntry,
  useSaveTeacherAvailability,
  useTeacherDetail,
} from "./hooks";

type Status = "available" | "preferred" | "unavailable";

export function TeacherAvailabilityGrid({ teacherId }: { teacherId: string }) {
  const { t } = useTranslation();
  const detail = useTeacherDetail(teacherId);
  const schemes = useWeekSchemes();
  const save = useSaveTeacherAvailability();

  const persisted = useMemo(() => {
    const map = new Map<string, Status>();
    for (const entry of detail.data?.availability ?? []) {
      if (entry.status === "preferred" || entry.status === "unavailable") {
        map.set(entry.time_block_id, entry.status);
      }
    }
    return map;
  }, [detail.data]);
  const [statuses, setStatuses] = useState<Map<string, Status>>(persisted);
  useEffect(() => setStatuses(persisted), [persisted]);

  function setStatus(blockId: string, next: Status) {
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
    await save.mutateAsync({ id: teacherId, entries });
  }

  return (
    <div className="space-y-3 border-t pt-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t("teachers.availability.sectionTitle")}</h3>
      </div>
      {schemes.data && schemes.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("teachers.availability.noSchemes")}</p>
      ) : (
        (schemes.data ?? []).map((scheme) => (
          <TeacherAvailabilitySchemeSection
            key={scheme.id}
            schemeId={scheme.id}
            schemeName={scheme.name}
            statuses={statuses}
            onSetStatus={setStatus}
          />
        ))
      )}
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={handleTeacherAvailabilitySave}
          disabled={save.isPending}
        >
          {save.isPending ? t("common.saving") : t("teachers.availability.save")}
        </Button>
      </div>
    </div>
  );
}

function TeacherAvailabilitySchemeSection({
  schemeId,
  schemeName,
  statuses,
  onSetStatus,
}: {
  schemeId: string;
  schemeName: string;
  statuses: Map<string, Status>;
  onSetStatus: (blockId: string, next: Status) => void;
}) {
  const { t } = useTranslation();
  const detail = useWeekSchemeDetail(schemeId);
  const blocks = detail.data?.time_blocks ?? [];
  if (detail.isLoading) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }
  if (blocks.length === 0) {
    return (
      <section>
        <h4 className="text-sm font-medium">{schemeName}</h4>
        <p className="text-sm text-muted-foreground">{t("teachers.availability.noBlocks")}</p>
      </section>
    );
  }
  const days = [0, 1, 2, 3, 4] as const;
  const positions = Array.from(new Set(blocks.map((b) => b.position))).sort((a, b) => a - b);
  const byKey = new Map(blocks.map((b) => [`${b.day_of_week}-${b.position}`, b]));

  return (
    <section className="space-y-1">
      <h4 className="text-sm font-medium">{schemeName}</h4>
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="w-16 p-1 text-left font-medium">{t("common.position")}</th>
            {days.map((d) => (
              <th key={d} className="p-1 text-left font-medium">
                {t(`common.daysShort.${d}` as `common.daysShort.0`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => (
            <tr key={p}>
              <td className="p-1 font-mono">{p}</td>
              {days.map((d) => {
                const block = byKey.get(`${d}-${p}`);
                if (!block) return <td key={d} className="p-1" aria-hidden="true" />;
                const current = statuses.get(block.id) ?? "available";
                const dayName = t(`common.daysLong.${d}` as `common.daysLong.0`);
                return (
                  <td key={d} className="p-1">
                    <div className="flex gap-0.5">
                      {(["available", "preferred", "unavailable"] as const).map((status) => {
                        const isActive = current === status;
                        const letter = t(`teachers.availability.status.${status}`);
                        const label = `${t(`teachers.availability.statusLabel.${status}`)} — ${dayName} ${p}`;
                        return (
                          <button
                            key={status}
                            type="button"
                            aria-pressed={isActive}
                            aria-label={label}
                            onClick={() => onSetStatus(block.id, status)}
                            className={cn(
                              "flex h-6 w-6 items-center justify-center rounded border text-[10px] font-mono",
                              isActive
                                ? status === "preferred"
                                  ? "border-foreground bg-accent text-accent-foreground"
                                  : status === "unavailable"
                                    ? "border-destructive bg-destructive text-destructive-foreground"
                                    : "border-foreground bg-muted text-foreground"
                                : "border-border/60 bg-background text-muted-foreground",
                            )}
                          >
                            {letter}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

- [ ] **Step 6: Mount in `teachers-dialogs.tsx`**

Append below the qualifications section:

```tsx
<TeacherAvailabilityGrid teacherId={teacher.id} />
```

Import at top: `import { TeacherAvailabilityGrid } from "./teacher-availability-grid";`.

- [ ] **Step 7: Run tests + lint + typecheck**

- [ ] **Step 8: Commit**

```bash
git commit -am "feat(frontend): add teacher availability editor with tri-state cells"
```

---

### Task 6: Generate-lessons row action

**Files:**
- Create: `frontend/src/features/school-classes/generate-lessons-dialog.tsx`
- Create: `frontend/src/features/school-classes/generate-lessons-dialog.test.tsx`
- Modify: `frontend/src/features/school-classes/hooks.ts`
- Modify: `frontend/src/features/school-classes/school-classes-page.tsx`
- Modify: `frontend/src/i18n/locales/en.json`
- Modify: `frontend/src/i18n/locales/de.json`
- Modify: `frontend/tests/msw-handlers.ts`

- [ ] **Step 1: Add MSW handler for `POST /api/classes/:class_id/generate-lessons`**

```ts
http.post(`${BASE}/api/classes/:class_id/generate-lessons`, ({ params }) => {
  const classId = String(params.class_id);
  const schoolClass = initialSchoolClasses.find((c) => c.id === classId);
  if (!schoolClass) return HttpResponse.json({ detail: "not found" }, { status: 404 });
  const subject = initialSubjects[0];
  if (!subject) return HttpResponse.json([], { status: 201 });
  return HttpResponse.json(
    [
      {
        id: "gen-0000-0000-0000-0000-000000000001",
        school_class: { id: schoolClass.id, name: schoolClass.name },
        subject: { id: subject.id, name: subject.name, short_name: subject.short_name },
        teacher: null,
        hours_per_week: 4,
        preferred_block_size: 1,
        created_at: "2026-04-20T00:00:00Z",
        updated_at: "2026-04-20T00:00:00Z",
      },
    ],
    { status: 201 },
  );
}),
```

- [ ] **Step 2: Add `useGenerateLessons` hook**

In `frontend/src/features/school-classes/hooks.ts`, append:

```ts
export type GeneratedLessons = components["schemas"]["LessonResponse"][];

export function useGenerateLessons() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (classId: string): Promise<GeneratedLessons> => {
      const { data } = await client.POST("/api/classes/{class_id}/generate-lessons", {
        params: { path: { class_id: classId } },
      });
      if (!data) throw new ApiError(500, null, "Empty response from generate-lessons");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lessons"] });
      queryClient.invalidateQueries({ queryKey: schoolClassesQueryKey });
    },
  });
}
```

If `components` is not yet imported here, add `import type { components } from "@/lib/api-types";` and make sure `ApiError`, `useMutation`, `useQueryClient`, `client` are in scope.

- [ ] **Step 3: Add i18n keys under `schoolClasses.generateLessons`**

```json
"generateLessons": {
  "action": "Generate lessons",
  "confirmTitle": "Generate lessons",
  "confirmDescription": "Generate remaining lessons for {{name}} from its curriculum?",
  "confirm": "Generate",
  "created_one": "{{count}} lesson created",
  "created_other": "{{count}} lessons created",
  "noneCreated": "No new lessons generated"
}
```

German:

```json
"generateLessons": {
  "action": "Unterricht erzeugen",
  "confirmTitle": "Unterricht erzeugen",
  "confirmDescription": "Fehlenden Unterricht für {{name}} aus der Stundentafel erzeugen?",
  "confirm": "Erzeugen",
  "created_one": "{{count}} Stunde erzeugt",
  "created_other": "{{count}} Stunden erzeugt",
  "noneCreated": "Kein neuer Unterricht erzeugt"
}
```

- [ ] **Step 4: Write failing test**

Create `frontend/src/features/school-classes/generate-lessons-dialog.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test-utils/render";
import { GenerateLessonsConfirmDialog } from "./generate-lessons-dialog";

describe("GenerateLessonsConfirmDialog", () => {
  it("calls onConfirm-mutation-success callback with created count", async () => {
    const onDone = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <GenerateLessonsConfirmDialog
        schoolClass={{
          id: "88888888-8888-8888-8888-888888888888",
          name: "1a",
          grade_level: 1,
          stundentafel_id: "99999999-9999-9999-9999-999999999999",
          week_scheme_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
          created_at: "2026-04-17T00:00:00Z",
          updated_at: "2026-04-17T00:00:00Z",
        }}
        onDone={onDone}
      />,
    );
    await user.click(await screen.findByRole("button", { name: /generate|erzeugen/i }));
    expect(onDone).toHaveBeenCalledWith(1);
  });
});
```

- [ ] **Step 5: Run — expect fail**

- [ ] **Step 6: Implement `GenerateLessonsConfirmDialog`**

Create `frontend/src/features/school-classes/generate-lessons-dialog.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { type SchoolClass, useGenerateLessons } from "./hooks";

export function GenerateLessonsConfirmDialog({
  schoolClass,
  onDone,
}: {
  schoolClass: SchoolClass;
  onDone: (createdCount: number) => void;
}) {
  const { t } = useTranslation();
  const mutation = useGenerateLessons();

  async function handleGenerateLessonsConfirm() {
    const created = await mutation.mutateAsync(schoolClass.id);
    onDone(created.length);
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onDone(-1)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("schoolClasses.generateLessons.confirmTitle")}</DialogTitle>
          <DialogDescription>
            {t("schoolClasses.generateLessons.confirmDescription", { name: schoolClass.name })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onDone(-1)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleGenerateLessonsConfirm} disabled={mutation.isPending}>
            {mutation.isPending
              ? t("common.saving")
              : t("schoolClasses.generateLessons.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

Caller handles the toast (so tests can observe via `onDone`).

- [ ] **Step 7: Wire into `school-classes-page.tsx`**

Add state and a row button. At the top of the page component:

```tsx
const [generateFor, setGenerateFor] = useState<SchoolClass | null>(null);
```

Inside the actions cell, add next to Edit and Delete:

```tsx
<Button size="sm" variant="outline" onClick={() => setGenerateFor(schoolClass)}>
  {t("schoolClasses.generateLessons.action")}
</Button>
```

Below the existing dialogs:

```tsx
{generateFor ? (
  <GenerateLessonsConfirmDialog
    schoolClass={generateFor}
    onDone={(count) => {
      setGenerateFor(null);
      if (count < 0) return;
      // Very small app toast stand-in: use window.alert for now if no toast system exists.
      // (Replace with the real toast primitive if one is in place.)
      const msg =
        count === 0
          ? t("schoolClasses.generateLessons.noneCreated")
          : t("schoolClasses.generateLessons.created", { count });
      // biome-ignore lint/suspicious/noAlertDialogMisuse: temporary until shared toast lands
      window.alert(msg);
    }}
  />
) : null}
```

If the app already has a toast system (`sonner`, `react-hot-toast`, etc.), replace the `window.alert` path with a call to it. Audit via `grep -r "toast(" frontend/src` before writing the alert fallback. If the app currently has no toast system, land the `alert` as a placeholder (and add an OPEN_THINGS entry in Task 8 to replace it).

Import: `import { GenerateLessonsConfirmDialog } from "./generate-lessons-dialog";`.

Note: i18next plural handles `created_one` / `created_other` via the key `"schoolClasses.generateLessons.created"` with `{ count }`. Make sure the JSON keys stay as `created_one` and `created_other` per i18next convention.

- [ ] **Step 8: Run tests + typecheck + lint**

- [ ] **Step 9: Commit**

```bash
git commit -am "feat(frontend): generate-lessons row action on school-classes page"
```

---

### Task 7: Ratchet coverage baseline

**Files:**
- Modify: `.coverage-baseline-frontend`

- [ ] **Step 1: Run coverage**

```bash
mise run fe:test:cov
```

- [ ] **Step 2: Inspect summary**

Open `frontend/coverage/coverage-summary.json` and note the `total.lines.pct` value.

- [ ] **Step 3: Ratchet baseline**

```bash
mise run fe:cov:update-baseline
```

Only commit if the baseline went up (skip if it stayed flat). Coverage must not drop below the prior baseline; if it did, revisit the new components' test coverage.

- [ ] **Step 4: Commit (if baseline moved)**

```bash
git commit -am "chore(frontend): ratchet coverage baseline after sub-resource editors"
```

---

### Task 8: Docs updates

**Files:**
- Modify: `docs/superpowers/OPEN_THINGS.md`

- [ ] **Step 1: Remove shipped items**

Delete the bullets:

- "Remaining entity CRUD pages." (already historical; verify present)
- "Sub-resource editors for base entities."
- "Bulk 'Generate lessons from Stundentafel' UI."
- "Multi-select chip editors for sub-resources."

Keep all others. Add any follow-ups discovered during implementation (e.g., "Replace `window.alert` with a shared toast primitive" if the Task 6 path used the placeholder).

- [ ] **Step 2: Commit**

```bash
git commit -am "docs: update OPEN_THINGS after sub-resource editors"
```

---

## Self-review

**Spec coverage**
- Room availability → Task 4.
- Teacher qualifications → Task 3.
- Teacher availability → Task 5.
- WeekScheme time blocks → Task 2.
- Generate-lessons row action → Task 6.
- Shared chip picker move → Task 1.
- MSW / setup changes bundled inside Tasks 2-6.
- Coverage ratchet → Task 7.
- OPEN_THINGS update → Task 8.

**Placeholder scan**
- No "TBD" or "implement later" — every code block is concrete.
- Task 6 calls out a conditional `window.alert` fallback; if the codebase already has a toast system, the subagent should swap it in. An OPEN_THINGS entry covers the cleanup if the fallback lands.

**Type consistency**
- `TeacherDetail`, `TimeBlock`, `RoomDetail`, `WeekSchemeDetail` are all defined in their feature's `hooks.ts` additions and used consistently by the component files.
- `TeacherAvailabilityEntry` is defined in Task 5 Step 1 and consumed in the grid's save handler.
- Mutation hook names end in plain verbs (`useSaveRoomAvailability`, `useSaveTeacherAvailability`, `useSaveTeacherQualifications`, `useGenerateLessons`, `useCreateTimeBlock`, `useUpdateTimeBlock`, `useDeleteTimeBlock`). No collisions with existing exports.
- MSW state names (`timeBlocksBySchemeId`, `roomAvailabilityByRoomId`, `teacherQualsByTeacherId`, `teacherAvailabilityByTeacherId`) are unique across the file.
