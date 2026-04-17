# Frontend entity CRUD pages (batch 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full-stack CRUD pages for Rooms, Teachers, and WeekSchemes to the frontend SPA, following the existing Subjects pattern.

**Architecture:** Three self-contained feature folders (`features/rooms`, `features/teachers`, `features/week-schemes`) each with `hooks.ts`, `schema.ts`, and a page component. Routes are flat TanStack Router file routes under `_authed`. Tests are MSW-driven via the existing `renderWithProviders` harness. Two new shadcn primitives (`Select`, `Textarea`) land first. No shared CRUD abstraction.

**Tech Stack:** Vite 7 + React 19, TanStack Router + Query, shadcn/ui (Radix under the hood), React Hook Form + Zod, react-i18next, Vitest + Testing Library + MSW.

---

## Shared context (read before starting)

- Reference implementation: `frontend/src/features/subjects/{hooks,schema,subjects-page}.ts(x)` and `frontend/tests/subjects-page.test.tsx`. New files should read almost identically, diverging only where the entity's fields differ.
- The typed API client is `client` from `@/lib/api-client`. Endpoints are typed via `frontend/src/lib/api-types.ts` (generated, gitignored; regenerate with `mise run fe:types`).
- The MSW server is wired in `tests/setup.ts` with `onUnhandledRequest: "error"`. Every endpoint a page hits in a test must have a handler in `tests/msw-handlers.ts`.
- The global `beforeAll` in `subjects-page.test.tsx` switches i18n to DE. Match that so DE copy is what tests query against.
- Frontend CLAUDE.md (`frontend/CLAUDE.md`) rules that apply: no hardcoded user-visible strings (use `t("…")`), no inline hex/OKLCH, no raw inputs outside `components/ui/`, no `useEffect` for derived state, named `lucide-react` imports, no `forwardRef` in new components. Follow them from the first commit so you don't have to revisit.
- This plan's commits use the `feat(frontend)` scope for feature work, `chore(frontend)` for primitives and i18n scaffolding, `test(frontend)` if a test is added separately from code (not done in TDD but used when a test-only commit is unavoidable).

## File map

```
frontend/src/
  components/ui/
    textarea.tsx                                # NEW (Task 2)
    select.tsx                                  # NEW (Task 3)
  features/
    rooms/
      hooks.ts                                  # NEW (Task 5)
      schema.ts                                 # NEW (Task 5)
      rooms-page.tsx                            # NEW (Task 5)
    teachers/
      hooks.ts                                  # NEW (Task 7)
      schema.ts                                 # NEW (Task 7)
      teachers-page.tsx                         # NEW (Task 7)
    week-schemes/
      hooks.ts                                  # NEW (Task 9)
      schema.ts                                 # NEW (Task 9)
      week-schemes-page.tsx                     # NEW (Task 9)
  routes/
    _authed.rooms.tsx                           # NEW (Task 5)
    _authed.teachers.tsx                        # NEW (Task 7)
    _authed.week-schemes.tsx                    # NEW (Task 9)
  i18n/locales/
    en.json                                     # MODIFY (Task 11)
    de.json                                     # MODIFY (Task 11)
  components/layout/app-shell.tsx               # MODIFY (Task 13)
frontend/tests/
  msw-handlers.ts                               # MODIFY (Task 4, 6, 8, 10)
  rooms-page.test.tsx                           # NEW (Task 6)
  teachers-page.test.tsx                        # NEW (Task 8)
  week-schemes-page.test.tsx                    # NEW (Task 10)
  i18n.test.tsx                                 # MODIFY (Task 12)
```

---

## Task 1: Refresh generated OpenAPI types

**Why:** The typed client reads `frontend/src/lib/api-types.ts`, which is generated from the live backend. Regenerate first so you know the types the hooks will call against are current.

**Files:**
- Touch: `frontend/src/lib/api-types.ts` (gitignored, regenerated)

- [ ] **Step 1.** Start the backend in a background terminal (types gen needs the server running):

```bash
mise run dev &
# wait for "Application startup complete" in the log, then:
```

- [ ] **Step 2.** Regenerate types:

```bash
mise run fe:types
```

Expected: the command completes with `0`, `frontend/src/lib/api-types.ts` shows a fresh `components["schemas"]["RoomCreate"]`, `TeacherCreate`, `WeekSchemeCreate`, etc. Grep to confirm:

```bash
grep -c "RoomCreate\|TeacherCreate\|WeekSchemeCreate" frontend/src/lib/api-types.ts
# expect 3 or more
```

- [ ] **Step 3.** Stop the backgrounded backend (no commit, the file is gitignored).

---

## Task 2: Add shadcn `Textarea` primitive

**Why:** WeekScheme description is multi-line. `<Textarea>` isn't in `components/ui/` yet.

**Files:**
- Create: `frontend/src/components/ui/textarea.tsx`

- [ ] **Step 1.** Create the primitive (React 19 ref-as-prop, no `forwardRef`, matching the project rule):

```tsx
// frontend/src/components/ui/textarea.tsx
import type { TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export function Textarea({ className, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn(
        "flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
```

- [ ] **Step 2.** Verify lint + typecheck:

```bash
mise run fe:lint
mise run fe:types   # no-op if backend types unchanged; confirms ts-check still passes
```

Expected: both pass.

- [ ] **Step 3.** Commit:

```bash
git add frontend/src/components/ui/textarea.tsx
git commit -m "chore(frontend): add Textarea primitive"
```

