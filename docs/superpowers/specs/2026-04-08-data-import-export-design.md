# Data Import/Export — Design

Status: approved (brainstorm)
Backlog item: [2e in `docs/superpowers/next-steps.md`](../next-steps.md)
Date: 2026-04-08

## Goal

Let school admins move data in and out of Klassenzeit without clicking through forms:

1. **CSV round-trip for reference data** — export every reference-data entity as CSV, edit in a spreadsheet, re-import. Unblocks schools migrating from spreadsheets.
2. **Print-to-PDF for timetables** — print the currently viewed timetable to PDF via the browser's native print dialog.

## Non-goals

- Excel (XLSX) import or export.
- Server-side PDF generation.
- "Print all classes" bulk timetable output.
- Background-job imports.
- Delete-on-missing sync (full reconciliation).
- Import/export for teacher availabilities or room suitabilities. They are per-resource grids better edited in the existing UI.

## Part A — CSV reference-data round-trip

### Entities and natural keys

CSV export is the canonical template: re-importing an unedited export is a no-op. Rows are matched to existing records by a stable natural key. Rows not in the CSV are left alone.

| Entity       | Natural key                               | Notes |
|--------------|-------------------------------------------|-------|
| teachers     | `abbreviation`                            | no FKs |
| subjects     | `abbreviation`                            | no FKs |
| rooms        | `name`                                    | no FKs |
| classes      | `name`                                    | FK `class_teacher_abbreviation` → teachers (optional) |
| timeslots    | `(day_of_week, period)`                   | no FKs |
| curriculum   | `(term_id, class_name, subject_abbr)`     | FKs: class_name → classes, subject_abbr → subjects, teacher_abbreviation → teachers (optional). `term_id` comes from a query parameter, not a CSV column. |

FK targets are resolved by natural key; unknown references become row errors. The importer never auto-creates FK targets.

### CSV format

- RFC 4180, UTF-8, `,` separator, first row is the header.
- Column order in exports is the canonical template. Columns are matched by header name, not position, so users can reorder columns in the spreadsheet without breaking import.
- Booleans: `true` / `false` (case-insensitive).
- Enums (e.g. `day_of_week`): lowercase names matching the DB enum (`monday`, …).
- Colors: `#rrggbb`.
- Empty cell → `NULL` for nullable columns; empty required-column → row error.
- Unknown columns → ignored with a file-level warning in the preview.
- Missing required columns → file-level error before per-row validation.

### Endpoints

All three endpoints are admin-only and tenant-scoped by `school_id`:

```
GET  /api/schools/{school_id}/export/{entity}.csv[?term_id=...]
POST /api/schools/{school_id}/import/{entity}/preview[?term_id=...]
     Content-Type: multipart/form-data, field `file`
POST /api/schools/{school_id}/import/{entity}/commit
     Content-Type: application/json, body `{ "token": "..." }`
```

`{entity}` ∈ `teachers | subjects | rooms | classes | timeslots | curriculum`.

`term_id` is required for curriculum export and import; it is a 400 error if missing or if the term does not belong to `school_id`. Other entities ignore `term_id`.

### Import flow: dry-run + all-or-nothing commit

1. **Preview.** Client uploads the CSV to `/preview`. Backend parses, validates, and resolves FKs for every row without touching the database. It caches the validated, normalized rows under a UUID **preview token** (10-minute TTL, per-school, in memory) and returns:

   ```json
   {
     "token": "uuid",
     "entity": "teachers",
     "summary": { "create": 12, "update": 3, "unchanged": 0, "invalid": 2 },
     "file_warnings": ["ignored unknown column 'notes'"],
     "rows": [
       { "line": 2, "action": "create", "natural_key": "MUE", "data": { ... }, "warnings": [] },
       { "line": 5, "action": "update", "natural_key": "SCH", "data": { ... }, "diff": { "email": ["old","new"] } },
       { "line": 7, "action": "invalid", "errors": ["unknown subject 'Lateinx'"] }
     ]
   }
   ```

   Row actions: `create`, `update`, `unchanged`, `invalid`. An `unchanged` row is an existing record whose CSV values match the DB exactly; the commit will skip it.

