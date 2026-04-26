# Shared `EntityListTable` and `EntityPageHead` primitives

**Date:** 2026-04-25
**Status:** Design approved (autopilot autonomous mode), plan pending.

## Problem

`docs/superpowers/OPEN_THINGS.md`'s active sprint > tidy phase > item 5 names the
duplication:

> Every entity page (Subjects, Rooms, Teachers, SchoolClasses, Stundentafeln, Lessons)
> duplicates the same `<div className="overflow-x-auto rounded-xl border bg-card"><Table>…`
> shell. Collapse to `<EntityListTable columns={…} rows={…} renderRow={…} actions={…} />`
> so cross-entity polish (mobile overflow, sticky headers, hover states, keyboard
> navigation) lands once instead of six times. Also unblocks per-entity Playwright
> rollout by giving every entity page one assertion shape.

Six list pages and one master/detail page (WeekSchemes) all hand-roll a `*PageHead`
helper with the same four props (`title`, `subtitle`, `onCreate`, `createLabel`) and
the same JSX (title block + disabled Import button + Create button). The helpers were
named per-entity only because of the unique-function-names rule
(`scripts/check_unique_fns.py`); collapsing them into a single shared component is
pure tidy.

The six table-using pages also share an almost-identical body shell:
`<div className="overflow-x-auto rounded-xl border bg-card"><Table>…</Table></div>`,
the same `py-2` head padding, the same `py-1.5` cell padding, the same
right-aligned actions cell with `space-x-2 whitespace-nowrap`, and the same
two-or-three-button action set.

The duplication has two compounding costs:

1. Every cross-entity polish item (mobile overflow, sticky header, hover state,
   keyboard navigation, density toggle) must touch six files instead of one. This
   is the explicit motivation in OPEN_THINGS item 5.