---

## Task 3: Add shadcn `Select` primitive

**Why:** Room `suitability_mode` is a two-value enum; the project uses shadcn primitives over raw inputs.

**Files:**
- Modify: `frontend/package.json` (via pnpm add)
- Create: `frontend/src/components/ui/select.tsx`

- [ ] **Step 1.** Add the Radix dependency (uv-style rule, never hand-edit package.json):

```bash
mise exec -- pnpm -C frontend add @radix-ui/react-select
```

Expected: `@radix-ui/react-select` lands in `frontend/package.json` dependencies.

- [ ] **Step 2.** Create the primitive. Use the canonical shadcn file but strip `forwardRef` per the project rule:

```tsx
// frontend/src/components/ui/select.tsx
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

export const Select = SelectPrimitive.Root;
export const SelectGroup = SelectPrimitive.Group;
export const SelectValue = SelectPrimitive.Value;

export function SelectTrigger({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        "flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="h-4 w-4 opacity-50" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

export function SelectScrollUpButton(
  props: ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>,
) {
  return (
    <SelectPrimitive.ScrollUpButton
      className={cn("flex cursor-default items-center justify-center py-1", props.className)}
      {...props}
    >
      <ChevronUp className="h-4 w-4" />
    </SelectPrimitive.ScrollUpButton>
  );
}

export function SelectScrollDownButton(
  props: ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>,
) {
  return (
    <SelectPrimitive.ScrollDownButton
      className={cn("flex cursor-default items-center justify-center py-1", props.className)}
      {...props}
    >
      <ChevronDown className="h-4 w-4" />
    </SelectPrimitive.ScrollDownButton>
  );
}

export function SelectContent({
  className,
  children,
  position = "popper",
  ...props
}: ComponentPropsWithoutRef<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        className={cn(
          "relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md",
          position === "popper" &&
            "data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1",
          className,
        )}
        position={position}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          className={cn(
            "p-1",
            position === "popper" && "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]",
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

export function SelectLabel({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      className={cn("px-2 py-1.5 text-sm font-semibold", className)}
      {...props}
    />
  );
}

export function SelectItem({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      className={cn(
        "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="h-4 w-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

export function SelectSeparator({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      className={cn("-mx-1 my-1 h-px bg-muted", className)}
      {...props}
    />
  );
}
```

- [ ] **Step 3.** Verify:

```bash
mise run fe:lint
```

Expected: passes.

- [ ] **Step 4.** Commit:

```bash
git add frontend/package.json frontend/pnpm-lock.yaml frontend/src/components/ui/select.tsx
git commit -m "chore(frontend): add Select primitive and @radix-ui/react-select"
```

---

## Task 4: Extend MSW handlers with seed data for new entities

**Why:** Each page test must find matching handlers. Register them in one place so all subsequent tests share the seeds.

**Files:**
- Modify: `frontend/tests/msw-handlers.ts`

- [ ] **Step 1.** Add seed data + GET/POST/PATCH/DELETE handlers for rooms, teachers, week-schemes:

```ts
// after the existing subjects block in frontend/tests/msw-handlers.ts

export const initialRooms = [
  {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    name: "Raum 101",
    short_name: "101",
    capacity: 30,
    suitability_mode: "general",
    created_at: "2026-04-17T00:00:00Z",
    updated_at: "2026-04-17T00:00:00Z",
  },
];

export const initialTeachers = [
  {
    id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    first_name: "Anna",
    last_name: "Schmidt",
    short_code: "SCH",
    max_hours_per_week: 25,
    is_active: true,
    created_at: "2026-04-17T00:00:00Z",
    updated_at: "2026-04-17T00:00:00Z",
  },
];

export const initialWeekSchemes = [
  {
    id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
    name: "Standardwoche",
    description: "Mo–Fr, 8 Blöcke",
    created_at: "2026-04-17T00:00:00Z",
    updated_at: "2026-04-17T00:00:00Z",
  },
];

// Append these to defaultHandlers:
http.get(`${BASE}/rooms`, () => HttpResponse.json(initialRooms)),
http.post(`${BASE}/rooms`, async ({ request }) => {
  const body = (await request.json()) as {
    name: string;
    short_name: string;
    capacity: number | null;
    suitability_mode: "general" | "specialized";
  };
  return HttpResponse.json(
    {
      id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
      ...body,
      created_at: "2026-04-17T00:00:00Z",
      updated_at: "2026-04-17T00:00:00Z",
    },
    { status: 201 },
  );
}),
http.get(`${BASE}/teachers`, () => HttpResponse.json(initialTeachers)),
http.post(`${BASE}/teachers`, async ({ request }) => {
  const body = (await request.json()) as {
    first_name: string;
    last_name: string;
    short_code: string;
    max_hours_per_week: number;
  };
  return HttpResponse.json(
    {
      id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
      ...body,
      is_active: true,
      created_at: "2026-04-17T00:00:00Z",
      updated_at: "2026-04-17T00:00:00Z",
    },
    { status: 201 },
  );
}),
http.get(`${BASE}/week-schemes`, () => HttpResponse.json(initialWeekSchemes)),
http.post(`${BASE}/week-schemes`, async ({ request }) => {
  const body = (await request.json()) as { name: string; description?: string | null };
  return HttpResponse.json(
    {
      id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
      name: body.name,
      description: body.description ?? null,
      created_at: "2026-04-17T00:00:00Z",
      updated_at: "2026-04-17T00:00:00Z",
    },
    { status: 201 },
  );
}),
```

