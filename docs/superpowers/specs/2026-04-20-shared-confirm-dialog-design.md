# Shared ConfirmDialog primitive

**Date:** 2026-04-20
**Status:** Design approved, plan pending.

## Problem

Seven entity CRUD pages each ship their own `Delete<Entity>Dialog` component, and `stundentafeln-dialogs.tsx` carries an eighth `DeleteEntryDialog` for the sub-resource row. All eight are structurally identical: a shadcn `Dialog` with `DialogTitle`, `DialogDescription`, a cancel `Button`, and a destructive confirm `Button` that awaits a delete mutation and then calls `onClose`. The only per-call-site variation is the i18n keys and the mutation hook.

`docs/superpowers/OPEN_THINGS.md` already tracks the extraction as tech debt:

> Shared `ConfirmDialog` component. Each CRUD page ships its own `Delete<Entity>Dialog` with identical structure (cancel button, destructive confirm button, pending label). Extract once the sixth entity lands, or once a non-delete confirmation (e.g. "publish schedule") gives the abstraction a second use.

The sixth-entity gate passed when Rooms, Teachers, Subjects, WeekSchemes, SchoolClasses, Stundentafeln, and Lessons all shipped their CRUD pages. Extracting the primitive is now pure tidy-first cleanup: remove duplication, preserve behavior, make any future confirm-style dialog cheaper to ship.

## Goal

Ship one `ConfirmDialog` component under `frontend/src/components/confirm-dialog.tsx` and migrate all eight call sites to it without changing user-visible behavior.

## Non-goals

- **Toast primitive.** OPEN_THINGS separately tracks "Shared toast primitive"; the `window.alert(...)` fallback in the school-classes "Generate lessons" action belongs to that item, not this one.
- **Typed 409 handling for in-use entities.** Also tracked separately in OPEN_THINGS ("Typed deletion errors for in-use entities"). Out of scope here; the primitive does not care what shape of error the caller's mutation throws.
- **Page-level delete-path tests.** No existing `*.test.tsx` exercises a delete dialog today. Adding page-level coverage for every delete flow is its own testing PR. This PR unit-tests the new primitive only.
- **Backend or mutation changes.** Mutations stay in each feature's `hooks.ts`. The primitive is purely presentational.
- **`AlertDialog` adoption.** shadcn's `AlertDialog` is an alternative base, but switching from the existing `Dialog` idiom would be a behavioral change (different focus trap semantics, different ARIA role). Keep the existing `Dialog` base; it's the structural swap that matters.

## Design

### Component shape