2. **Confirm.** Client POSTs `{ token }` to `/commit`. Backend:
   1. Looks up the token. Missing/expired → **410 Gone**.
   2. Re-validates the cached rows against current DB state (defense in depth against concurrent edits between preview and commit). Any validation failure → **422** with the same row-error shape as the preview; preview token is NOT consumed so the user can retry after fixing.
   3. Opens a single SeaORM transaction, applies creates and updates in order, commits. On success, the preview token is consumed.
   4. On any DB error → transaction rollback → **422** with the failing row(s). The preview token is consumed (the user must re-upload and re-review).
3. If the preview contained any `invalid` row, the commit endpoint refuses (**422** without touching the DB). The frontend also disables the Confirm button in this case, so this is defense in depth.

Preview tokens are scoped to the school and the entity they were created for; a token from school A cannot be committed by school B, and a `teachers` token cannot be committed as `rooms`. Cross-school or cross-entity use returns 404.

### Export

`GET .../export/{entity}.csv` streams a CSV with:

- `Content-Type: text/csv; charset=utf-8`
- `Content-Disposition: attachment; filename="{school_slug}-{entity}[-{term_slug}].csv"`
- Rows in a stable order (natural-key ASC) so diffs between exports are meaningful.
- Soft-deleted rows excluded.

### Backend implementation notes

- New crate dependency: `csv = "1"` in `backend/Cargo.toml`. No other new deps.
- New module: `backend/src/services/import_export/` with:
  - `mod.rs` — dispatch on entity
  - `schema.rs` — per-entity column specs (header names, types, required flag)
  - `parse.rs` — CSV → typed row structs + per-row error collection
  - `resolve.rs` — FK resolution by natural key (batched lookups per FK target table)
  - `diff.rs` — compare parsed row to existing DB row → `create | update | unchanged`
  - `commit.rs` — transactional apply
  - `token_cache.rs` — `Arc<RwLock<HashMap<Uuid, PreviewCacheEntry>>>` with TTL eviction on read; lives in the Loco app context
  - `export.rs` — DB rows → CSV writer
- New controller: `backend/src/controllers/import_export.rs`, wired under the existing `/api/schools/{school_id}` router scope.
- Auth: reuse the admin middleware used by other school-settings endpoints.
- All filesystem I/O goes through streaming reads/writes — no temp files on disk.
- Preview-cache size limit: 100 entries per school; when exceeded, drop oldest. Prevents memory blowup if a user hammers preview.

### Error shape

Row errors use the existing backend error envelope. File-level errors (bad header, missing column) return 400. Row-level errors return 422 with a body like:

```json
{ "errors": [{ "line": 3, "messages": ["unknown subject 'Lateinx'"] }] }
```

## Part A — Frontend

### New settings tab

Add `frontend/src/app/[locale]/schools/[id]/settings/components/import-export-tab.tsx` and register it in the settings page's tab list (admin-only, same gate as other tabs).

Layout: six `Card`s, one per entity, in fixed dependency order: **teachers → subjects → rooms → classes → timeslots → curriculum**.

Each card contains:
- Entity title and a one-line description.
- **Export** button → triggers a download via `window.location = ".../export/{entity}.csv[?term_id=]"`.
- **Import** button → opens a file picker, uploads to `/preview`, opens the preview dialog on success.
- For curriculum only: a term `<Select>` above the buttons. The selected term is appended as `?term_id=` on both export and import.

### `<ImportPreviewDialog>`

One reusable dialog driven by the preview response. Shows:
- Summary chips: `create 12`, `update 3`, `unchanged 0`, `invalid 2`.
- Any `file_warnings` at the top as a subtle banner.
- A virtualised table of rows: `line`, `action` badge (color-coded), `natural_key`, and either a `diff` tooltip (for updates) or an error list (for invalid rows).
- Buttons: **Cancel** and **Confirm**. Confirm is disabled when `invalid > 0`, with a tooltip "Fix errors in the CSV and re-upload".

On Confirm:
- POST the token to `/commit`.
- Success → toast, invalidate React Query caches for that entity (and for curriculum, also invalidate classes/teachers/subjects queries for that term), close dialog.
- 410 Gone → toast "Preview expired, please re-upload" and close dialog.
- 422 with row errors → re-render the dialog in error state (rare; happens only if DB changed between preview and commit).

### i18n

