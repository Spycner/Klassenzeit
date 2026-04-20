# Shared ConfirmDialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract a shared `ConfirmDialog` primitive and migrate the 8 near-identical delete dialogs to use it, preserving all user-visible behavior.

**Architecture:** One presentational component in `frontend/src/components/confirm-dialog.tsx` wraps shadcn's `Dialog` with a cancel + destructive-confirm footer. Defaults for button labels come from the shared `common.*` i18n keys. Callers remain thin wrappers that bind entity-specific props to the primitive. Structural-only change: behavior, i18n keys, accessibility wiring, and error propagation are preserved.

**Tech Stack:** React 19, TanStack Query (already in callers), react-i18next, shadcn/ui, Vitest + React Testing Library, MSW for feature tests (not exercised by new tests here), Biome for lint, Vitest `coverage-v8` for the ratchet.

**References:** spec at `docs/superpowers/specs/2026-04-20-shared-confirm-dialog-design.md`, OPEN_THINGS item "Shared `ConfirmDialog` component".

---

## File Structure

- **Create:** `frontend/src/components/confirm-dialog.tsx` (~60 LoC). Single exported `ConfirmDialog` component. Owns no state, no mutations; consumes `useTranslation` only for default button labels.
- **Create:** `frontend/src/components/confirm-dialog.test.tsx` (~120 LoC). Five Vitest tests using `renderWithProviders` from `frontend/tests/render-helpers.tsx`. Pins locale to English in `beforeAll`.
- **Modify:** `frontend/src/features/rooms/rooms-dialogs.tsx` (replace `DeleteRoomDialog` body).
- **Modify:** `frontend/src/features/teachers/teachers-dialogs.tsx` (replace `DeleteTeacherDialog` body).
- **Modify:** `frontend/src/features/subjects/subjects-dialogs.tsx` (replace `DeleteSubjectDialog` body).
- **Modify:** `frontend/src/features/week-schemes/week-schemes-dialogs.tsx` (replace `DeleteWeekSchemeDialog` body).
- **Modify:** `frontend/src/features/school-classes/school-classes-dialogs.tsx` (replace `DeleteSchoolClassDialog` body).
- **Modify:** `frontend/src/features/lessons/lessons-dialogs.tsx` (replace `DeleteLessonDialog` body).
- **Modify:** `frontend/src/features/stundentafeln/stundentafeln-dialogs.tsx` (replace both `DeleteStundentafelDialog` and the local `DeleteEntryDialog` bodies).

No test files are modified. No i18n catalog changes. No mutation changes.

---

## Task 1: Introduce ConfirmDialog primitive

**Files:**
- Create: `frontend/src/components/confirm-dialog.tsx`
- Test: `frontend/src/components/confirm-dialog.test.tsx`

- [ ] **Step 1: Write the failing test file**

Create `frontend/src/components/confirm-dialog.test.tsx`:

```tsx
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "@/components/confirm-dialog";
import i18n from "@/i18n/config";
import { renderWithProviders } from "../../tests/render-helpers";

beforeAll(() => {
  void i18n.changeLanguage("en");
});

describe("ConfirmDialog", () => {
  it("renders title, description, and default cancel/confirm labels", () => {
    renderWithProviders(
      <ConfirmDialog
        open
        onClose={() => {}}
        title="Delete the thing?"
        description="This cannot be undone."
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByRole("heading", { name: "Delete the thing?" })).toBeInTheDocument();
    expect(screen.getByText("This cannot be undone.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("invokes onClose when the cancel button is clicked", () => {
    const onClose = vi.fn();
    renderWithProviders(
      <ConfirmDialog
        open
        onClose={onClose}
        title="t"
        description="d"
        onConfirm={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("invokes onConfirm when the confirm button is clicked", () => {
    const onConfirm = vi.fn();
    renderWithProviders(
      <ConfirmDialog
        open
        onClose={() => {}}
        title="t"
        description="d"
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("disables the confirm button and swaps the label when isPending is true", () => {
    renderWithProviders(
      <ConfirmDialog
        open
        onClose={() => {}}
        title="t"
        description="d"
        onConfirm={() => {}}
        isPending
      />,
    );
    const confirm = screen.getByRole("button", { name: /deleting/i });
    expect(confirm).toBeDisabled();
  });

  it("fires onClose when Escape is pressed", async () => {
    const onClose = vi.fn();
    renderWithProviders(
      <ConfirmDialog
        open
        onClose={onClose}
        title="t"
        description="d"
        onConfirm={() => {}}
      />,
    );
    fireEvent.keyDown(document.body, { key: "Escape" });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run from repo root: `cd frontend && mise exec -- pnpm vitest run src/components/confirm-dialog.test.tsx`

Expected: FAIL. Vitest reports cannot resolve `@/components/confirm-dialog` (module does not exist yet).

- [ ] **Step 3: Create the ConfirmDialog component**

Create `frontend/src/components/confirm-dialog.tsx`:

```tsx
import type { ReactNode } from "react";
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

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description: ReactNode;
  onConfirm: () => Promise<void> | void;
  isPending?: boolean;
  confirmLabel?: ReactNode;
  pendingLabel?: ReactNode;
  cancelLabel?: ReactNode;
  confirmVariant?: "destructive" | "default";
}