Fit these into the existing `defaultHandlers` array.

- [ ] **Step 2.** Double-check the exact backend paths by searching:

```bash
grep -E "^(router|@router)" backend/src/klassenzeit_backend/scheduling/routes/rooms.py
grep -rE "prefix=" backend/src/klassenzeit_backend/scheduling/routes/*.py
```

Expected: routes are mounted at `/rooms`, `/teachers`, `/week-schemes`. If any differs, update the handler URLs to match.

- [ ] **Step 3.** Run the existing tests to confirm no regression:

```bash
mise run fe:test
```

Expected: all existing tests pass; MSW does not emit "unhandled request" warnings.

- [ ] **Step 4.** Commit:

```bash
git add frontend/tests/msw-handlers.ts
git commit -m "test(frontend): add MSW seed data for rooms, teachers, week-schemes"
```

---

## Task 5: Rooms feature (hooks, schema, page, route) — red, green, refactor

**Why:** First entity. Establishes the per-entity copy pattern.

**Files:**
- Create: `frontend/src/features/rooms/hooks.ts`
- Create: `frontend/src/features/rooms/schema.ts`
- Create: `frontend/src/features/rooms/rooms-page.tsx`
- Create: `frontend/src/routes/_authed.rooms.tsx`

### Step 5.1 — write the failing test first (TDD red)

- [ ] Create `frontend/tests/rooms-page.test.tsx` with a seed-row assertion + create-flow assertion (matches the Subjects test shape). The test will fail with a module-not-found because the page doesn't exist yet, which is the correct red.

```tsx
// frontend/tests/rooms-page.test.tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it } from "vitest";
import { RoomsPage } from "@/features/rooms/rooms-page";
import i18n from "@/i18n/init";
import { renderWithProviders } from "./render-helpers";

describe("RoomsPage", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("de");
  });

  it("renders rooms fetched from the API", async () => {
    renderWithProviders(<RoomsPage />);
    expect(await screen.findByText("Raum 101")).toBeInTheDocument();
    expect(screen.getByText("101")).toBeInTheDocument();
  });

  it("creates a room via the dialog and closes on success", async () => {
    const user = userEvent.setup();
    renderWithProviders(<RoomsPage />);

    await screen.findByText("Raum 101");
    await user.click(screen.getByRole("button", { name: /neuer raum/i }));

    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/^name$/i), "Raum 102");
    await user.type(within(dialog).getByLabelText(/kürzel/i), "102");
    await user.click(within(dialog).getByRole("button", { name: /^anlegen$/i }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});
```

- [ ] Run: `mise run fe:test -- rooms-page` — expect FAIL ("Cannot find module '@/features/rooms/rooms-page'").

### Step 5.2 — Zod schema (green)

- [ ] Create `frontend/src/features/rooms/schema.ts`:

```ts
import { z } from "zod";

export const RoomFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  short_name: z.string().trim().min(1, "Short name is required").max(10),
  capacity: z
    .union([z.string().length(0), z.coerce.number().int().min(1)])
    .transform((v) => (typeof v === "number" ? v : undefined))
    .optional(),
  suitability_mode: z.enum(["general", "specialized"]).default("general"),
});

export type RoomFormValues = z.infer<typeof RoomFormSchema>;
```

### Step 5.3 — query/mutation hooks

- [ ] Create `frontend/src/features/rooms/hooks.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, client } from "@/lib/api-client";
import type { components } from "@/lib/api-types";

export type Room = components["schemas"]["RoomListResponse"];
export type RoomCreate = components["schemas"]["RoomCreate"];
export type RoomUpdate = components["schemas"]["RoomUpdate"];

export const roomsQueryKey = ["rooms"] as const;

export function useRooms() {
  return useQuery({
    queryKey: roomsQueryKey,
    queryFn: async (): Promise<Room[]> => {
      const { data } = await client.GET("/rooms");
      if (!data) throw new ApiError(500, null, "Empty response from /rooms");
      return data;
    },
  });
}

export function useCreateRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: RoomCreate): Promise<Room> => {
      const { data } = await client.POST("/rooms", { body });
      if (!data) throw new ApiError(500, null, "Empty response from POST /rooms");
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: roomsQueryKey }),
  });
}

export function useUpdateRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: RoomUpdate }): Promise<Room> => {
      const { data } = await client.PATCH("/rooms/{room_id}", {
        params: { path: { room_id: id } },
        body,
      });
      if (!data) throw new ApiError(500, null, "Empty response from PATCH /rooms/{id}");
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: roomsQueryKey }),
  });
}

export function useDeleteRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await client.DELETE("/rooms/{room_id}", {
        params: { path: { room_id: id } },
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: roomsQueryKey }),
  });
}
```

**Note:** Before committing, verify the PATCH / DELETE path-parameter names in `frontend/src/lib/api-types.ts` match (`room_id` is the FastAPI convention; confirm). If the openapi types use `{roomId}` or similar, adjust the hooks accordingly.

### Step 5.4 — Rooms page component

- [ ] Create `frontend/src/features/rooms/rooms-page.tsx`. Model off `subjects-page.tsx` line-for-line; swap field names and add the `Select` + `Input type="number"`:

```tsx
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  type Room,
  useCreateRoom,
  useDeleteRoom,
  useRooms,
  useUpdateRoom,
} from "./hooks";
import { RoomFormSchema, type RoomFormValues } from "./schema";

export function RoomsPage() {
  const { t } = useTranslation();
  const rooms = useRooms();
  const [editing, setEditing] = useState<Room | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Room | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("rooms.title")}</h1>
        <Button onClick={() => setCreating(true)}>{t("rooms.new")}</Button>
      </div>

      {rooms.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : rooms.isError ? (
        <p className="text-sm text-destructive">{t("rooms.loadError")}</p>
      ) : rooms.data && rooms.data.length > 0 ? (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("rooms.columns.name")}</TableHead>
                <TableHead>{t("rooms.columns.shortName")}</TableHead>
                <TableHead>{t("rooms.columns.capacity")}</TableHead>
                <TableHead>{t("rooms.columns.mode")}</TableHead>
                <TableHead className="w-40 text-right">{t("rooms.columns.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rooms.data.map((room) => (
                <TableRow key={room.id}>
                  <TableCell className="font-medium">{room.name}</TableCell>
                  <TableCell>{room.short_name}</TableCell>
                  <TableCell>{room.capacity ?? "—"}</TableCell>
                  <TableCell>{t(`rooms.suitabilityModes.${room.suitability_mode}` as const)}</TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button size="sm" variant="outline" onClick={() => setEditing(room)}>
                      {t("common.edit")}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setConfirmDelete(room)}
                    >
                      {t("common.delete")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t("rooms.empty")}</p>
      )}

      <RoomFormDialog
        open={creating}
        onOpenChange={setCreating}
        title={t("rooms.dialog.createTitle")}
        description={t("rooms.dialog.createDescription")}
        submitLabel={t("common.create")}
      />

      {editing ? (
        <RoomFormDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          title={t("rooms.dialog.editTitle")}
          description={t("rooms.dialog.editDescription", { name: editing.name })}
          submitLabel={t("common.save")}
          room={editing}
        />
      ) : null}

      {confirmDelete ? (
        <DeleteRoomDialog room={confirmDelete} onClose={() => setConfirmDelete(null)} />
      ) : null}
    </div>
  );
}

interface RoomFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  submitLabel: string;
  room?: Room;
}

function RoomFormDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  room,
}: RoomFormDialogProps) {
  const { t } = useTranslation();
  const form = useForm<RoomFormValues>({
    resolver: zodResolver(RoomFormSchema),
    defaultValues: {
      name: room?.name ?? "",
      short_name: room?.short_name ?? "",
      capacity: room?.capacity ?? undefined,
      suitability_mode:
        (room?.suitability_mode as "general" | "specialized" | undefined) ?? "general",
    },
  });
  const createMutation = useCreateRoom();
  const updateMutation = useUpdateRoom();
  const submitting = createMutation.isPending || updateMutation.isPending;

  async function onSubmit(values: RoomFormValues) {
    const body = {
      name: values.name,
      short_name: values.short_name,
      capacity: values.capacity ?? null,
      suitability_mode: values.suitability_mode,
    };
    if (room) {
      await updateMutation.mutateAsync({ id: room.id, body });
    } else {
      await createMutation.mutateAsync(body);
    }
    form.reset();
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) form.reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("rooms.columns.name")}</FormLabel>
                  <FormControl>
                    <Input autoFocus {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="short_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("rooms.columns.shortName")}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="capacity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("rooms.columns.capacity")}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      value={field.value ?? ""}
                      onChange={(e) =>
                        field.onChange(e.target.value === "" ? undefined : Number(e.target.value))
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="suitability_mode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("rooms.columns.mode")}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="general">{t("rooms.suitabilityModes.general")}</SelectItem>
                      <SelectItem value="specialized">
                        {t("rooms.suitabilityModes.specialized")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {submitting ? t("common.saving") : submitLabel}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

interface DeleteRoomDialogProps {
  room: Room;
  onClose: () => void;
}

function DeleteRoomDialog({ room, onClose }: DeleteRoomDialogProps) {
  const { t } = useTranslation();
  const mutation = useDeleteRoom();
  async function confirm() {
    await mutation.mutateAsync(room.id);
    onClose();
  }
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("rooms.dialog.deleteTitle")}</DialogTitle>
          <DialogDescription>
            {t("rooms.dialog.deleteDescription", { name: room.name })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={mutation.isPending}>
            {mutation.isPending ? t("common.deleting") : t("common.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

### Step 5.5 — route file

- [ ] Create `frontend/src/routes/_authed.rooms.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { RoomsPage } from "@/features/rooms/rooms-page";