Add a new `importExport` namespace to `frontend/src/messages/en.json` and `de.json`:
- `tab.title`, `tab.description`
- Per-entity: `entities.{entity}.title`, `entities.{entity}.description`
- Buttons: `import`, `export`, `cancel`, `confirm`, `selectFile`
- Dialog: `preview.title`, `preview.summary.{create|update|unchanged|invalid}`, `preview.invalidDisabled`, `preview.fileWarnings`
- Toasts: `toast.importSuccess`, `toast.exportFailed`, `toast.previewExpired`, `toast.commitFailed`

Also add `timetable.print` for Part B.

## Part B — Timetable print-to-PDF

### Scope

- Add a **Print** button (icon + label) on `/timetable`, placed next to the existing view-mode selector.
- Clicking calls `window.print()`.
- A `@media print` stylesheet transforms the current view into a clean, single-page grid.

### Print stylesheet requirements

- Hide: app sidebar, page header, view-mode selector, violations panel, edit affordances (drag handles, undo button).
- Show: compact header at the top with school name, current view label (e.g. "Class 5a", "Mrs Schmidt", "Room B201"), and term name.
- Grid: full page width, explicit width in `px`/`mm` so Tailwind responsive classes don't collapse to a narrow column.
- `page-break-inside: avoid` on grid rows and lesson cells.
- Landscape-friendly sizing (`@page { size: A4 landscape; }`).

### Implementation

- Scope the print styles under a single root class (e.g. `.printable-timetable`) on the `/timetable` page wrapper, and put the `@media print` rules in `globals.css` next to it.
- No new deps. No new route. No new components — just the button, the wrapper class, and the stylesheet block.
- The "Print" button label comes from the new `timetable.print` i18n key (DE: "Drucken", EN: "Print").

## Testing

TDD throughout, per project convention: failing test first, then implementation.

### Backend (`cargo test -p klassenzeit-backend --test mod`)

Integration tests against a real Postgres (already required by existing integration tests):

- Round-trip, per entity: seed rows → export → re-import via preview+commit → DB is byte-identical to the seed state (`unchanged == N`, `create == 0`, `update == 0`).
- Preview happy path (creates and updates).
- Preview with file-level errors (missing required column, bad header) → 400.
- Preview with row-level errors (bad enum, bad FK) → 200 with `action: invalid` rows.
- Commit happy path → transaction applied.
- Commit with expired / unknown token → 410.
- Commit refuses when preview had any invalid row → 422, no DB writes.
- Commit atomicity: inject a row that passes preview but violates a DB unique constraint at commit time → 422, no DB writes.
- Tenant isolation: preview token from school A cannot be committed by school B → 404.
- Cross-entity: `teachers` token cannot be committed as `rooms` → 404.
- Curriculum: `term_id` missing → 400; `term_id` from another school → 404.
- FK resolution: classes referencing an unknown `class_teacher_abbreviation` → invalid row; curriculum referencing an unknown `subject_abbr` → invalid row.
- Admin middleware: non-admin → 403 on all three endpoints.

### Frontend (Vitest)

- `<ImportPreviewDialog>`: renders summary chips, disables Confirm when `invalid > 0`, calls `onConfirm` with the token, handles 410 by closing with a toast.
- `import-export-tab`: renders six cards, curriculum card shows term select, Export button sets `window.location` with correct URL.
- Snapshot test for the `.printable-timetable` wrapper to guard the print layout's header + grid structure.

### Out-of-scope for tests

- No e2e test for the actual browser print dialog.
- No load tests for very large CSVs — the preview cache bound (100 entries/school) and the in-memory parse are the only limits for MVP.

## Risks

- **Preview/commit race.** If a concurrent edit happens between preview and commit, the re-validation step catches it; user retries. Acceptable.
- **Preview cache memory.** In-memory cache is per-process; rolling restart during a user's review would lose tokens. Acceptable for MVP; tokens have a 10-minute TTL anyway.
- **Print layout drift.** The print stylesheet is easy to break with future grid changes. The Vitest snapshot test catches structural regressions; visual regressions are on us to notice when we change the grid.
- **Large CSV memory.** Entire file is parsed into memory before commit. For MVP this is fine; schools have hundreds of rows at most. If this grows, we can stream later.
