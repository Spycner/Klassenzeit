# Subject color and simplified room suitability

**Date:** 2026-04-20
**Status:** Design approved, plan pending.

## Problem

Two gaps in the scheduling data model block downstream work:

1. **Subject color is client-derived.** `frontend/src/features/subjects/subjects-page.tsx:164` hashes a subject's UUID into one of five chart tokens (`--chart-1..5`). Renaming a subject is stable, but renaming its identity (re-create) churns the slot, and users cannot pick a color. The color is visual metadata, not derivable from anything durable.
2. **Room suitability is expressible but unusable.** The schema has `Room.suitability_mode` (`"general" | "specialized"`) and a `RoomSubjectSuitability` M:N join (`backend/src/klassenzeit_backend/db/models/room.py:21,28`). The mode flips the join's meaning: on a general room the list excludes subjects, on a specialized room it includes them. The API exposes `PUT /rooms/{id}/suitability` (`backend/src/klassenzeit_backend/scheduling/routes/rooms.py:276`), but no frontend calls it. Users cannot state "PE belongs in the gym" today.

This spec addresses both gaps in one PR. Solver enforcement of suitability is **out of scope**: the solver is a 47-line skeleton and will consume the simplified rule when it lands.

## Goals

- Subjects carry a persisted `color` stored as a palette key or hex literal.
- Room admins can pick which subjects a room is suitable for, inside the existing Room edit dialog.
- The suitability model is single-mode (plain inclusion). `suitability_mode` is removed.
- Invalid subject IDs in a suitability update return a typed 400 with the missing IDs.

## Non-goals

- Solver integration of the suitability rule.
- A subject-side "allowed rooms" editor.
- Room availability, teacher qualifications, teacher availability, WeekScheme time block editors.
- Bulk import/export that includes color.
- A dedicated Room detail page.

## Suitability rule

A `(subject, room)` pair is valid iff both of:

1. The room's `suitable_subjects` list is empty, **or** it contains the subject.
2. No room lists this subject as suitable, **or** this room is one of those.

Plain English: a room without any listings accepts any subject. A room that lists subjects is restricted to those. A subject that no room lists can go anywhere; a subject that some rooms list can only go in those.

### Worked examples

| Subject | Room | Room's list | Rooms listing subject | Valid? | Reason |
| --- | --- | --- | --- | --- | --- |
| PE | Gym | `[PE, Sport]` | `{Gym}` | yes | Gym lists PE; PE is restricted to Gym; Gym is in that set. |
| PE | Classroom | `[]` | `{Gym}` | no | PE restricted to Gym; Classroom not in that set. |
| Maths | Classroom | `[]` | `{}` | yes | Neither side restricts. |
| Maths | Gym | `[PE, Sport]` | `{}` | no | Gym's non-empty list excludes Maths. |
| Art | Art Studio | `[Art]` | `{Art Studio}` | yes | Art Studio lists Art; Art restricted to Art Studio; Art Studio is in that set. |

The rule is enforced in application logic when the solver starts caring; nothing schema-level prevents a violating row from existing in `lessons` today because lessons do not yet carry a room assignment.

## Data model

### Subject: add `color`

```python
color: Mapped[str] = mapped_column(String(16), nullable=False)
```

Validated in API schemas with the regex `^(chart-(1[0-2]|[1-9])|#[0-9a-fA-F]{6})$`. Value is either a palette token key (`"chart-1"` through `"chart-12"`) or a hex literal (`"#2563eb"`). The frontend resolves token keys to `var(--chart-N)` at render time; hex literals pass through unchanged.

### Room: drop `suitability_mode`

Remove the column entirely. The `RoomSubjectSuitability` join survives unchanged; it now always means "this room is suitable for this subject."

### CSS tokens

Extend `--chart-1..5` to `--chart-1..12` in `frontend/src/styles/app.css` inside both `:root` and `.dark`, following the same hue-shift pattern already in use for the existing five.

## API

### Subjects

- `SubjectCreate` adds `color: str` (required, regex-validated).
- `SubjectUpdate` adds `color: str | None = None`.
- `SubjectResponse` adds `color: str`.
- No new endpoints; the existing `POST /subjects` and `PATCH /subjects/{id}` accept and round-trip the field.

### Rooms

- Remove `suitability_mode` from `RoomCreate`, `RoomUpdate`, `RoomListResponse`, `RoomDetailResponse`.
- Tighten `PUT /rooms/{id}/suitability` (`backend/src/klassenzeit_backend/scheduling/routes/rooms.py:276`):
  - Before insertion, run `SELECT id FROM subjects WHERE id = ANY(:ids)` and compute the missing set.
  - On missing IDs, return `400` with `{"detail": "Some subjects do not exist.", "missing_subject_ids": [...]}`.
  - Deduplicate the input server-side (duplicates are silently collapsed, not errors).
  - Drop the current `IntegrityError → 409` branch; the proactive check makes it unreachable.