export const Route = createFileRoute("/_authed/rooms")({
  component: RoomsPage,
});
```

### Step 5.6 — i18n keys (minimum viable, full text lands in Task 11)

- [ ] Add interim keys so the page renders. The final polish + DE copy comes in Task 11. Into `frontend/src/i18n/locales/en.json`:

```json
"rooms": {
  "title": "Rooms",
  "new": "New room",
  "columns": {
    "name": "Name",
    "shortName": "Short name",
    "capacity": "Capacity",
    "mode": "Mode",
    "actions": "Actions"
  },
  "empty": "No rooms yet. Create one to get started.",
  "loadError": "Could not load rooms.",
  "suitabilityModes": { "general": "General", "specialized": "Specialized" },
  "dialog": {
    "createTitle": "New room",
    "createDescription": "Create a new room.",
    "editTitle": "Edit room",
    "editDescription": "Update {{name}}.",
    "deleteTitle": "Delete room",
    "deleteDescription": "This will permanently delete \"{{name}}\"."
  }
}
```

Into `frontend/src/i18n/locales/de.json` (test expects DE copy because `beforeAll` switches to `de`):

```json
"rooms": {
  "title": "Räume",
  "new": "Neuer Raum",
  "columns": {
    "name": "Name",
    "shortName": "Kürzel",
    "capacity": "Kapazität",
    "mode": "Eignung",
    "actions": "Aktionen"
  },
  "empty": "Noch keine Räume. Legen Sie einen an, um zu beginnen.",
  "loadError": "Räume konnten nicht geladen werden.",
  "suitabilityModes": { "general": "Allgemein", "specialized": "Fachraum" },
  "dialog": {
    "createTitle": "Neuer Raum",
    "createDescription": "Einen neuen Raum anlegen.",
    "editTitle": "Raum bearbeiten",
    "editDescription": "{{name}} aktualisieren.",
    "deleteTitle": "Raum löschen",
    "deleteDescription": "Damit wird \"{{name}}\" unwiderruflich gelöscht."
  }
}
```

### Step 5.7 — run the test (green)

- [ ] Run:

```bash
mise run fe:test -- rooms-page
```

Expected: both specs pass.

### Step 5.8 — full frontend suite + lint

- [ ] Run:

```bash
mise run fe:test
mise run fe:lint
```

Expected: all pass.

### Step 5.9 — commit

- [ ] Commit the rooms feature together (route, page, hooks, schema, interim locale keys, test):

```bash
git add \
  frontend/src/features/rooms \
  frontend/src/routes/_authed.rooms.tsx \
  frontend/src/i18n/locales/en.json \
  frontend/src/i18n/locales/de.json \
  frontend/tests/rooms-page.test.tsx
git commit -m "feat(frontend): add rooms CRUD page"
```

---

## Task 6: Teachers feature — repeat the pattern

**Files:**
- Create: `frontend/src/features/teachers/hooks.ts`
- Create: `frontend/src/features/teachers/schema.ts`
- Create: `frontend/src/features/teachers/teachers-page.tsx`
- Create: `frontend/src/routes/_authed.teachers.tsx`
- Create: `frontend/tests/teachers-page.test.tsx`
- Modify: `frontend/src/i18n/locales/en.json`, `frontend/src/i18n/locales/de.json`

### Step 6.1 — red test

- [ ] Create `frontend/tests/teachers-page.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it } from "vitest";
import { TeachersPage } from "@/features/teachers/teachers-page";
import i18n from "@/i18n/init";
import { renderWithProviders } from "./render-helpers";

describe("TeachersPage", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("de");
  });

  it("renders teachers fetched from the API", async () => {
    renderWithProviders(<TeachersPage />);
    expect(await screen.findByText("Schmidt")).toBeInTheDocument();
    expect(screen.getByText("Anna")).toBeInTheDocument();
    expect(screen.getByText("SCH")).toBeInTheDocument();
  });

  it("creates a teacher via the dialog and closes on success", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TeachersPage />);
    await screen.findByText("Schmidt");

    await user.click(screen.getByRole("button", { name: /neue lehrkraft/i }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/vorname/i), "Max");
    await user.type(within(dialog).getByLabelText(/nachname/i), "Müller");
    await user.type(within(dialog).getByLabelText(/kürzel/i), "MÜL");
    await user.type(within(dialog).getByLabelText(/stunden/i), "20");
    await user.click(within(dialog).getByRole("button", { name: /^anlegen$/i }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});
```

- [ ] Run: `mise run fe:test -- teachers-page` — expect module-not-found FAIL.

### Step 6.2 — hooks

- [ ] Create `frontend/src/features/teachers/hooks.ts`. Mirror the rooms hooks pattern, substituting:

- `Teacher = components["schemas"]["TeacherListResponse"]`, `TeacherCreate`, `TeacherUpdate`
- Query key `["teachers"]`
- Paths `/teachers`, `/teachers/{teacher_id}` (confirm the path-param name in `api-types.ts`)

### Step 6.3 — schema

- [ ] Create `frontend/src/features/teachers/schema.ts`:

```ts
import { z } from "zod";

export const TeacherFormSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required").max(100),
  last_name: z.string().trim().min(1, "Last name is required").max(100),
  short_code: z.string().trim().min(1, "Short code is required").max(10),
  max_hours_per_week: z.coerce.number().int().min(1),
});