```tsx
// frontend/src/components/confirm-dialog.tsx
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

Notes:

- `title` and `description` are `ReactNode` so callers can pass a plain `string` (from `t(key)`) or a JSX fragment (from `t(key, { ...interpolation })` when rich formatting is needed later).
- The primitive calls `useTranslation` only to resolve default button labels. Callers that want non-default copy pass the `*Label` props and bypass the defaults.
- `onConfirm` is called without awaiting inside an event-handler context (`void onConfirm()`). Any rejection propagates to TanStack Query's global `onError`, matching today's behavior. Callers that want to close after success call `onClose()` themselves inside their async `onConfirm`.
- `confirmVariant` defaults to `"destructive"` since every current caller is a delete. A future "publish schedule" style flow sets `confirmVariant="default"`.

### Migration table

Eight call sites. Each row lists the current title/description keys and mutation hook so the plan can be mechanical.

| File | Current component | Title key | Description key | Mutation hook |
| --- | --- | --- | --- | --- |
| `features/rooms/rooms-dialogs.tsx` | `DeleteRoomDialog` | `rooms.dialog.deleteTitle` | `rooms.dialog.deleteDescription` (`{ name }`) | `useDeleteRoom` |
| `features/teachers/teachers-dialogs.tsx` | `DeleteTeacherDialog` | `teachers.dialog.deleteTitle` | `teachers.dialog.deleteDescription` (`{ name: first last }`) | `useDeleteTeacher` |
| `features/subjects/subjects-dialogs.tsx` | `DeleteSubjectDialog` | `subjects.dialog.deleteTitle` | `subjects.dialog.deleteDescription` (`{ name }`) | `useDeleteSubject` |
| `features/week-schemes/week-schemes-dialogs.tsx` | `DeleteWeekSchemeDialog` | `weekSchemes.dialog.deleteTitle` | `weekSchemes.dialog.deleteDescription` (`{ name }`) | `useDeleteWeekScheme` |
| `features/school-classes/school-classes-dialogs.tsx` | `DeleteSchoolClassDialog` | `schoolClasses.dialog.deleteTitle` | `schoolClasses.dialog.deleteDescription` (`{ name }`) | `useDeleteSchoolClass` |
| `features/lessons/lessons-dialogs.tsx` | `DeleteLessonDialog` | `lessons.dialog.deleteTitle` | `lessons.dialog.deleteDescription` (`{ className, subjectName }`) | `useDeleteLesson` |
| `features/stundentafeln/stundentafeln-dialogs.tsx` | `DeleteStundentafelDialog` | `stundentafeln.dialog.deleteTitle` | `stundentafeln.dialog.deleteDescription` (`{ name }`) | `useDeleteStundentafel` |
| `features/stundentafeln/stundentafeln-dialogs.tsx` | `DeleteEntryDialog` (local) | `stundentafeln.entries.deleteTitle` | `stundentafeln.entries.deleteDescription` (`{ subjectName }`) | `useDeleteStundentafelEntry(tafelId)` |

Each migrated call site shrinks from ~25 LoC to ~15 LoC. Example target shape:

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

The thin `Delete<Entity>Dialog` wrapper stays because each entity has a specific prop contract (`{ room }`, `{ teacher }`, etc.) and callers import it by name. The wrapper's body is now one JSX expression.

### Behavior preservation

- Cancel button: outline variant, label from `t("common.cancel")`, calls `onClose`. Same as today.
- Confirm button: destructive variant, label from `t("common.delete")` or `t("common.deleting")` when pending, disabled while pending, calls the mutation then closes. Same as today.
- Dialog close on ESC or backdrop click: `onOpenChange` fires with `false`; `!next && onClose()` runs. Same as today.
- Accessibility: `DialogTitle` and `DialogDescription` are required props, so screen-reader wiring cannot regress. Frontend CLAUDE.md rule on "No dialogs without DialogTitle / DialogDescription" is enforced structurally.
- i18n: same translation keys per feature; no en.json or de.json changes.
- Error path: unchanged. The mutation's `onError` (global toast, once wired) still fires; the dialog stays open because `onClose()` is skipped when `mutateAsync` rejects.

### Testing

One new test file: `frontend/src/components/confirm-dialog.test.tsx`. Five unit tests:

1. Renders the given title and description, plus default cancel/confirm labels pulled from `t()`.
2. Clicking the cancel button invokes `onClose`.
3. Clicking the confirm button invokes `onConfirm`.
4. `isPending` disables the confirm button and swaps the label to `pendingLabel` (or the default `t("common.deleting")`).
5. Pressing Escape or clicking the backdrop fires `onClose` (tests Radix's standard keyboard / outside-click behavior through our wrapper; Radix polyfills in `tests/setup.ts` already cover this).

Use `renderWithProviders` from `frontend/tests/render-helpers.tsx`. Pin locale to English at the top of the file (`beforeAll(() => i18n.changeLanguage("en"))`) so assertions can match "Delete" / "Deleting…" / "Cancel" rather than the German defaults.

No page-level test changes. The seven page test files (`rooms-page.test.tsx`, etc.) do not currently exercise delete paths and stay as-is.

### Ripple effect on coverage ratchet

The migrated dialogs are uncovered today (the delete path has zero test touches). Deleting their bodies removes uncovered lines. The new `confirm-dialog.tsx` and its tests add covered lines. Net impact: neutral to slightly positive on `total.lines.pct`. If the baseline moves up enough, `mise run fe:cov:update-baseline` after CI and commit the new baseline in a follow-up commit on the same branch.

## Implementation order

Two structural commits after the `docs(claude)` commit that saved the tidy-first rule:

1. `refactor(frontend): introduce ConfirmDialog primitive`. Adds `confirm-dialog.tsx` and `confirm-dialog.test.tsx`. No call-site changes.
2. `refactor(frontend): adopt ConfirmDialog in entity delete dialogs`. Migrates all eight call sites. Deletes the now-dead `confirm<Entity>Delete` helpers. No test changes in the migrated files.

This respects Kent Beck's rule: structural and behavioral changes never ship together. Both commits are purely structural.

## Risks

- **Missed call site.** Eight known call sites; `Grep` for `export function Delete\w+Dialog` confirms the count. Any future dialog added between spec and merge must also be migrated. Low risk on a single-day branch.
- **Focus / keyboard regression.** The primitive uses the same shadcn `Dialog` as today, so ARIA wiring and focus trap should be identical. Unit test 5 (ESC / backdrop) guards this.
- **Translation key typos during migration.** Each call site keeps its existing keys; a typo would flip the rendered text at runtime. Mitigated by the typed i18n resource (`src/i18n/types.d.ts`) which breaks the build on unknown keys, and by a final local run of `mise run fe:build` plus `cd frontend && mise exec -- pnpm exec tsc --noEmit` before push.
- **Coverage ratchet drop.** Low risk given the math above, but if it drops, update the baseline in the same PR.
- **Biome / ty / vulture / ruff picking up unused imports after the migration.** The pre-commit hook runs all of these; expect the `Dialog`, `DialogContent`, `DialogDescription`, `DialogFooter`, `DialogHeader`, `DialogTitle`, `Button` imports to shrink in the migrated files. Strip unused imports in the same commit.

## Follow-ups (not this PR)

- When the shared toast lands, revisit the delete happy path to surface a success toast from `ConfirmDialog` (or from the caller's mutation onSuccess, more likely) in the same pass that replaces the Generate-lessons `window.alert`.
- First non-delete adoption (e.g. a "publish schedule" confirmation) validates the `confirmVariant="default"` branch.