- Document the 400 body with a typed Pydantic response model (`MissingSubjectsErrorDetail`) so OpenAPI renders it and the frontend gets typed access via `err.data.missing_subject_ids`.

Pydantic v2 silently ignores extra fields by default, so old clients sending `suitability_mode` will have it dropped, not rejected. The only caller in this repo is the frontend, which updates atomically in the same PR.

## Frontend

### Subjects feature (`frontend/src/features/subjects/`)

- `schema.ts`: `SubjectFormSchema` gains `color: z.string().regex(/^(chart-(1[0-2]|[1-9])|#[0-9a-fA-F]{6})$/)`.
- `subjects-dialogs.tsx`: add a `ColorPicker` control below `short_name`. Layout: 12 swatches in a 6x2 grid, plus a custom hex text input with a small live preview square. Selecting a swatch sets the form value to `"chart-N"`; typing a valid hex sets it to `"#RRGGBB"`. Invalid hex blocks submit via Zod.
- `subjects-page.tsx`: drop the `subjectColor()` hash helper; read `subject.color` and pass it to `resolveSubjectColor`.
- New file `features/subjects/color.ts`:
  - `resolveSubjectColor(color: string): string`. Maps `chart-N` to `var(--chart-N)`; returns `#RRGGBB` literals unchanged.
  - `autoPickColor(name: string): string`. Stable hash over the lowercase name, returns `chart-N`. Used as the form's `defaultValues.color` when creating a new subject so the picker preselects sanely.

### Rooms feature (`frontend/src/features/rooms/`)

- `schema.ts`: remove `suitability_mode`; add `suitable_subject_ids: z.array(z.string()).default([])`.
- `rooms-dialogs.tsx`: drop the mode `Select`. Below the existing fields, add a `SubjectMultiPicker` (chip picker) that:
  - Uses shadcn `Popover` + `Command` + `Badge`.
  - Renders selected subjects as removable chips, each showing the subject's color swatch and short name.
  - Filters the subject list by `name` or `short_name` on the search input.
  - Empty state shows a muted helper: "No subjects selected. Any subject may be scheduled here."
- `rooms-page.tsx`: drop the "Mode" column; add a "Subjects" column that shows a truncated count or a preview of the first two chips (exact render deferred to implementation taste).
- New file `features/rooms/subject-multi-picker.tsx`: the reusable chip picker.

### Mutation pattern (`features/rooms/hooks.ts`)

The room create/edit flow becomes two requests:

- `useCreateRoomWithSuitability`: `POST /rooms` with the base fields, then on 201, `PUT /rooms/{id}/suitability` with the selected subject IDs if the list is non-empty. A single `useMutation` awaits both and exposes combined `isPending`.
- `useUpdateRoomWithSuitability`: `PATCH /rooms/{id}` with base field changes, then `PUT /rooms/{id}/suitability` only if the selected list differs from the room detail fetched for the edit dialog.

On a 400 `missing_subject_ids` response, the mutation surfaces a toast ("Some subjects no longer exist") and leaves the dialog open so the user can re-pick.

### i18n (`frontend/src/i18n/locales/{en,de}.json`)

Add:
- `subjects.color`
- `subjects.colorHelp`
- `subjects.customColor`
- `rooms.suitableSubjects`
- `rooms.suitableSubjectsEmpty`
- `rooms.suitableSubjectsError`

Remove:
- `rooms.suitabilityModes.general`
- `rooms.suitabilityModes.specialized`
- `rooms.columns.mode`

### MSW (`frontend/tests/msw-handlers.ts`)

- Drop `suitability_mode` from seed rooms.
- Add `color` (e.g., `"chart-3"`) to every seed subject.
- Add a mutable `roomSuitabilityByRoomId: Record<string, string[]>` following the `stundentafelEntriesByTafelId` pattern, reset in `beforeEach`.
- `PUT /rooms/:id/suitability`:
  - Validates that every ID exists in the seed subject list.
  - Returns 400 with `missing_subject_ids` on unknown IDs.
  - Dedupes input before storing.
- `GET /rooms/:id` returns `suitability_subjects` populated from the store.

## Migration

Single Alembic migration, `backend/alembic/versions/<hash>_subject_color_and_simplify_suitability.py`:

1. `op.add_column("subjects", sa.Column("color", sa.String(16), nullable=True))`.
2. Python data migration: `SELECT id, name FROM subjects`; for each row compute `chart-{(stable_hash(name.lower()) % 12) + 1}` and `UPDATE subjects SET color = :c WHERE id = :id`.
3. `op.alter_column("subjects", "color", nullable=False)`.
4. `op.drop_column("rooms", "suitability_mode")`.

`downgrade()` is symmetric: re-add `suitability_mode` with `server_default="general"`, drop `color`.