export type TeacherFormValues = z.infer<typeof TeacherFormSchema>;
```

### Step 6.4 — page component

- [ ] Create `frontend/src/features/teachers/teachers-page.tsx`. Copy `rooms-page.tsx` structurally. Replace:
  - Imports: drop `Select*`, add nothing new.
  - Form fields: `first_name`, `last_name`, `short_code`, `max_hours_per_week` (four `<Input/>`s; the hours field uses `type="number"` with min={1}).
  - Table columns: Last name, First name, Short code, Max hours/week, Actions. Sort the table by `last_name` with a locale-aware compare:
    ```ts
    const sorted = [...(teachers.data ?? [])].sort((a, b) =>
      a.last_name.localeCompare(b.last_name, i18n.language),
    );
    ```
    Import `i18n` from `@/i18n/init`. Replace `rooms.data.map` with `sorted.map`.
  - i18n keys: `teachers.*` instead of `rooms.*`.

### Step 6.5 — route

- [ ] Create `frontend/src/routes/_authed.teachers.tsx` mirroring the rooms route.

### Step 6.6 — i18n (DE + EN), same shape as rooms but for teachers:

- [ ] EN:

```json
"teachers": {
  "title": "Teachers",
  "new": "New teacher",
  "columns": {
    "firstName": "First name",
    "lastName": "Last name",
    "shortCode": "Short code",
    "maxHoursPerWeek": "Max hours / week",
    "actions": "Actions"
  },
  "empty": "No teachers yet. Create one to get started.",
  "loadError": "Could not load teachers.",
  "dialog": {
    "createTitle": "New teacher",
    "createDescription": "Create a new teacher.",
    "editTitle": "Edit teacher",
    "editDescription": "Update {{name}}.",
    "deleteTitle": "Delete teacher",
    "deleteDescription": "This will permanently delete \"{{name}}\"."
  }
}
```

- [ ] DE:

```json
"teachers": {
  "title": "Lehrkräfte",
  "new": "Neue Lehrkraft",
  "columns": {
    "firstName": "Vorname",
    "lastName": "Nachname",
    "shortCode": "Kürzel",
    "maxHoursPerWeek": "Max. Stunden / Woche",
    "actions": "Aktionen"
  },
  "empty": "Noch keine Lehrkräfte. Legen Sie eine an, um zu beginnen.",
  "loadError": "Lehrkräfte konnten nicht geladen werden.",
  "dialog": {
    "createTitle": "Neue Lehrkraft",
    "createDescription": "Eine neue Lehrkraft anlegen.",
    "editTitle": "Lehrkraft bearbeiten",
    "editDescription": "{{name}} aktualisieren.",
    "deleteTitle": "Lehrkraft löschen",
    "deleteDescription": "Damit wird \"{{name}}\" unwiderruflich gelöscht."
  }
}
```

### Step 6.7 — green + commit

- [ ] `mise run fe:test -- teachers-page` → PASS.
- [ ] `mise run fe:test` + `mise run fe:lint` → both pass.
- [ ] Commit:

```bash
git add \
  frontend/src/features/teachers \
  frontend/src/routes/_authed.teachers.tsx \
  frontend/src/i18n/locales/en.json \
  frontend/src/i18n/locales/de.json \
  frontend/tests/teachers-page.test.tsx
git commit -m "feat(frontend): add teachers CRUD page"
```

---

## Task 7: WeekSchemes feature

**Files:**
- Create: `frontend/src/features/week-schemes/hooks.ts`
- Create: `frontend/src/features/week-schemes/schema.ts`
- Create: `frontend/src/features/week-schemes/week-schemes-page.tsx`
- Create: `frontend/src/routes/_authed.week-schemes.tsx`
- Create: `frontend/tests/week-schemes-page.test.tsx`
- Modify: `frontend/src/i18n/locales/en.json`, `frontend/src/i18n/locales/de.json`

### Step 7.1 — red test

- [ ] Create `frontend/tests/week-schemes-page.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it } from "vitest";
import { WeekSchemesPage } from "@/features/week-schemes/week-schemes-page";
import i18n from "@/i18n/init";
import { renderWithProviders } from "./render-helpers";

describe("WeekSchemesPage", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("de");
  });

  it("renders week schemes fetched from the API", async () => {
    renderWithProviders(<WeekSchemesPage />);
    expect(await screen.findByText("Standardwoche")).toBeInTheDocument();
  });

  it("creates a week scheme via the dialog and closes on success", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WeekSchemesPage />);
    await screen.findByText("Standardwoche");

    await user.click(screen.getByRole("button", { name: /neues wochenschema/i }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/^name$/i), "A-Woche");
    await user.click(within(dialog).getByRole("button", { name: /^anlegen$/i }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});
```

- [ ] Run: expect FAIL.

### Step 7.2 — schema

- [ ] Create `frontend/src/features/week-schemes/schema.ts`:

```ts
import { z } from "zod";

export const WeekSchemeFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  description: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
});

export type WeekSchemeFormValues = z.infer<typeof WeekSchemeFormSchema>;
```

### Step 7.3 — hooks

- [ ] Create `frontend/src/features/week-schemes/hooks.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, client } from "@/lib/api-client";
import type { components } from "@/lib/api-types";

export type WeekScheme = components["schemas"]["WeekSchemeListResponse"];
export type WeekSchemeCreate = components["schemas"]["WeekSchemeCreate"];
export type WeekSchemeUpdate = components["schemas"]["WeekSchemeUpdate"];

export const weekSchemesQueryKey = ["week-schemes"] as const;

export function useWeekSchemes() {
  return useQuery({
    queryKey: weekSchemesQueryKey,
    queryFn: async (): Promise<WeekScheme[]> => {
      const { data } = await client.GET("/week-schemes");
      if (!data) throw new ApiError(500, null, "Empty response from /week-schemes");
      return data;
    },
  });
}