2. Per-entity Playwright rollout (separate OPEN_THINGS item under "Testing > E2E
   (Playwright)") is blocked because each page presents a slightly different DOM
   shape; one shared primitive collapses the assertion shape so a single Playwright
   helper covers all six.

WeekSchemes is the seventh entity page but uses a master/detail panel
(`grid-cols-[300px_1fr]`) instead of a table. It shares the `*PageHead` duplication
but not the table shell.

## Goal

Land three commits on branch `refactor/entity-list-table`:

1. **Introduce primitives.** New `frontend/src/components/entity-list-table.tsx`
   exporting `EntityListTable<T>` and the `EntityColumn<T>` type. New
   `frontend/src/components/entity-page-head.tsx` exporting `EntityPageHead`. Both
   ship with focused unit tests at `frontend/tests/entity-list-table.test.tsx` and
   `frontend/tests/entity-page-head.test.tsx`. No consumers yet.
2. **Migrate the six table-using pages.** Subjects, Rooms, Teachers, SchoolClasses,
   Stundentafeln, Lessons each replace their hand-rolled table shell with
   `<EntityListTable>` and their hand-rolled `*PageHead` with `<EntityPageHead>`.
   Every existing per-entity test passes without modification.
3. **Migrate WeekSchemes head.** Replace the seventh `*PageHead` helper with
   `<EntityPageHead>`; the master/detail body is untouched. Existing WeekSchemes
   tests pass without modification.

## Non-goals

- **Loading / error / empty wrapper extraction.** Each page still hand-rolls its
  own `<p className="text-sm text-muted-foreground">{t("common.loading")}</p>`,
  error line, and conditional `<EmptyState>`. Bundling those into a shared shell
  forces a signature that may not fit future list pages (the WeekSchemes panel uses
  the same loading/error line but a different body), and the value/cost ratio is
  weaker than the table itself. Land as a follow-up in OPEN_THINGS if a future
  polish pass surfaces it as a pain point.
- **`common.actions` i18n key collapse.** Every page's `<entity>.columns.actions`
  key resolves to "Actions" / "Aktionen". Collapsing them into a single
  `common.actions` key would be a nice clean-up but it touches the entire en+de
  catalog and would shadow the structural intent of this PR. Note as a follow-up.
- **Per-entity Playwright rollout.** This PR unblocks the rollout by converging the
  DOM shape; the rollout itself is its own PR (and its own line in OPEN_THINGS).
- **Mobile-overflow / sticky-header / hover-state / keyboard-nav polish.** Each
  is a follow-up PR that benefits from this primitive landing first; folding any of
  them into this PR mixes structural and behavioral changes, which the
  CLAUDE.md tidy rule explicitly forbids.
- **Sorting, filtering, pagination, selection inside the primitive.** The primitive
  takes already-sorted, already-filtered rows and renders them. Each page keeps its
  own search-box state and (where present) its own `useMemo` sort. Adding
  sort/filter/pagination machinery would over-abstract on day one; do it when a
  second page asks for it.
- **`forwardRef` or imperative APIs on the primitive.** The primitive is a pure
  display component; consumers do not need a ref to it.
- **ADR.** No new toolchain, no architectural decision. The primitives are local
  app composites. Their existence and shape are documented by their TSDoc and
  unit tests.

## Design

### `EntityListTable<T>`

File: `frontend/src/components/entity-list-table.tsx`.

```ts
import type { ReactNode } from "react";

export type EntityColumn<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Applied to both the <TableHead> and every <TableCell> in this column.
   *  Use for shared alignment/width like "text-right" or "w-40 text-right". */
  className?: string;
  /** Override applied to the <TableHead> only. Rare; alignment usually
   *  belongs on `className` so head and cell line up. */
  headerClassName?: string;
  /** Additional classes applied to <TableCell> only.
   *  Use for cell-only content styling like "font-medium" or "font-mono text-[12.5px]". */
  cellClassName?: string;
};

export type EntityListTableProps<T> = {
  rows: readonly T[];
  rowKey: (row: T) => string;
  columns: readonly EntityColumn<T>[];
  /** When provided, mounts a final right-aligned actions column after the data
   *  columns. Caller returns the buttons; the primitive owns spacing. */
  actions?: (row: T) => ReactNode;
  /** Header label for the actions column. Optional; when omitted while `actions`
   *  is provided, the actions <TableHead> renders empty so column counts align. */
  actionsHeader?: ReactNode;
  /** Width / alignment classes for the actions <TableHead> + <TableCell>.
   *  Defaults to "w-40 text-right". */
  actionsClassName?: string;
};

export function EntityListTable<T>(props: EntityListTableProps<T>): ReactNode;
```

Rendering rules:

- Outer wrapper: `<div className="overflow-x-auto rounded-xl border bg-card"><Table>…</Table></div>`.
- `<TableHeader><TableRow>` with one `<TableHead className="py-2 ${col.className ?? ""} ${col.headerClassName ?? ""}">` per column.
- When `actions` is set: a trailing `<TableHead className="py-2 ${actionsClassName ?? "w-40 text-right"}">` carrying `actionsHeader`.
- `<TableBody>` iterates `rows`. Each `<TableRow key={rowKey(row)}>` contains:
  - One `<TableCell className="py-1.5 ${col.className ?? ""} ${col.cellClassName ?? ""}">{col.cell(row)}</TableCell>` per column.
  - When `actions` is set: a trailing `<TableCell className="space-x-2 whitespace-nowrap py-1.5 ${actionsClassName ?? "w-40 text-right"}">{actions(row)}</TableCell>`.

Padding (`py-2` head, `py-1.5` cell) is baked in; `actions` cell additionally bakes in
`space-x-2 whitespace-nowrap`. Every existing page uses these values, and divergence
across entities is exactly the rhythm drift the primitive prevents.

### `EntityPageHead`

File: `frontend/src/components/entity-page-head.tsx`.

```ts
import type { ReactNode } from "react";

export type EntityPageHeadProps = {
  title: ReactNode;
  subtitle: ReactNode;
  onCreate: () => void;
  createLabel: ReactNode;
};

export function EntityPageHead(props: EntityPageHeadProps): ReactNode;
```

Renders the exact JSX every per-entity `*PageHead` helper renders today:

```tsx
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
```

The primitive owns the `t("common.import")` and `t("sidebar.comingSoon")` lookups
internally; consumers do not need to pass them. This eliminates the seven duplicated
calls.

### Per-entity migration shape

Each migrating page replaces:

```tsx
<EntityXyzPageHead
  title={t("xyz.title")}
  subtitle={t("xyz.subtitle")}
  onCreate={() => setCreating(true)}
  createLabel={t("xyz.new")}
/>

<div className="overflow-x-auto rounded-xl border bg-card">
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead className="py-2">{t("xyz.columns.foo")}</TableHead>
        ...
      </TableRow>
    </TableHeader>
    <TableBody>
      {rows.map((row) => (
        <TableRow key={row.id}>
          <TableCell className="py-1.5 font-medium">{row.foo}</TableCell>
          ...
        </TableRow>
      ))}
    </TableBody>
  </Table>
</div>
```

with:

```tsx
const xyzColumns: EntityColumn<Xyz>[] = [
  {
    key: "foo",
    header: t("xyz.columns.foo"),
    cell: (row) => row.foo,
    cellClassName: "font-medium",
  },
  ...
];

<EntityPageHead
  title={t("xyz.title")}
  subtitle={t("xyz.subtitle")}
  onCreate={() => setCreating(true)}
  createLabel={t("xyz.new")}
/>

<EntityListTable<Xyz>
  rows={rows}
  rowKey={(row) => row.id}
  columns={xyzColumns}
  actions={(row) => (
    <>
      <Button size="sm" variant="outline" onClick={() => setEditing(row)}>
        {t("common.edit")}
      </Button>
      <Button size="sm" variant="destructive" onClick={() => setConfirmDelete(row)}>
        {t("common.delete")}
      </Button>
    </>
  )}
  actionsHeader={t("xyz.columns.actions")}
/>
```

Per-entity wrinkles already audited in the brainstorm and absorbed by the API:

- Subjects: name cell renders a color swatch (`<span className="kz-swatch"
  style={{ background: resolveSubjectColor(...) }} />`). Inline `style` is
  data-driven and stays inside the `cell` function.
- Rooms: capacity uses `room.capacity ?? "—"` inside `cell`.
- Teachers: pre-sorted by `last_name` via `useMemo` in the page; primitive accepts
  already-sorted rows.
- SchoolClasses: three action buttons (Generate / Edit / Delete) inside `actions`;
  FK-name maps (`stundentafelNameById`, `weekSchemeNameById`) closed over by `cell`
  functions.
- Stundentafeln: edit triggers `StundentafelEditDialog` rather than the form
  dialog; that is upstream of the primitive.
- Lessons: tooltip via `title=...` on the teacher cell; subject cell combines name
  + muted short-code span.

WeekSchemes uses only `EntityPageHead`; its master/detail body is unchanged.

### File layout summary

New files:

- `frontend/src/components/entity-list-table.tsx`
- `frontend/src/components/entity-page-head.tsx`
- `frontend/tests/entity-list-table.test.tsx`
- `frontend/tests/entity-page-head.test.tsx`

Modified files (seven entity pages):

- `frontend/src/features/subjects/subjects-page.tsx`
- `frontend/src/features/rooms/rooms-page.tsx`
- `frontend/src/features/teachers/teachers-page.tsx`
- `frontend/src/features/school-classes/school-classes-page.tsx`
- `frontend/src/features/stundentafeln/stundentafeln-page.tsx`
- `frontend/src/features/lessons/lessons-page.tsx`
- `frontend/src/features/week-schemes/week-schemes-page.tsx` (head only)

Each of the seven pages loses its private `*PageHead` helper.

## Testing

### Existing tests (must pass without modification)

- `frontend/tests/subjects-page.test.tsx`
- `frontend/tests/rooms-page.test.tsx`
- `frontend/tests/teachers-page.test.tsx`
- `frontend/tests/school-classes-page.test.tsx`
- `frontend/tests/stundentafeln-page.test.tsx`
- `frontend/tests/lessons-page.test.tsx`
- `frontend/tests/week-schemes-page.test.tsx`

All existing tests query by visible text or accessible role; the refactor preserves
both.

### New tests

`frontend/tests/entity-list-table.test.tsx`:

1. Renders one `<th>` per column with the right text.
2. Renders one row per entry with `cell(row)` text in column order.
3. Mounts an actions column when `actions` is provided; renders `actionsHeader`;
   mounts no actions column when `actions` is omitted.
4. `className` applies to both the column's `<th>` and its `<td>`s.
5. `headerClassName` applies to `<th>` only (and combines with `className`).
6. `cellClassName` applies to `<td>` only (and combines with `className`).
7. `actionsClassName` overrides the default `"w-40 text-right"` and applies to
   both the actions `<th>` and `<td>`s.
8. `rowKey` controls React keys: passing the same rows in reversed order produces
   the same DOM nodes in reversed text order (sanity check that React reconciles
   by key, not by index).

`frontend/tests/entity-page-head.test.tsx`:

1. Renders `title` as `<h1>`, `subtitle` as a `<p>`.
2. Renders the disabled `t("common.import")` button.
3. Renders the create button with `createLabel` and calls `onCreate` on click.

Both new test files add an `await i18n.changeLanguage("en")` `beforeAll` (per
frontend/CLAUDE.md testing rule) so English copy assertions match.

## Migration order

Three commits on branch `refactor/entity-list-table`:

1. `refactor(frontend): introduce EntityListTable and EntityPageHead primitives`
   - Adds `entity-list-table.tsx`, `entity-page-head.tsx`, and the two unit-test
     files. No consumer migration; tests for the primitives pass; existing tests
     are untouched.
2. `refactor(frontend): adopt EntityListTable + EntityPageHead in six entity pages`
   - Migrates Subjects, Rooms, Teachers, SchoolClasses, Stundentafeln, Lessons in
     one commit. Each page deletes its `*PageHead` helper and its inlined table
     shell. Existing per-entity tests pass without modification.
3. `refactor(frontend): adopt EntityPageHead in WeekSchemes`
   - Migrates the seventh page (head only). Deletes the last `*PageHead` helper.
     Existing test passes without modification.

All three commits are pure tidy: no behavior change, no test edits.

## Risks

- **TypeScript inference for inlined column arrays.** Inlined `columns={[{...}]}`
  inside JSX may infer too narrowly when `cell` returns `string | undefined`.
  Mitigation: hoist column arrays to a `const fooColumns: EntityColumn<Foo>[] = [...]`
  outside the JSX. Audit during migration.
- **Width / alignment drift on the actions column.** If `actionsClassName` is set
  on `<th>` only (or `<td>` only), columns visually misalign. Mitigation: the
  primitive applies `actionsClassName` to both; the unit test pins this contract.
- **One existing test relies on a class name we touch.** Audit each existing test
  before the migration commit; if any asserts a class name we change, surface as a
  spec amendment before adopting the primitive.

## Follow-ups (already in OPEN_THINGS or noted here)

- Loading / error / empty wrapper extraction (mentioned above; add to OPEN_THINGS).
- `common.actions` i18n key collapse (mentioned above; add to OPEN_THINGS).
- Mobile overflow, sticky headers, hover states, keyboard navigation polish (each
  becomes a one-prop change inside the primitive once it lands).
- Per-entity Playwright rollout (existing OPEN_THINGS item; this PR is the
  prerequisite).
