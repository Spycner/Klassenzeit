# Frontend SchoolClass CRUD page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/school-classes` CRUD page with FK dropdowns for Stundentafel and WeekScheme, and wire it into the sidebar, top-bar crumb, dashboard StatGrid, and dashboard QuickAdd.

**Architecture:** A new self-contained `features/school-classes/` folder (hooks, schema, page, dialogs) plus a read-only `features/stundentafeln/hooks.ts` for the FK lookup. Route is a flat TanStack Router file route under `_authed`. The page reads three list endpoints (`/classes`, `/stundentafeln`, `/week-schemes`) and renders FK names by client-side `Map` lookup, no backend response shape change. Tests are MSW-driven via the existing `renderWithProviders` harness.

**Tech Stack:** Vite 7 + React 19, TanStack Router + Query, shadcn/ui (Select / Input / Form / Dialog / Table / Button), React Hook Form + Zod, react-i18next, Vitest + Testing Library + MSW.

---

## Shared context (read before starting)

- Spec: `docs/superpowers/specs/2026-04-19-frontend-school-classes-crud-design.md`. Read it first. The plan implements that spec exactly.
- Reference implementation: `frontend/src/features/rooms/{hooks,schema,rooms-page,rooms-dialogs}.{ts,tsx}` and `frontend/tests/rooms-page.test.tsx`. New files should read almost identically, diverging where SchoolClass needs FK selects.
- The typed API client is `client` from `@/lib/api-client`. Endpoints are typed via `frontend/src/lib/api-types.ts` (generated, gitignored; regenerate with `mise run fe:types`).
- The MSW server is wired in `tests/setup.ts` with `onUnhandledRequest: "error"`. Every endpoint a page hits in a test must have a handler in `tests/msw-handlers.ts`.
- The global `beforeAll` in `rooms-page.test.tsx` switches i18n to DE. Match that so DE copy is what tests query against.
- Frontend CLAUDE.md (`frontend/CLAUDE.md`) rules that apply: no hardcoded user-visible strings (use `t("…")`), no inline hex / OKLCH, no raw inputs outside `components/ui/`, no `useEffect` for derived state, named `lucide-react` imports, no `forwardRef` in new components, no array index as key, unique function names globally (so `RoomsPageHead` not `PageHead`, `handleSchoolClassSubmit` not `onSubmit`).
- Root CLAUDE.md rules: `erasableSyntaxOnly` (no enums, no namespaces); flat Zod schemas (no `z.coerce`, no `z.union`, no `.transform`, no `.default`).
- i18n type safety: `t()` keys are typed against `en.json` via `src/i18n/types.d.ts`. After editing the catalogs, run `mise exec -- pnpm -C frontend build` so the Router plugin regenerates `routeTree.gen.ts` AND TS sees the new keys before `tsc --noEmit`.
- Commit style: `feat(frontend)` for new feature work, `chore(frontend)` for i18n / chrome / dashboard wiring.

## File map

```
frontend/src/
  features/
    school-classes/
      hooks.ts                                  # NEW (Task 3)
      schema.ts                                 # NEW (Task 3)
      school-classes-dialogs.tsx                # NEW (Task 5)
      school-classes-page.tsx                   # NEW (Task 6)
    stundentafeln/
      hooks.ts                                  # NEW (Task 3)
    dashboard/
      stat-grid.tsx                             # MODIFY (Task 9)
      quick-add.tsx                             # MODIFY (Task 9)
  routes/
    _authed.school-classes.tsx                  # NEW (Task 7)
  components/
    app-sidebar.tsx                             # MODIFY (Task 8)
    layout/app-shell.tsx                        # MODIFY (Task 8)
  i18n/locales/
    en.json                                     # MODIFY (Task 4)
    de.json                                     # MODIFY (Task 4)
frontend/tests/
  msw-handlers.ts                               # MODIFY (Task 2)
  school-classes-page.test.tsx                  # NEW (Task 10)
```

---

## Task 1: Refresh generated OpenAPI types

**Why:** The typed client reads `frontend/src/lib/api-types.ts`, generated from the live backend. Regenerate first so SchoolClass / Stundentafel / WeekScheme schemas resolve at type-check time.

**Files:**
- Touch: `frontend/src/lib/api-types.ts` (gitignored, regenerated)

- [ ] **Step 1.** Make sure the backend is running. From repo root:

```bash
mise run db:up
mise run dev &
# wait for "Application startup complete" (~5 s)
```

- [ ] **Step 2.** Regenerate types:

```bash
mise run fe:types
```

Expected: command exits 0; the file shows fresh entries. Confirm with:

```bash
grep -E "SchoolClassCreate|SchoolClassResponse|StundentafelListResponse" frontend/src/lib/api-types.ts | head -10
```

Expected: at least three matches.

- [ ] **Step 3.** Stop the backend before continuing:

```bash
kill %1 2>/dev/null || true
```

- [ ] **Step 4.** No commit (the file is gitignored).

---

## Task 2: Extend MSW handlers for `/classes` and `/stundentafeln`