// useCreateWeekScheme / useUpdateWeekScheme / useDeleteWeekScheme — mirror rooms hooks.
```

(Complete the three mutation hooks exactly like the rooms hooks, swapping paths and types. Confirm the path param name from `api-types.ts`; likely `week_scheme_id`.)

### Step 7.4 — page component

- [ ] Create `frontend/src/features/week-schemes/week-schemes-page.tsx`. Clone `rooms-page.tsx`, swap to `WeekScheme`, and use `<Textarea rows={3}>` in the description field. Two columns in the list: Name and Description (truncate description to 80 chars for display):

```tsx
<TableCell>{(ws.description ?? "").slice(0, 80)}</TableCell>
```

### Step 7.5 — route

- [ ] Create `frontend/src/routes/_authed.week-schemes.tsx`.

### Step 7.6 — i18n

- [ ] Append `weekSchemes.*` namespace to both `en.json` and `de.json`. DE example:

```json
"weekSchemes": {
  "title": "Wochenschemata",
  "new": "Neues Wochenschema",
  "columns": {
    "name": "Name",
    "description": "Beschreibung",
    "actions": "Aktionen"
  },
  "empty": "Noch keine Wochenschemata. Legen Sie eines an, um zu beginnen.",
  "loadError": "Wochenschemata konnten nicht geladen werden.",
  "dialog": {
    "createTitle": "Neues Wochenschema",
    "createDescription": "Ein neues Wochenschema anlegen.",
    "editTitle": "Wochenschema bearbeiten",
    "editDescription": "{{name}} aktualisieren.",
    "deleteTitle": "Wochenschema löschen",
    "deleteDescription": "Damit wird \"{{name}}\" unwiderruflich gelöscht."
  }
}
```

Mirror it in English (`Week schemes`, `New week scheme`, etc.).

### Step 7.7 — green + commit

- [ ] `mise run fe:test -- week-schemes-page` → PASS.
- [ ] `mise run fe:test` + `mise run fe:lint` → both pass.
- [ ] Commit:

```bash
git add \
  frontend/src/features/week-schemes \
  frontend/src/routes/_authed.week-schemes.tsx \
  frontend/src/i18n/locales/en.json \
  frontend/src/i18n/locales/de.json \
  frontend/tests/week-schemes-page.test.tsx
git commit -m "feat(frontend): add week schemes CRUD page"
```

---

## Task 8: Nav wiring in the app shell

**Why:** Pages exist and routes register, but the sidebar doesn't link to them yet.

**Files:**
- Modify: `frontend/src/components/layout/app-shell.tsx`
- Modify: `frontend/src/i18n/locales/en.json` and `de.json` (add `nav.rooms`, `nav.teachers`, `nav.weekSchemes`)

- [ ] **Step 1.** Add the three new nav entries and swap the Subjects icon:

```tsx
// frontend/src/components/layout/app-shell.tsx
import {
  BookOpen,
  CalendarDays,
  DoorOpen,
  GraduationCap,
  LayoutDashboard,
  LogOut,
} from "lucide-react";

// replace navItems:
const navItems = [
  { to: "/", labelKey: "nav.dashboard", icon: LayoutDashboard },
  { to: "/subjects", labelKey: "nav.subjects", icon: BookOpen },
  { to: "/rooms", labelKey: "nav.rooms", icon: DoorOpen },
  { to: "/teachers", labelKey: "nav.teachers", icon: GraduationCap },
  { to: "/week-schemes", labelKey: "nav.weekSchemes", icon: CalendarDays },
] as const;
```

- [ ] **Step 2.** Add nav i18n keys. EN:

```json
"nav": {
  "dashboard": "Dashboard",
  "subjects": "Subjects",
  "rooms": "Rooms",
  "teachers": "Teachers",
  "weekSchemes": "Week schemes",
  "logOut": "Log out"
}
```

DE:

```json
"nav": {
  "dashboard": "Dashboard",
  "subjects": "Fächer",
  "rooms": "Räume",
  "teachers": "Lehrkräfte",
  "weekSchemes": "Wochenschemata",
  "logOut": "Abmelden"
}
```

(Merge into existing `nav` key without dropping `dashboard` / `subjects` / `logOut`.)

- [ ] **Step 3.** Verify. Start the dev server and click through the new links manually:

```bash
mise run fe:dev
```

Open http://localhost:5173, log in as dev, click each sidebar entry. Each page should render a table or empty state, with no console errors.

- [ ] **Step 4.** Run the full test + lint:

```bash
mise run fe:test
mise run fe:lint
```

Expected: pass.

- [ ] **Step 5.** Commit:

```bash
git add frontend/src/components/layout/app-shell.tsx frontend/src/i18n/locales/en.json frontend/src/i18n/locales/de.json
git commit -m "feat(frontend): wire rooms, teachers, and week schemes into the nav"
```

---

## Task 9: Extend the i18n key-parity test

**Why:** `i18n.test.tsx` walks `en.json` and `de.json` and asserts key parity. Confirm it still passes and that it checks the new namespaces; extend if it hard-codes the namespace list.

**Files:**
- Review/modify: `frontend/tests/i18n.test.tsx`

- [ ] **Step 1.** Read the existing test:

```bash
cat frontend/tests/i18n.test.tsx
```

- [ ] **Step 2.** If the test walks both files generically (recursive key comparison), nothing to change. If it hardcodes namespace names, add `rooms`, `teachers`, `weekSchemes` to that list.

- [ ] **Step 3.** Run:

```bash
mise run fe:test -- i18n
```

Expected: pass.

- [ ] **Step 4.** Commit only if changes were made:

```bash
git add frontend/tests/i18n.test.tsx
git commit -m "test(frontend): extend i18n parity test for new namespaces"
```

---

## Task 10: Coverage ratchet + final suite

**Why:** The ratchet only fails the CI build if coverage drops below baseline. We need to run it locally, then either be in the green or bump the baseline.

**Files:**
- Potentially modify: `.coverage-baseline-frontend`

- [ ] **Step 1.** Run coverage:

```bash
mise run fe:test:cov
```

Expected: Vitest produces a `frontend/coverage/coverage-summary.json`. The ratchet script (somewhere referenced by `fe:test:cov` or the CI workflow) reads it.

- [ ] **Step 2.** Compare against the baseline:

```bash
cat .coverage-baseline-frontend
```

- [ ] **Step 3.** If coverage rose, bump the baseline (the ratchet ratchets upward):

```bash
mise run fe:cov:update-baseline
```

Verify the new baseline is sensible (not regressing):

```bash
cat .coverage-baseline-frontend
```

- [ ] **Step 4.** If baseline changed, commit:

```bash
git add .coverage-baseline-frontend
git commit -m "ci(frontend): bump coverage baseline after entity pages landed"
```

If coverage dropped: investigate, add tests for the untested path. Do not lower the baseline to sidestep a real regression.

- [ ] **Step 5.** Final verification:

```bash
mise run lint
mise run test
```

Both must pass for the PR to merge cleanly.

---

## Task 11: Docs pass (OPEN_THINGS, memory, ADR check)

**Why:** The spec + plan land before the PR goes up. Keep OPEN_THINGS and auto-memory in sync.

**Files:**
- Modify: `docs/superpowers/OPEN_THINGS.md`
- Modify (maybe): `/home/pascal/.claude/projects/-home-pascal-Code-Klassenzeit/memory/project_roadmap_status.md`

- [ ] **Step 1.** In `OPEN_THINGS.md`:
  - Replace the "Remaining entity CRUD pages" line with: "Remaining entity CRUD pages. Batch 1 (Rooms, Teachers, WeekSchemes) landed; Stundentafel, SchoolClass, Lesson CRUD pages still need UI pages."
  - Add under the same Product-capabilities section: "Sub-resource editors (room availability + suitability, teacher availability + qualifications, week-scheme time blocks, stundentafel entries) — their own spec once all base CRUD lands."
  - Add under a new `## Frontend tech debt` subsection (or the existing Testing section if one fits): "Zod schemas use raw English literals for error messages — locale-aware error keys is a cross-feature follow-up." and "Deletion of in-use entities surfaces only as a generic error toast — pre-flight check or typed 409 handler is a cross-feature follow-up."