export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  onConfirm,
  isPending = false,
  confirmLabel,
  pendingLabel,
  cancelLabel,
  confirmVariant = "destructive",
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  const resolvedCancel = cancelLabel ?? t("common.cancel");
  const resolvedConfirm = confirmLabel ?? t("common.delete");
  const resolvedPending = pendingLabel ?? t("common.deleting");
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {resolvedCancel}
          </Button>
          <Button
            variant={confirmVariant}
            onClick={() => {
              void onConfirm();
            }}
            disabled={isPending}
          >
            {isPending ? resolvedPending : resolvedConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && mise exec -- pnpm vitest run src/components/confirm-dialog.test.tsx`

Expected: PASS. All five tests green.

- [ ] **Step 5: Run lint and typecheck**

Run:
- `mise run lint` from repo root (runs biome, ruff, ty, clippy, etc.)
- `cd frontend && mise exec -- pnpm exec tsc --noEmit` (stricter than `vite build`, catches `noUncheckedIndexedAccess`)

Expected: all green. If biome reports an unused import, remove it.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/confirm-dialog.tsx frontend/src/components/confirm-dialog.test.tsx
git commit -m "refactor(frontend): introduce ConfirmDialog primitive"
```

---

## Task 2: Adopt ConfirmDialog in all entity delete dialogs

**Files:**
- Modify: `frontend/src/features/rooms/rooms-dialogs.tsx` (`DeleteRoomDialog` and its imports)
- Modify: `frontend/src/features/teachers/teachers-dialogs.tsx` (`DeleteTeacherDialog` and its imports)
- Modify: `frontend/src/features/subjects/subjects-dialogs.tsx` (`DeleteSubjectDialog` and its imports)
- Modify: `frontend/src/features/week-schemes/week-schemes-dialogs.tsx` (`DeleteWeekSchemeDialog` and its imports)
- Modify: `frontend/src/features/school-classes/school-classes-dialogs.tsx` (`DeleteSchoolClassDialog` and its imports)
- Modify: `frontend/src/features/lessons/lessons-dialogs.tsx` (`DeleteLessonDialog` and its imports)
- Modify: `frontend/src/features/stundentafeln/stundentafeln-dialogs.tsx` (both `DeleteStundentafelDialog` and the local `DeleteEntryDialog`, plus their imports)

For each file, the pattern is:

1. Replace the body of the `Delete<Entity>Dialog` (and, for stundentafeln, also `DeleteEntryDialog`) with a single `<ConfirmDialog ... />` JSX expression.
2. Delete the now-unused `confirm<Entity>Delete` helper function.
3. Import `ConfirmDialog` from `@/components/confirm-dialog`.
4. Remove any `Dialog`, `DialogContent`, `DialogDescription`, `DialogFooter`, `DialogHeader`, `DialogTitle`, and `Button` imports that are no longer referenced by the file's remaining code (the form dialogs in the same file still use several of these, so check before removing each one).

Below is the exact target shape for each call site. Each call site mirrors the original title/description keys and mutation hook; nothing semantic moves.

- [ ] **Step 1: Migrate `DeleteRoomDialog`**

Replace the body at `frontend/src/features/rooms/rooms-dialogs.tsx:200-227` with:

```tsx
export function DeleteRoomDialog({ room, onClose }: DeleteRoomDialogProps) {
  const { t } = useTranslation();
  const mutation = useDeleteRoom();
  return (
    <ConfirmDialog
      open
      onClose={onClose}
      title={t("rooms.dialog.deleteTitle")}
      description={t("rooms.dialog.deleteDescription", { name: room.name })}
      isPending={mutation.isPending}
      onConfirm={async () => {
        await mutation.mutateAsync(room.id);
        onClose();
      }}
    />
  );
}
```

Add `import { ConfirmDialog } from "@/components/confirm-dialog";` alongside the existing imports.

Check the top of the file after the edit: the `RoomFormDialog` above still uses `Dialog`, `DialogContent`, `DialogDescription`, `DialogFooter`, `DialogHeader`, `DialogTitle`, and `Button`, so keep those imports. Biome's `noUnusedImports` will flag anything you leave over.

- [ ] **Step 2: Migrate `DeleteTeacherDialog`**

Replace the body at `frontend/src/features/teachers/teachers-dialogs.tsx:166-199`:

```tsx
export function DeleteTeacherDialog({ teacher, onClose }: DeleteTeacherDialogProps) {
  const { t } = useTranslation();
  const mutation = useDeleteTeacher();
  return (
    <ConfirmDialog
      open
      onClose={onClose}
      title={t("teachers.dialog.deleteTitle")}
      description={t("teachers.dialog.deleteDescription", {
        name: `${teacher.first_name} ${teacher.last_name}`,
      })}
      isPending={mutation.isPending}
      onConfirm={async () => {
        await mutation.mutateAsync(teacher.id);
        onClose();
      }}
    />
  );
}
```

Add `import { ConfirmDialog } from "@/components/confirm-dialog";` and prune unused shadcn imports if any.

- [ ] **Step 3: Migrate `DeleteSubjectDialog`**

Replace the body at `frontend/src/features/subjects/subjects-dialogs.tsx:139-170`:

```tsx
export function DeleteSubjectDialog({ subject, onClose }: DeleteSubjectDialogProps) {
  const { t } = useTranslation();
  const mutation = useDeleteSubject();
  return (
    <ConfirmDialog
      open
      onClose={onClose}
      title={t("subjects.dialog.deleteTitle")}
      description={t("subjects.dialog.deleteDescription", { name: subject.name })}
      isPending={mutation.isPending}
      onConfirm={async () => {
        await mutation.mutateAsync(subject.id);
        onClose();
      }}
    />
  );
}
```

Add the `ConfirmDialog` import and prune unused shadcn imports if any.

- [ ] **Step 4: Migrate `DeleteWeekSchemeDialog`**

Replace the body at `frontend/src/features/week-schemes/week-schemes-dialogs.tsx:139-170`:

```tsx
export function DeleteWeekSchemeDialog({ scheme, onClose }: DeleteWeekSchemeDialogProps) {
  const { t } = useTranslation();
  const mutation = useDeleteWeekScheme();
  return (
    <ConfirmDialog
      open
      onClose={onClose}
      title={t("weekSchemes.dialog.deleteTitle")}
      description={t("weekSchemes.dialog.deleteDescription", { name: scheme.name })}
      isPending={mutation.isPending}
      onConfirm={async () => {
        await mutation.mutateAsync(scheme.id);
        onClose();
      }}
    />
  );
}
```

Add the `ConfirmDialog` import and prune unused shadcn imports if any.

- [ ] **Step 5: Migrate `DeleteSchoolClassDialog`**

Replace the body at `frontend/src/features/school-classes/school-classes-dialogs.tsx:238-269`:

```tsx
export function DeleteSchoolClassDialog({ schoolClass, onClose }: DeleteSchoolClassDialogProps) {
  const { t } = useTranslation();
  const mutation = useDeleteSchoolClass();
  return (
    <ConfirmDialog
      open
      onClose={onClose}
      title={t("schoolClasses.dialog.deleteTitle")}
      description={t("schoolClasses.dialog.deleteDescription", { name: schoolClass.name })}
      isPending={mutation.isPending}
      onConfirm={async () => {
        await mutation.mutateAsync(schoolClass.id);
        onClose();
      }}
    />
  );
}
```

Add the `ConfirmDialog` import and prune unused shadcn imports if any.

- [ ] **Step 6: Migrate `DeleteLessonDialog`**

Replace the body at `frontend/src/features/lessons/lessons-dialogs.tsx:302-332`:

```tsx
export function DeleteLessonDialog({ lesson, onClose }: DeleteLessonDialogProps) {
  const { t } = useTranslation();
  const mutation = useDeleteLesson();
  return (
    <ConfirmDialog
      open
      onClose={onClose}
      title={t("lessons.dialog.deleteTitle")}
      description={t("lessons.dialog.deleteDescription", {
        className: lesson.school_class.name,
        subjectName: lesson.subject.name,
      })}
      isPending={mutation.isPending}
      onConfirm={async () => {
        await mutation.mutateAsync(lesson.id);
        onClose();
      }}
    />
  );
}
```

Add the `ConfirmDialog` import and prune unused shadcn imports if any.

- [ ] **Step 7: Migrate `DeleteStundentafelDialog` and `DeleteEntryDialog`**

In `frontend/src/features/stundentafeln/stundentafeln-dialogs.tsx`, replace the body at lines 542-573 with:

```tsx
export function DeleteStundentafelDialog({ stundentafel, onClose }: DeleteStundentafelDialogProps) {
  const { t } = useTranslation();
  const mutation = useDeleteStundentafel();
  return (
    <ConfirmDialog
      open
      onClose={onClose}
      title={t("stundentafeln.dialog.deleteTitle")}
      description={t("stundentafeln.dialog.deleteDescription", { name: stundentafel.name })}
      isPending={mutation.isPending}
      onConfirm={async () => {
        await mutation.mutateAsync(stundentafel.id);
        onClose();
      }}
    />
  );
}
```

And replace the body at lines 581-610 (the local `DeleteEntryDialog`) with:

```tsx
function DeleteEntryDialog({ tafelId, entry, onClose }: DeleteEntryDialogProps) {
  const { t } = useTranslation();
  const mutation = useDeleteStundentafelEntry(tafelId);
  return (
    <ConfirmDialog
      open
      onClose={onClose}
      title={t("stundentafeln.entries.deleteTitle")}
      description={t("stundentafeln.entries.deleteDescription", {
        subjectName: entry.subject.name,
      })}
      isPending={mutation.isPending}
      onConfirm={async () => {
        await mutation.mutateAsync(entry.id);
        onClose();
      }}
    />
  );
}
```

Add `import { ConfirmDialog } from "@/components/confirm-dialog";` and prune any imports from `@/components/ui/dialog` or `@/components/ui/button` that no longer have a caller (several larger form dialogs above still use them, so verify each).

- [ ] **Step 8: Run the full frontend test suite**

Run from repo root: `mise run fe:test`

Expected: PASS. All previously green tests stay green. No test file was modified.

- [ ] **Step 9: Run lint and typecheck**

Run:
- `mise run lint` (biome across the whole frontend, plus all other linters)
- `cd frontend && mise exec -- pnpm exec tsc --noEmit` (strict mode, catches what `vite build` skips)
- `mise run fe:build` (sanity-check the Vite build)

Expected: all green. Biome's `noUnusedImports` rule will fail the lint if any of the removed imports are still in scope; fix in place.

- [ ] **Step 10: Run the coverage check locally**

Run: `mise run fe:cov`

Expected: PASS. Watch `total.lines.pct`: the migration deletes uncovered dialog bodies and adds covered primitive + tests, so the number should hold or drift up. If it drifts up past the baseline, run `mise run fe:cov:update-baseline` and stage the updated `.coverage-baseline-frontend`.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/features/rooms/rooms-dialogs.tsx \
        frontend/src/features/teachers/teachers-dialogs.tsx \
        frontend/src/features/subjects/subjects-dialogs.tsx \
        frontend/src/features/week-schemes/week-schemes-dialogs.tsx \
        frontend/src/features/school-classes/school-classes-dialogs.tsx \
        frontend/src/features/lessons/lessons-dialogs.tsx \
        frontend/src/features/stundentafeln/stundentafeln-dialogs.tsx
# Plus .coverage-baseline-frontend if it moved.
git commit -m "refactor(frontend): adopt ConfirmDialog in entity delete dialogs"
```

---

## Task 3: Documentation sweep

**Files:**
- Modify: `docs/superpowers/OPEN_THINGS.md` (remove the resolved ConfirmDialog item).

- [ ] **Step 1: Remove the resolved item**

Delete the "Shared `ConfirmDialog` component" bullet from `docs/superpowers/OPEN_THINGS.md`. The bullet currently lives in the "Product capabilities" section and reads:

> **Shared `ConfirmDialog` component.** Each CRUD page ships its own `Delete<Entity>Dialog` with identical structure (cancel button, destructive confirm button, pending label). Extract once the sixth entity lands, or once a non-delete confirmation (e.g. "publish schedule") gives the abstraction a second use.

- [ ] **Step 2: Run the revise-claude-md skill and apply its output**

From the main session: invoke `claude-md-management:revise-claude-md`, let it inspect the diff, and apply any CLAUDE.md updates it proposes (likely none, since the refactor is mechanical and the `components/` convention is already documented).

- [ ] **Step 3: Run the claude-md-improver skill**

Invoke `claude-md-management:claude-md-improver` immediately after. Apply any audit fixes.

- [ ] **Step 4: Commit the docs sweep**

```bash
git add docs/superpowers/OPEN_THINGS.md .claude/CLAUDE.md frontend/CLAUDE.md
# Only stage CLAUDE.md files if the skills actually changed them.
git commit -m "docs: remove resolved ConfirmDialog tech-debt item"
```

---

## Self-Review

Spec coverage check:

- Spec Goal: "Ship one `ConfirmDialog` ... and migrate all eight call sites." Task 1 ships the primitive; Task 2 migrates eight call sites (seven top-level dialogs plus the nested `DeleteEntryDialog`).
- Spec "Component shape" prop list matches Task 1 Step 3 verbatim.
- Spec "Migration table" rows 1-8 map one-to-one to Task 2 Steps 1-7 (Step 7 covers both stundentafeln dialogs).
- Spec "Testing" five tests map one-to-one to Task 1 Step 1 test bodies.
- Spec "Behavior preservation" is guarded by the TDD red-green in Task 1 and the unchanged test suite run in Task 2 Step 8.
- Spec "Ripple effect on coverage ratchet" has its sibling step in Task 2 Step 10.
- Spec "Risks" item about missed call sites is addressed by the explicit eight-file list in Task 2; Biome's unused-imports rule covers lingering shadcn imports.

Placeholder scan: no "TBD", "TODO", "similar to task N", or "add validation" patterns. Every code-changing step carries a full code block.

Type consistency: the primitive's prop names (`open`, `onClose`, `title`, `description`, `onConfirm`, `isPending`, `confirmLabel`, `pendingLabel`, `cancelLabel`, `confirmVariant`) match across Task 1 Step 3 (implementation), Task 1 Step 1 (tests), and Task 2 Steps 1-7 (call sites).