The backfill hash lives in the migration file. The frontend ships its own `autoPickColor` for the new-subject preselect. The two do not need to produce identical values: the backend hash runs once at migration time, the frontend hash only preselects a form field that the user can override. Keeping them decoupled lets us change either independently.

No `RoomSubjectSuitability` rows are dropped. Existing rows flip meaning: previously "specialized room lists allowed subjects" (kept) or "general room lists excluded subjects" (semantics reverse). Before merging, confirm staging does not hold meaningful general-room exclusion rows. If it does, document the flip in the PR description.

Staging rollout is automatic: the self-hosted `deploy-staging` job runs on every master push; the backend container applies pending migrations on startup. No manual step.

## Testing

### Backend (`backend/tests/scheduling/`)

- `test_subjects.py`:
  - `test_create_subject_with_color` posts with a valid color, asserts round-trip.
  - `test_create_subject_color_required` posts without color, expects 422.
  - `test_create_subject_invalid_color` posts malformed value, expects 422.
  - `test_patch_subject_color` updates color only.
  - Update every existing POST body to include `color`.
- `test_rooms.py`:
  - Delete `test_create_specialized_room` and any mode assertions.
  - `test_put_suitability_missing_subject_ids` posts a fake UUID, expects 400 and `missing_subject_ids` in body.
  - `test_put_suitability_dedup` posts duplicate IDs, asserts single row.
  - `test_put_suitability_empty_list` replaces an existing set with `[]`.
  - Update every existing POST/PATCH body to drop `suitability_mode`.

### Frontend (Vitest + RTL)

- `features/subjects/color.test.ts`: `resolveSubjectColor` for both formats; `autoPickColor` determinism.
- `features/subjects/subjects-dialogs.test.tsx`: swatch click updates form; custom hex valid/invalid cases; submit uses the chosen value.
- `features/subjects/subjects-page.test.tsx`: renders swatch from persisted color.
- `features/rooms/subject-multi-picker.test.tsx`: search narrows, click selects, backspace removes, keyboard a11y (Radix pointer-event polyfills from `tests/setup.ts`).
- `features/rooms/rooms-dialogs.test.tsx`: create flow calls POST then PUT suitability; edit flow PATCHes then PUTs only if the list changed; 400 `missing_subject_ids` shows toast and keeps dialog open.

### Coverage

Run `mise run fe:cov:update-baseline` once green. Expect a small positive delta.

### Playwright

Not in scope. Per-entity e2e coverage stays deferred under the existing OPEN_THINGS item.

## ADR

Add `docs/adr/0011-subject-color-and-simplified-suitability.md`. Title format: `# 0011: Subject color and simplified room suitability` (colon, not em-dash, per root CLAUDE.md).

Contents:
- Why `suitability_mode` is gone (inversion semantics were opaque, no production data, cheapest time to simplify).
- The both-sides-gated validity rule with the worked example table.
- Color storage format (palette key or hex) and why token keys win for the default case (dark mode re-skin without data migration).
- Scope boundaries: no solver enforcement yet, no subject-side editor.

## OPEN_THINGS updates

- Remove: "Subject color as a real column" (shipped).
- Amend: "Sub-resource editors for base entities" to record that Room suitability shipped; Room availability, Teacher availability, Teacher qualifications, WeekScheme time blocks remain.
- Amend: "Multi-select chip editors for sub-resources" to record that the Room suitability chip editor shipped; the pattern is now established for the remaining sub-resources.

## Commit sequence

Suggested grouping inside the single PR:

1. `feat(db): add subject color and drop room suitability_mode`. Alembic migration.
2. `feat(backend): persist subject color and tighten /rooms/{id}/suitability validation`. Models, schemas, routes, backend tests.
3. `chore(frontend): regenerate API types`.
4. `feat(frontend): subject color picker and room suitability chip editor`. Dialogs, hooks, schemas, i18n, MSW, frontend tests.
5. `docs: ADR 0011 and OPEN_THINGS updates`.

## Risks and caveats

- **Stale client PUTs.** If a user opens the room dialog, a subject is deleted in another tab, and the user saves, the PUT returns 400 with the missing ID. The dialog stays open; the user can re-pick. Acceptable.
- **Color collisions at > 12 subjects.** Schools with more than 12 subjects will see color reuse. Acceptable at current scale; the custom hex escape hatch exists for users who care.
- **Semantic flip for existing suitability rows.** Any general-room row in staging reverses meaning. Confirm no such rows carry intent before merging.
- **Two-request create flow.** Room creation with subjects runs POST then PUT. If PUT fails, the room exists with an empty suitability list; the mutation surfaces the PUT error and leaves the room in place. No rollback. Acceptable because the partial state is valid (empty list = any subject allowed); the user can retry the suitability update from the edit dialog.