- [ ] **Step 2.** Update the project-roadmap memory file. Replace the "Frontend theming, i18n, coverage ratchet — ... PR pending green CI as of 2026-04-17" bullet with a "merged (#79) on 2026-04-17" line, and add a new bullet: "Entity CRUD pages batch 1 (Rooms, Teachers, WeekSchemes) — scoped spec and plan under docs/superpowers, PR pending review as of 2026-04-17." Change the "Next up" block to point at Stundentafel / SchoolClass / Lesson.

- [ ] **Step 3.** Commit the doc changes:

```bash
git add docs/superpowers/OPEN_THINGS.md
git commit -m "docs: note batch 1 entity CRUD completion and follow-ups"
```

(The memory file is outside the repo; changes there are separate.)

- [ ] **Step 4.** No ADR is expected: this change introduces no new dependency beyond `@radix-ui/react-select` which is an un-load-bearing primitive. If the coverage ratchet gains a new floor or the shadcn primitive decision changes direction, add `docs/adr/NNNN-<title>.md` and link from `docs/adr/README.md`.

---

## Self-review pass (do this before opening the PR)

- [ ] **Spec coverage:** each spec acceptance criterion maps to a task above. Acceptance 1 → Tasks 5/6/7 (route files). Acceptance 2 → Tasks 5/6/7 (page components + i18n). Acceptance 3 → Tasks 5/6/7 (dialog + create mutation). Acceptance 4 → Tasks 5/6/7 (edit + delete dialogs). Acceptance 5 → Task 11 (de/en keys + nav). Acceptance 6 → Task 10. Acceptance 7 → Task 10 final run. Acceptance 8 → no files touched under `features/subjects` (verify with `git diff master -- frontend/src/features/subjects`).

- [ ] **Placeholders:** no "TBD" / "TODO" should remain in diffed code. Grep the branch:

```bash
git diff master -- frontend | grep -E "TODO|TBD|FIXME"
```

- [ ] **Type consistency:** `Room`, `Teacher`, `WeekScheme` types are declared once in each hooks file; shapes match the generated OpenAPI types; page components and tests import from the same module path.

- [ ] **Scope drift:** the only changes outside the three new features are:
  - `frontend/src/components/ui/{select,textarea}.tsx` (new primitives).
  - `frontend/src/components/layout/app-shell.tsx` (nav).
  - `frontend/src/i18n/locales/{en,de}.json` (additive keys).
  - `frontend/tests/msw-handlers.ts` (handlers + seed data).
  - `frontend/tests/i18n.test.tsx` if the parity test is keyed by namespace list.
  - `frontend/package.json` + `frontend/pnpm-lock.yaml` for the Radix dep.

  If any file outside that list changed, explain it in the PR body or drop the change.

---

## Execution handoff

Three independent per-entity chunks (Tasks 5, 6, 7) could in principle fan out. In practice each is small, they share incremental edits to `i18n/locales/*.json` and `tests/msw-handlers.ts`, and serializing them keeps the PR commit history readable. Run inline in a single session via `superpowers:executing-plans`; no subagent fan-out.