**Why:** Tests must hit handlers for every endpoint the page calls; `setupServer` is configured with `onUnhandledRequest: "error"`. The page reads `/classes`, `/stundentafeln`, and `/week-schemes` (already wired). The test additionally exercises `POST /classes` for the create flow.

**Files:**
- Modify: `frontend/tests/msw-handlers.ts`

- [ ] **Step 1.** Open `frontend/tests/msw-handlers.ts` and add a Stundentafeln seed plus a SchoolClasses seed. Place these next to the existing `initialWeekSchemes` block:

```ts
export const initialStundentafeln = [
  {
    id: "99999999-9999-9999-9999-999999999999",
    name: "Grundschule Klasse 1",
    grade_level: 1,
    created_at: "2026-04-17T00:00:00Z",
    updated_at: "2026-04-17T00:00:00Z",
  },
];

export const initialSchoolClasses = [
  {
    id: "88888888-8888-8888-8888-888888888888",
    name: "1a",
    grade_level: 1,
    stundentafel_id: "99999999-9999-9999-9999-999999999999",
    week_scheme_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
    created_at: "2026-04-17T00:00:00Z",
    updated_at: "2026-04-17T00:00:00Z",
  },
];
```

- [ ] **Step 2.** In the same file, append three handlers to `defaultHandlers` (before the closing `]`):

```ts
  http.get(`${BASE}/stundentafeln`, () => HttpResponse.json(initialStundentafeln)),
  http.get(`${BASE}/classes`, () => HttpResponse.json(initialSchoolClasses)),
  http.post(`${BASE}/classes`, async ({ request }) => {
    const body = (await request.json()) as {
      name: string;
      grade_level: number;
      stundentafel_id: string;
      week_scheme_id: string;
    };
    return HttpResponse.json(
      {
        id: "77777777-7777-7777-7777-777777777777",
        ...body,
        created_at: "2026-04-17T00:00:00Z",
        updated_at: "2026-04-17T00:00:00Z",
      },
      { status: 201 },
    );
  }),
```

- [ ] **Step 3.** Verify the file still type-checks by running:

```bash
mise exec -- pnpm -C frontend exec tsc --noEmit -p tests/tsconfig.json 2>&1 | head -20
```

(If `tests/tsconfig.json` doesn't exist, run the full build instead at the end of the plan; the handlers are plain TS that will type-check there.)

Expected: no errors related to `msw-handlers.ts`. (Pre-existing errors elsewhere are fine; we'll address them in Task 11.)

- [ ] **Step 4.** Commit:

```bash
git add frontend/tests/msw-handlers.ts
git commit -m "test(frontend): add msw handlers for classes and stundentafeln"
```

---

## Task 3: Add data layer (Stundentafel hook + SchoolClass hooks + Zod schema)

**Why:** The page and dialogs both depend on these. Three small files, no cross-dependencies, all written together.

**Files:**
- Create: `frontend/src/features/stundentafeln/hooks.ts`
- Create: `frontend/src/features/school-classes/hooks.ts`
- Create: `frontend/src/features/school-classes/schema.ts`

- [ ] **Step 1.** Create `frontend/src/features/stundentafeln/hooks.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { ApiError, client } from "@/lib/api-client";
import type { components } from "@/lib/api-types";

export type Stundentafel = components["schemas"]["StundentafelListResponse"];

export const stundentafelnQueryKey = ["stundentafeln"] as const;

export function useStundentafeln() {
  return useQuery({
    queryKey: stundentafelnQueryKey,
    queryFn: async (): Promise<Stundentafel[]> => {
      const { data } = await client.GET("/stundentafeln");
      if (!data) {
        throw new ApiError(500, null, "Empty response from /stundentafeln");
      }
      return data;
    },
  });
}
```

- [ ] **Step 2.** Create `frontend/src/features/school-classes/hooks.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, client } from "@/lib/api-client";
import type { components } from "@/lib/api-types";

export type SchoolClass = components["schemas"]["SchoolClassResponse"];
export type SchoolClassCreate = components["schemas"]["SchoolClassCreate"];
export type SchoolClassUpdate = components["schemas"]["SchoolClassUpdate"];

export const schoolClassesQueryKey = ["school-classes"] as const;

export function useSchoolClasses() {
  return useQuery({
    queryKey: schoolClassesQueryKey,
    queryFn: async (): Promise<SchoolClass[]> => {
      const { data } = await client.GET("/classes");
      if (!data) {
        throw new ApiError(500, null, "Empty response from /classes");
      }
      return data;
    },
  });
}

export function useCreateSchoolClass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: SchoolClassCreate): Promise<SchoolClass> => {
      const { data } = await client.POST("/classes", { body });
      if (!data) {
        throw new ApiError(500, null, "Empty response from POST /classes");
      }
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: schoolClassesQueryKey }),
  });
}

export function useUpdateSchoolClass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      body,
    }: {
      id: string;
      body: SchoolClassUpdate;
    }): Promise<SchoolClass> => {
      const { data } = await client.PATCH("/classes/{class_id}", {
        params: { path: { class_id: id } },
        body,
      });
      if (!data) {
        throw new ApiError(500, null, "Empty response from PATCH /classes/{id}");
      }
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: schoolClassesQueryKey }),
  });
}

export function useDeleteSchoolClass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await client.DELETE("/classes/{class_id}", {
        params: { path: { class_id: id } },
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: schoolClassesQueryKey }),
  });
}
```

- [ ] **Step 3.** Create `frontend/src/features/school-classes/schema.ts`:

```ts
import { z } from "zod";

export const SchoolClassFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  grade_level: z.number().int().min(1, "Grade is required"),
  stundentafel_id: z.string().min(1, "Curriculum is required"),
  week_scheme_id: z.string().min(1, "Week scheme is required"),
});

export type SchoolClassFormValues = z.infer<typeof SchoolClassFormSchema>;
```

(Match the rooms-schema convention: raw English literals, flat Zod, no `.coerce` or `.transform`.)

- [ ] **Step 4.** Verify the new files compile by running the build (this also regenerates `routeTree.gen.ts` for any new routes — none added in this task, but harmless):

```bash
mise exec -- pnpm -C frontend build 2>&1 | tail -20
```

Expected: build completes successfully. If any TS error mentions `SchoolClassCreate` not found, re-run Task 1.

- [ ] **Step 5.** Commit:

```bash
git add frontend/src/features/stundentafeln/ frontend/src/features/school-classes/hooks.ts frontend/src/features/school-classes/schema.ts
git commit -m "feat(frontend): add school-classes hooks and form schema"
```

---

## Task 4: Add i18n keys

**Why:** Every visible string in the new page must come from `t("…")`. Both `en.json` and `de.json` need the new keys; missing keys in `de.json` break runtime fallback even when `en.json` types compile.

**Files:**
- Modify: `frontend/src/i18n/locales/en.json`
- Modify: `frontend/src/i18n/locales/de.json`

- [ ] **Step 1.** In `frontend/src/i18n/locales/en.json`, add a top-level `schoolClasses` block (place it right after the `weekSchemes` block before the final closing brace):

```json
  "schoolClasses": {
    "title": "School classes",
    "subtitle": "Cohorts that share a curriculum and a weekly time grid.",
    "new": "New school class",
    "loadError": "Could not load school classes.",
    "columns": {
      "name": "Name",
      "gradeLevel": "Grade",
      "stundentafel": "Curriculum",
      "weekScheme": "Week scheme",
      "actions": "Actions"
    },
    "empty": {
      "title": "No school classes yet",
      "body": "Create the cohorts at your school. Each class needs a curriculum and a weekly time grid.",
      "step1": "Add the curriculum",
      "step2": "Add the week scheme",
      "step3": "Create the class"
    },
    "fields": {
      "gradeLevelLabel": "Grade",
      "stundentafelLabel": "Curriculum",
      "stundentafelPlaceholder": "Select a curriculum",
      "weekSchemeLabel": "Week scheme",
      "weekSchemePlaceholder": "Select a week scheme"
    },
    "dialog": {
      "createTitle": "New school class",
      "createDescription": "Create a new school class.",
      "editTitle": "Edit school class",
      "editDescription": "Update {{name}}.",
      "deleteTitle": "Delete school class",
      "deleteDescription": "This will permanently delete \"{{name}}\".",
      "missingPrereqs": "Add at least one curriculum and one week scheme before creating a class.",
      "addStundentafel": "Add a curriculum",
      "addWeekScheme": "Add a week scheme"
    }
  }
```

(Comma after the previous `}` and no trailing comma after the new block.)

- [ ] **Step 2.** In the same `en.json`, extend the `dashboard.hint` object with two new keys (place them after `noWeekSchemeSub`):

```json
      "noClasses": "No school classes yet",
      "noClassesSub": "Add cohorts so the solver knows who to plan for."
```

- [ ] **Step 3.** Mirror both additions in `frontend/src/i18n/locales/de.json` with translated copy. Add the `schoolClasses` block:

```json
  "schoolClasses": {
    "title": "Klassen",
    "subtitle": "Lerngruppen mit gemeinsamer Stundentafel und gemeinsamem Wochenraster.",
    "new": "Neue Klasse",
    "loadError": "Klassen konnten nicht geladen werden.",
    "columns": {
      "name": "Name",
      "gradeLevel": "Jahrgang",
      "stundentafel": "Stundentafel",
      "weekScheme": "Wochenschema",
      "actions": "Aktionen"
    },
    "empty": {
      "title": "Noch keine Klassen",
      "body": "Lege die Lerngruppen deiner Schule an. Jede Klasse braucht eine Stundentafel und ein Wochenraster.",
      "step1": "Stundentafel anlegen",
      "step2": "Wochenraster anlegen",
      "step3": "Klasse anlegen"
    },
    "fields": {
      "gradeLevelLabel": "Jahrgang",
      "stundentafelLabel": "Stundentafel",
      "stundentafelPlaceholder": "Stundentafel wählen",
      "weekSchemeLabel": "Wochenschema",
      "weekSchemePlaceholder": "Wochenschema wählen"
    },
    "dialog": {
      "createTitle": "Neue Klasse",
      "createDescription": "Eine neue Klasse anlegen.",
      "editTitle": "Klasse bearbeiten",
      "editDescription": "{{name}} aktualisieren.",
      "deleteTitle": "Klasse löschen",
      "deleteDescription": "„{{name}}\" wird dauerhaft gelöscht.",
      "missingPrereqs": "Lege mindestens eine Stundentafel und ein Wochenraster an, bevor du eine Klasse anlegst.",
      "addStundentafel": "Stundentafel anlegen",
      "addWeekScheme": "Wochenraster anlegen"
    }
  }
```

And the `dashboard.hint` extension:

```json
      "noClasses": "Noch keine Klassen",
      "noClassesSub": "Lege Lerngruppen an, damit der Solver weiß, wofür er plant."
```

- [ ] **Step 4.** Verify both JSON files parse:

```bash
node -e "JSON.parse(require('fs').readFileSync('frontend/src/i18n/locales/en.json'))"
node -e "JSON.parse(require('fs').readFileSync('frontend/src/i18n/locales/de.json'))"
```

Expected: both exit 0 silently.

- [ ] **Step 5.** Commit:

```bash
git add frontend/src/i18n/locales/en.json frontend/src/i18n/locales/de.json
git commit -m "chore(frontend): i18n keys for school classes"
```

---

## Task 5: Add SchoolClass dialog components

**Why:** The page needs a form dialog (create + edit) and a delete confirmation. They are co-located in one file mirroring `rooms-dialogs.tsx`.

**Files:**
- Create: `frontend/src/features/school-classes/school-classes-dialogs.tsx`

- [ ] **Step 1.** Create the file with the following content. Note the unique-function-names rule: prefer `handleSchoolClassSubmit`, `confirmSchoolClassDelete`, etc.

```tsx
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useStundentafeln } from "@/features/stundentafeln/hooks";
import { useWeekSchemes } from "@/features/week-schemes/hooks";
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
  type SchoolClass,
  useCreateSchoolClass,
  useDeleteSchoolClass,
  useUpdateSchoolClass,
} from "./hooks";
import { SchoolClassFormSchema, type SchoolClassFormValues } from "./schema";

interface SchoolClassFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submitLabel: string;
  schoolClass?: SchoolClass;
}

export function SchoolClassFormDialog({
  open,
  onOpenChange,
  submitLabel,
  schoolClass,
}: SchoolClassFormDialogProps) {
  const { t } = useTranslation();
  const stundentafeln = useStundentafeln();
  const weekSchemes = useWeekSchemes();

  const form = useForm<SchoolClassFormValues>({
    resolver: zodResolver(SchoolClassFormSchema),
    defaultValues: {
      name: schoolClass?.name ?? "",
      grade_level: schoolClass?.grade_level ?? 1,
      stundentafel_id: schoolClass?.stundentafel_id ?? "",
      week_scheme_id: schoolClass?.week_scheme_id ?? "",
    },
  });
  const createMutation = useCreateSchoolClass();
  const updateMutation = useUpdateSchoolClass();
  const submitting = createMutation.isPending || updateMutation.isPending;

  const stundentafelOptions = stundentafeln.data ?? [];
  const weekSchemeOptions = weekSchemes.data ?? [];
  const missingPrereqs =
    !stundentafeln.isLoading &&
    !weekSchemes.isLoading &&
    (stundentafelOptions.length === 0 || weekSchemeOptions.length === 0);

  const title = schoolClass ? t("schoolClasses.dialog.editTitle") : t("schoolClasses.dialog.createTitle");
  const description = schoolClass
    ? t("schoolClasses.dialog.editDescription", { name: schoolClass.name })
    : t("schoolClasses.dialog.createDescription");

  async function handleSchoolClassSubmit(values: SchoolClassFormValues) {
    const body = {
      name: values.name,
      grade_level: values.grade_level,
      stundentafel_id: values.stundentafel_id,
      week_scheme_id: values.week_scheme_id,
    };
    if (schoolClass) {
      await updateMutation.mutateAsync({ id: schoolClass.id, body });
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
        {missingPrereqs ? (
          <div
            role="status"
            aria-live="polite"
            className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-foreground"
          >
            <p>{t("schoolClasses.dialog.missingPrereqs")}</p>
            <div className="mt-2 flex flex-wrap gap-3 text-sm font-medium">
              {stundentafelOptions.length === 0 ? (
                <Link to="/stundentafeln" className="underline">
                  {t("schoolClasses.dialog.addStundentafel")}
                </Link>
              ) : null}
              {weekSchemeOptions.length === 0 ? (
                <Link to="/week-schemes" className="underline">
                  {t("schoolClasses.dialog.addWeekScheme")}
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}
        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(handleSchoolClassSubmit)}>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("schoolClasses.columns.name")}</FormLabel>
                  <FormControl>
                    <Input autoFocus {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="grade_level"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("schoolClasses.fields.gradeLevelLabel")}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      max={13}
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
              name="stundentafel_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("schoolClasses.fields.stundentafelLabel")}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t("schoolClasses.fields.stundentafelPlaceholder")} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {stundentafelOptions.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.name}
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
              name="week_scheme_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("schoolClasses.fields.weekSchemeLabel")}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t("schoolClasses.fields.weekSchemePlaceholder")} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {weekSchemeOptions.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={submitting || missingPrereqs}>
                {submitting ? t("common.saving") : submitLabel}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

interface DeleteSchoolClassDialogProps {
  schoolClass: SchoolClass;
  onClose: () => void;
}

export function DeleteSchoolClassDialog({ schoolClass, onClose }: DeleteSchoolClassDialogProps) {
  const { t } = useTranslation();
  const mutation = useDeleteSchoolClass();
  async function confirmSchoolClassDelete() {
    await mutation.mutateAsync(schoolClass.id);
    onClose();
  }
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("schoolClasses.dialog.deleteTitle")}</DialogTitle>
          <DialogDescription>
            {t("schoolClasses.dialog.deleteDescription", { name: schoolClass.name })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={confirmSchoolClassDelete}
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

- [ ] **Step 2.** Note: the `<Link to="/stundentafeln">` will fail TanStack's path validation because that route doesn't exist yet. If the build complains, switch the `to` to a string literal cast: `<Link to={"/stundentafeln" as string}>` is rejected by the rule against `as` casts. Instead, render it as a regular `<a href="/stundentafeln" className="underline">`. The link is informational only; the user has no destination to go to until Stundentafel CRUD ships, so a plain anchor is honest. **Use the `<a href>` form**:

```tsx
<a href="/stundentafeln" className="underline">
  {t("schoolClasses.dialog.addStundentafel")}
</a>
```

(Apply the same change to the `/week-schemes` link too, for consistency, even though that route does exist.)

- [ ] **Step 3.** Wait to commit. The page (Task 6) and route (Task 7) need to land before everything compiles. After Task 7 lands, commit dialogs + page + route together, OR commit dialogs alone after Task 6 if the build passes. For now, leave the file uncommitted.

---

## Task 6: Add SchoolClass page component

**Why:** The page renders the table, hosts the toolbar / empty-state, and orchestrates the dialogs.

**Files:**
- Create: `frontend/src/features/school-classes/school-classes-page.tsx`

- [ ] **Step 1.** Create the file:

```tsx
import { useSearch } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/empty-state";
import { Toolbar } from "@/components/toolbar";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useStundentafeln } from "@/features/stundentafeln/hooks";
import { useWeekSchemes } from "@/features/week-schemes/hooks";
import { type SchoolClass, useSchoolClasses } from "./hooks";
import {
  DeleteSchoolClassDialog,
  SchoolClassFormDialog,
} from "./school-classes-dialogs";

export function SchoolClassesPage() {
  const { t } = useTranslation();
  const schoolClasses = useSchoolClasses();
  const stundentafeln = useStundentafeln();
  const weekSchemes = useWeekSchemes();
  const search = useSearch({ strict: false }) as { create?: string };

  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(() => search.create === "1");
  const [editing, setEditing] = useState<SchoolClass | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SchoolClass | null>(null);

  const stundentafelNameById = new Map(
    (stundentafeln.data ?? []).map((entry) => [entry.id, entry.name]),
  );
  const weekSchemeNameById = new Map(
    (weekSchemes.data ?? []).map((entry) => [entry.id, entry.name]),
  );

  const rows = (schoolClasses.data ?? []).filter((row) =>
    q ? `${row.name} ${row.grade_level}`.toLowerCase().includes(q.toLowerCase()) : true,
  );
  const showEmpty =
    !schoolClasses.isLoading && schoolClasses.data && schoolClasses.data.length === 0 && !q;

  return (
    <div className="space-y-4">
      <SchoolClassesPageHead
        title={t("schoolClasses.title")}
        subtitle={t("schoolClasses.subtitle")}
        onCreate={() => setCreating(true)}
        createLabel={t("schoolClasses.new")}
      />

      {schoolClasses.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : schoolClasses.isError ? (
        <p className="text-sm text-destructive">{t("schoolClasses.loadError")}</p>
      ) : showEmpty ? (
        <EmptyState
          icon={<Users className="h-7 w-7" />}
          title={t("schoolClasses.empty.title")}
          body={t("schoolClasses.empty.body")}
          steps={[
            t("schoolClasses.empty.step1"),
            t("schoolClasses.empty.step2"),
            t("schoolClasses.empty.step3"),
          ]}
          onCreate={() => setCreating(true)}
          createLabel={t("schoolClasses.new")}
        />
      ) : (
        <>
          <Toolbar
            search={q}
            onSearch={setQ}
            placeholder={t("common.search")}
            right={
              <span className="font-mono text-xs text-muted-foreground">
                {rows.length} {t("schoolClasses.title").toLowerCase()}
              </span>
            }
          />
          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="py-2">{t("schoolClasses.columns.name")}</TableHead>
                  <TableHead className="py-2 text-right">
                    {t("schoolClasses.columns.gradeLevel")}
                  </TableHead>
                  <TableHead className="py-2">{t("schoolClasses.columns.stundentafel")}</TableHead>
                  <TableHead className="py-2">{t("schoolClasses.columns.weekScheme")}</TableHead>
                  <TableHead className="w-40 py-2 text-right">
                    {t("schoolClasses.columns.actions")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((schoolClass) => (
                  <TableRow key={schoolClass.id}>
                    <TableCell className="py-1.5 font-medium">{schoolClass.name}</TableCell>
                    <TableCell className="py-1.5 text-right font-mono text-[12.5px]">
                      {schoolClass.grade_level}
                    </TableCell>
                    <TableCell className="py-1.5">
                      {stundentafelNameById.get(schoolClass.stundentafel_id) ?? "—"}
                    </TableCell>
                    <TableCell className="py-1.5">
                      {weekSchemeNameById.get(schoolClass.week_scheme_id) ?? "—"}
                    </TableCell>
                    <TableCell className="space-x-2 py-1.5 text-right">
                      <Button size="sm" variant="outline" onClick={() => setEditing(schoolClass)}>
                        {t("common.edit")}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setConfirmDelete(schoolClass)}
                      >
                        {t("common.delete")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <SchoolClassFormDialog
        open={creating}
        onOpenChange={setCreating}
        submitLabel={t("common.create")}
      />
      {editing ? (
        <SchoolClassFormDialog
          open={true}
          schoolClass={editing}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          submitLabel={t("common.save")}
        />
      ) : null}
      {confirmDelete ? (
        <DeleteSchoolClassDialog
          schoolClass={confirmDelete}
          onClose={() => setConfirmDelete(null)}
        />
      ) : null}
    </div>
  );
}

function SchoolClassesPageHead({
  title,
  subtitle,
  onCreate,
  createLabel,
}: {
  title: string;
  subtitle: string;
  onCreate: () => void;
  createLabel: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-end justify-between gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" disabled title={t("sidebar.comingSoon")}>
          {t("common.import")}
        </Button>
        <Button onClick={onCreate}>{createLabel}</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2.** Wait to commit until the route lands in Task 7.

---

## Task 7: Add the route file

**Why:** Without a route file, the page is unreachable and the TanStack Router plugin won't add it to `routeTree.gen.ts`.

**Files:**
- Create: `frontend/src/routes/_authed.school-classes.tsx`

- [ ] **Step 1.** Create:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { SchoolClassesPage } from "@/features/school-classes/school-classes-page";

const schoolClassesSearchSchema = z.object({
  create: z.literal("1").optional(),
});

export const Route = createFileRoute("/_authed/school-classes")({
  component: SchoolClassesPage,
  validateSearch: schoolClassesSearchSchema,
});
```

- [ ] **Step 2.** Trigger router-tree regen. The fastest way is to start the dev server briefly, or run a build:

```bash
mise exec -- pnpm -C frontend build 2>&1 | tail -20
```

Expected: build succeeds. If it complains that `/stundentafeln` isn't a valid route in `to=`, confirm the dialogs file uses plain `<a href="…">` (Task 5 step 2) and not `<Link to="…">`.

- [ ] **Step 3.** Commit dialogs + page + route together (the trio that depends on each other):

```bash
git add frontend/src/features/school-classes/school-classes-dialogs.tsx frontend/src/features/school-classes/school-classes-page.tsx frontend/src/routes/_authed.school-classes.tsx
git commit -m "feat(frontend): add school-classes page, dialogs, and route"
```

---

## Task 8: Wire navigation chrome (sidebar + crumb)

**Why:** Without these, the page exists but is unreachable from the UI and the breadcrumb is wrong.

**Files:**
- Modify: `frontend/src/components/app-sidebar.tsx`
- Modify: `frontend/src/components/layout/app-shell.tsx`

- [ ] **Step 1.** In `app-sidebar.tsx`, find the `NAV_GROUPS` array and replace the disabled SchoolClasses entry. Old:

```tsx
      { to: "#", labelKey: "sidebar.schoolClasses", icon: Users, disabled: true },
```

New:

```tsx
      { to: "/school-classes", labelKey: "sidebar.schoolClasses", icon: Users },
```

- [ ] **Step 2.** In `frontend/src/components/layout/app-shell.tsx`, extend `currentCrumbKey`. Old:

```ts
function currentCrumbKey(pathname: string) {
  if (pathname.startsWith("/subjects")) return "nav.subjects";
  if (pathname.startsWith("/rooms")) return "nav.rooms";
  if (pathname.startsWith("/teachers")) return "nav.teachers";
  if (pathname.startsWith("/week-schemes")) return "nav.weekSchemes";
  return "nav.dashboard";
}
```

New:

```ts
function currentCrumbKey(pathname: string) {
  if (pathname.startsWith("/subjects")) return "nav.subjects";
  if (pathname.startsWith("/rooms")) return "nav.rooms";
  if (pathname.startsWith("/teachers")) return "nav.teachers";
  if (pathname.startsWith("/week-schemes")) return "nav.weekSchemes";
  if (pathname.startsWith("/school-classes")) return "sidebar.schoolClasses";
  return "nav.dashboard";
}
```

- [ ] **Step 3.** Commit:

```bash
git add frontend/src/components/app-sidebar.tsx frontend/src/components/layout/app-shell.tsx
git commit -m "chore(frontend): wire school-classes into sidebar and crumb"
```

---

## Task 9: Wire the dashboard (StatGrid + QuickAdd)

**Why:** The "Klassen" tile is currently pinned to `0` with a "Coming soon" hint and QuickAdd has no SchoolClasses card; both block on this PR.

**Files:**
- Modify: `frontend/src/features/dashboard/stat-grid.tsx`
- Modify: `frontend/src/features/dashboard/quick-add.tsx`

- [ ] **Step 1.** In `stat-grid.tsx`, import `useSchoolClasses` and replace the hardcoded classes tile:

```tsx
import { useSchoolClasses } from "@/features/school-classes/hooks";
```

Then in the component, after the existing `useWeekSchemes()` line, add:

```tsx
  const schoolClasses = useSchoolClasses();
```

And replace the first `items` entry. Old:

```tsx
    { label: t("dashboard.stats.classes"), value: "0", hint: t("sidebar.comingSoon") },
```

New:

```tsx
    {
      label: t("dashboard.stats.classes"),
      value: formatCount(schoolClasses.data?.length),
      hint: statHint(schoolClasses.data?.length, t("dashboard.hint.noClassesSub")),
    },
```

- [ ] **Step 2.** In `quick-add.tsx`, extend the type unions and `ITEMS`. Old type:

```tsx
interface QuickAddItem {
  to: "/subjects" | "/rooms" | "/teachers" | "/week-schemes";
  icon: LucideIcon;
  labelKey: "nav.subjects" | "nav.rooms" | "nav.teachers" | "nav.weekSchemes";
}
```

New:

```tsx
interface QuickAddItem {
  to: "/subjects" | "/rooms" | "/teachers" | "/week-schemes" | "/school-classes";
  icon: LucideIcon;
  labelKey:
    | "nav.subjects"
    | "nav.rooms"
    | "nav.teachers"
    | "nav.weekSchemes"
    | "sidebar.schoolClasses";
}
```

Add `Users` to the lucide-react import:

```tsx
import { BookOpen, CalendarDays, DoorOpen, GraduationCap, Users } from "lucide-react";
```

Extend `ITEMS`:

```tsx
const ITEMS: QuickAddItem[] = [
  { to: "/subjects", icon: BookOpen, labelKey: "nav.subjects" },
  { to: "/rooms", icon: DoorOpen, labelKey: "nav.rooms" },
  { to: "/teachers", icon: GraduationCap, labelKey: "nav.teachers" },
  { to: "/week-schemes", icon: CalendarDays, labelKey: "nav.weekSchemes" },
  { to: "/school-classes", icon: Users, labelKey: "sidebar.schoolClasses" },
];
```

Adjust the grid wrapper from `grid-cols-2` to keep wrapping nicely with five items. The current `mt-3 grid grid-cols-2 gap-2` works for any count (rows wrap naturally), so no class change needed.

- [ ] **Step 3.** Update the `dashboard-page.test.tsx` if it asserts a specific count of QuickAdd cards. Check first:

```bash
grep -n "QuickAdd\|quickAdd\|cards\|tiles" frontend/tests/dashboard-page.test.tsx | head -10
```

If no count assertion exists, no change needed. If one does, bump it from 4 to 5. (For the tile assertion in `stat-grid`-related tests, the count is fixed at 5; nothing changes.)

- [ ] **Step 4.** Commit:

```bash
git add frontend/src/features/dashboard/stat-grid.tsx frontend/src/features/dashboard/quick-add.tsx
git commit -m "chore(frontend): wire school-classes into dashboard tiles"
```

---

## Task 10: Add page test

**Why:** Mirrors the batch-1 floor: list-render assertion + create-flow assertion. Confirms MSW handlers, hooks, dialogs, and page all work end-to-end in jsdom.

**Files:**
- Create: `frontend/tests/school-classes-page.test.tsx`

- [ ] **Step 1.** Write the failing test. Create the file:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it } from "vitest";
import { SchoolClassesPage } from "@/features/school-classes/school-classes-page";
import i18n from "@/i18n/init";
import { renderWithProviders } from "./render-helpers";

describe("SchoolClassesPage", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("de");
  });

  it("renders school classes fetched from the API", async () => {
    renderWithProviders(<SchoolClassesPage />);
    expect(await screen.findByText("1a")).toBeInTheDocument();
    // The mapped Stundentafel name from the seed
    expect(screen.getByText("Grundschule Klasse 1")).toBeInTheDocument();
    // The mapped WeekScheme name from the existing seed
    expect(screen.getByText("Standardwoche")).toBeInTheDocument();
  });

  it("creates a school class via the dialog and closes on success", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SchoolClassesPage />);

    await screen.findByText("1a");
    await user.click(screen.getByRole("button", { name: /neue klasse/i }));

    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/^name$/i), "1b");

    // Open the curriculum select and pick the seeded entry
    await user.click(within(dialog).getByRole("combobox", { name: /stundentafel/i }));
    await user.click(await screen.findByRole("option", { name: /grundschule klasse 1/i }));

    // Open the week scheme select and pick the seeded entry
    await user.click(within(dialog).getByRole("combobox", { name: /wochenschema/i }));
    await user.click(await screen.findByRole("option", { name: /standardwoche/i }));

    await user.click(within(dialog).getByRole("button", { name: /^anlegen$/i }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2.** Run the failing test:

```bash
mise exec -- pnpm -C frontend exec vitest run tests/school-classes-page.test.tsx
```

Expected (if anything was missed earlier): the test fails with a clear message such as "missing handler" (Task 2 wasn't run) or "not in route tree" (Task 7 wasn't run). If the test passes, all upstream pieces landed correctly.

- [ ] **Step 3.** If the test fails because the `combobox` role doesn't match the shadcn `Select` trigger in jsdom (Radix renders `combobox` only when expanded; the closed trigger has `role="combobox"` already since Radix Select v2), inspect the rendered DOM:

```bash
mise exec -- pnpm -C frontend exec vitest run tests/school-classes-page.test.tsx 2>&1 | grep -A 2 "Unable to find" | head -10
```

If the combobox query doesn't work, switch to `getByText` or `getByLabelText` for the trigger. The shadcn `Select` puts the label on the form item via `<FormLabel htmlFor=…>`, so `getByLabelText` is reliable.

- [ ] **Step 4.** Once green, commit:

```bash
git add frontend/tests/school-classes-page.test.tsx
git commit -m "test(frontend): cover school-classes list and create flow"
```

---

## Task 11: Final lint, full test run, coverage check

**Why:** Catches anything the per-task verifications missed; confirms the coverage ratchet still passes.

- [ ] **Step 1.** Run lint:

```bash
mise run lint
```

Expected: pass. If clippy / cargo-fmt / ruff complain about unrelated files, leave them; only fix issues this branch introduced.

- [ ] **Step 2.** Run the full frontend test:

```bash
mise run fe:test
```

Expected: all tests pass, including the existing `subjects`, `rooms`, `teachers`, `week-schemes`, `dashboard-page`, `i18n`, `theme-toggle`, etc.

- [ ] **Step 3.** Run the coverage variant and inspect the ratchet:

```bash
mise run fe:test:cov 2>&1 | tail -30
```

Expected: ratchet passes against `.coverage-baseline-frontend`. If it fails with a baseline-drop message:

- Look at the printed `total.lines.pct` value.
- If the new value is higher than baseline, something is off — investigate.
- If the new value is genuinely lower (e.g., 60% vs 61% baseline) and you've sanity-checked that nothing regressed, run:

```bash
mise run fe:cov:update-baseline
git add .coverage-baseline-frontend
git commit -m "chore(frontend): rebaseline coverage after school-classes"
```

- [ ] **Step 4.** Run the Python tests too, in case anything in the OpenAPI types ride-along touched the schema generation:

```bash
mise run test:py
```

Expected: pass.

- [ ] **Step 5.** Confirm the rest of the test suite still works:

```bash
mise run test
```

Expected: pass. If anything fails, investigate before pushing.

- [ ] **Step 6.** No additional commit unless coverage was rebaselined.

---

## Self-review

**Spec coverage:**
- ✅ /school-classes route, table, dialogs (Tasks 5-7)
- ✅ FK dropdowns for stundentafel + week-scheme (Task 5)
- ✅ Empty-FK guard with disabled submit + linked alert (Task 5)
- ✅ Sidebar enables existing entry, drops disabled (Task 8)
- ✅ Top-bar crumb extended (Task 8)
- ✅ Dashboard StatGrid wired to live count (Task 9)
- ✅ Dashboard QuickAdd extended (Task 9)
- ✅ List + create test (Task 10)
- ✅ EN + DE i18n (Task 4)
- ✅ Coverage ratchet check (Task 11)

**Placeholder scan:** None. Every step has either a concrete code block or an explicit shell command.

**Type consistency:** `SchoolClassFormSchema` field names (`name`, `grade_level`, `stundentafel_id`, `week_scheme_id`) match the backend `SchoolClassCreate` shape exactly. `useStundentafeln` returns `Stundentafel[]` typed against `StundentafelListResponse`. The `SchoolClass` type alias in `hooks.ts` matches `SchoolClassResponse`. Dialog signatures (`schoolClass?: SchoolClass`, `onClose: () => void`) match the page's call sites.

---

## Execution mode

Per the autopilot workflow this plan is invoked from, dispatch each task to a fresh `general-purpose` subagent. Tasks 2, 3, 4, 8, 9, 10 are sequential because they share state across each other or with later tasks. Tasks 5, 6, 7 share files (the new feature folder is created in 5 / 6 and the route in 7) and must be sequential too. Task 1 stands alone. Task 11 runs last.
