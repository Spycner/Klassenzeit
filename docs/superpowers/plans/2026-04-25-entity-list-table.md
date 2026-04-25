# EntityListTable Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the duplicated table-shell + page-head pattern across seven entity CRUD pages into two shared primitives (`EntityListTable<T>` and `EntityPageHead`) so cross-entity polish lands once instead of seven times.

**Architecture:** Two app-level composites under `frontend/src/components/`. `EntityListTable<T>` is column-driven (`columns: EntityColumn<T>[]` + `actions?: (row) => ReactNode`) and owns the rounded card wrapper, the table shell, padding rhythm, and the right-aligned actions column. `EntityPageHead` renders the title + subtitle + disabled Import button + Create button block. Three commits: introduce primitives, migrate six table-using pages, migrate WeekSchemes head.

**Tech Stack:** React 19, TypeScript, Vitest + React Testing Library, shadcn/ui Table primitive, react-i18next.

**Spec:** `docs/superpowers/specs/2026-04-25-entity-list-table-design.md`.

---

## Commit 1: Introduce primitives

### Task 1: `EntityPageHead` primitive (TDD)

**Files:**
- Create: `frontend/src/components/entity-page-head.tsx`
- Create: `frontend/tests/entity-page-head.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/entity-page-head.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { EntityPageHead } from "@/components/entity-page-head";
import i18n from "@/i18n/init";

describe("EntityPageHead", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("renders title as <h1> and subtitle as a paragraph", () => {
    render(
      <EntityPageHead
        title="Subjects"
        subtitle="Things you teach"
        onCreate={() => {}}
        createLabel="New subject"
      />,
    );
    expect(screen.getByRole("heading", { level: 1, name: /subjects/i })).toBeInTheDocument();
    expect(screen.getByText(/things you teach/i)).toBeInTheDocument();
  });

  it("renders the disabled Import button", () => {
    render(
      <EntityPageHead
        title="Subjects"
        subtitle=""
        onCreate={() => {}}
        createLabel="New"
      />,
    );
    const importBtn = screen.getByRole("button", { name: /import/i });
    expect(importBtn).toBeDisabled();
  });

  it("calls onCreate when the create button is clicked", async () => {
    const onCreate = vi.fn();
    render(
      <EntityPageHead
        title="Subjects"
        subtitle=""
        onCreate={onCreate}
        createLabel="New subject"
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /new subject/i }));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && mise exec -- pnpm vitest run tests/entity-page-head.test.tsx
```

Expected: fails with "Cannot find module '@/components/entity-page-head'" or similar.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/components/entity-page-head.tsx`:

```tsx
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

export type EntityPageHeadProps = {
  title: ReactNode;
  subtitle: ReactNode;
  onCreate: () => void;
  createLabel: ReactNode;
};

export function EntityPageHead({
  title,
  subtitle,
  onCreate,
  createLabel,
}: EntityPageHeadProps) {
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

- [ ] **Step 4: Run test to verify it passes**

```bash
cd frontend && mise exec -- pnpm vitest run tests/entity-page-head.test.tsx
```

Expected: 3 tests pass.

### Task 2: `EntityListTable` primitive (TDD)

**Files:**
- Create: `frontend/src/components/entity-list-table.tsx`
- Create: `frontend/tests/entity-list-table.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/entity-list-table.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { type EntityColumn, EntityListTable } from "@/components/entity-list-table";

type Row = { id: string; name: string; code: string };

const rows: Row[] = [
  { id: "r1", name: "Alpha", code: "AL" },
  { id: "r2", name: "Beta", code: "BE" },
];

const columns: EntityColumn<Row>[] = [
  {
    key: "name",
    header: "Name",
    cell: (row) => row.name,
    cellClassName: "font-medium",
  },
  {
    key: "code",
    header: "Code",
    cell: (row) => row.code,
    className: "text-right",
  },
];

describe("EntityListTable", () => {
  it("renders one <th> per column with the header text", () => {
    render(<EntityListTable rows={rows} rowKey={(r) => r.id} columns={columns} />);
    const headers = screen.getAllByRole("columnheader");
    expect(headers).toHaveLength(2);
    expect(headers[0]).toHaveTextContent("Name");
    expect(headers[1]).toHaveTextContent("Code");
  });

  it("renders one row per entry with cell content in column order", () => {
    render(<EntityListTable rows={rows} rowKey={(r) => r.id} columns={columns} />);
    const dataRows = screen.getAllByRole("row").slice(1); // skip header row
    expect(dataRows).toHaveLength(2);
    const firstCells = within(dataRows[0]!).getAllByRole("cell");
    expect(firstCells[0]).toHaveTextContent("Alpha");
    expect(firstCells[1]).toHaveTextContent("AL");
  });

  it("mounts an actions column when actions prop is provided", () => {
    render(
      <EntityListTable
        rows={rows}
        rowKey={(r) => r.id}
        columns={columns}
        actions={(row) => <button type="button">Edit {row.name}</button>}
        actionsHeader="Actions"
      />,
    );
    expect(screen.getAllByRole("columnheader")).toHaveLength(3);
    expect(screen.getByRole("columnheader", { name: "Actions" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Alpha" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Beta" })).toBeInTheDocument();
  });

  it("omits the actions column when actions prop is not provided", () => {
    render(<EntityListTable rows={rows} rowKey={(r) => r.id} columns={columns} />);
    expect(screen.getAllByRole("columnheader")).toHaveLength(2);
  });

  it("applies className to both <th> and <td>", () => {
    render(<EntityListTable rows={rows} rowKey={(r) => r.id} columns={columns} />);
    const codeHeader = screen.getAllByRole("columnheader")[1]!;
    expect(codeHeader.className).toContain("text-right");
    const dataRows = screen.getAllByRole("row").slice(1);
    const codeCell = within(dataRows[0]!).getAllByRole("cell")[1]!;
    expect(codeCell.className).toContain("text-right");
  });

  it("applies cellClassName to <td> only", () => {
    render(<EntityListTable rows={rows} rowKey={(r) => r.id} columns={columns} />);
    const nameHeader = screen.getAllByRole("columnheader")[0]!;
    expect(nameHeader.className).not.toContain("font-medium");
    const dataRows = screen.getAllByRole("row").slice(1);
    const nameCell = within(dataRows[0]!).getAllByRole("cell")[0]!;
    expect(nameCell.className).toContain("font-medium");
  });

  it("applies headerClassName to <th> only", () => {
    const cols: EntityColumn<Row>[] = [
      {
        key: "name",
        header: "Name",
        cell: (row) => row.name,
        headerClassName: "uppercase",
      },
    ];
    render(<EntityListTable rows={rows} rowKey={(r) => r.id} columns={cols} />);
    const header = screen.getAllByRole("columnheader")[0]!;
    expect(header.className).toContain("uppercase");
    const dataRows = screen.getAllByRole("row").slice(1);
    const cell = within(dataRows[0]!).getAllByRole("cell")[0]!;
    expect(cell.className).not.toContain("uppercase");
  });

  it("applies actionsClassName to both actions <th> and <td>", () => {
    render(
      <EntityListTable
        rows={rows}
        rowKey={(r) => r.id}
        columns={columns}
        actions={(row) => <span>{row.id}</span>}
        actionsHeader="Acts"
        actionsClassName="w-24 text-center"
      />,
    );
    const actionsHeader = screen.getByRole("columnheader", { name: "Acts" });
    expect(actionsHeader.className).toContain("w-24");
    expect(actionsHeader.className).toContain("text-center");
    const dataRows = screen.getAllByRole("row").slice(1);
    const actionsCell = within(dataRows[0]!).getAllByRole("cell")[2]!;
    expect(actionsCell.className).toContain("w-24");
    expect(actionsCell.className).toContain("text-center");
  });

  it("uses rowKey to reconcile rows on reorder", () => {
    const { rerender } = render(
      <EntityListTable rows={rows} rowKey={(r) => r.id} columns={columns} />,
    );
    let dataRows = screen.getAllByRole("row").slice(1);
    expect(within(dataRows[0]!).getAllByRole("cell")[0]).toHaveTextContent("Alpha");

    const reversed = [...rows].reverse();
    rerender(<EntityListTable rows={reversed} rowKey={(r) => r.id} columns={columns} />);
    dataRows = screen.getAllByRole("row").slice(1);
    expect(within(dataRows[0]!).getAllByRole("cell")[0]).toHaveTextContent("Beta");
    expect(within(dataRows[1]!).getAllByRole("cell")[0]).toHaveTextContent("Alpha");
  });

  it("renders an empty actions <th> when actions is set but actionsHeader is omitted", () => {
    render(
      <EntityListTable
        rows={rows}
        rowKey={(r) => r.id}
        columns={columns}
        actions={(row) => <span>{row.id}</span>}
      />,
    );
    const headers = screen.getAllByRole("columnheader");
    expect(headers).toHaveLength(3);
    expect(headers[2]).toHaveTextContent("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && mise exec -- pnpm vitest run tests/entity-list-table.test.tsx
```

Expected: fails with "Cannot find module '@/components/entity-list-table'" or similar.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/components/entity-list-table.tsx`:

```tsx
import type { ReactNode } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

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

const DEFAULT_ACTIONS_CLASS = "w-40 text-right";

export function EntityListTable<T>({
  rows,
  rowKey,
  columns,
  actions,
  actionsHeader,
  actionsClassName,
}: EntityListTableProps<T>) {
  const actionsClass = actionsClassName ?? DEFAULT_ACTIONS_CLASS;
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead
                key={col.key}
                className={cn("py-2", col.className, col.headerClassName)}
              >
                {col.header}
              </TableHead>
            ))}
            {actions ? (
              <TableHead className={cn("py-2", actionsClass)}>{actionsHeader}</TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={rowKey(row)}>
              {columns.map((col) => (
                <TableCell
                  key={col.key}
                  className={cn("py-1.5", col.className, col.cellClassName)}
                >
                  {col.cell(row)}
                </TableCell>
              ))}
              {actions ? (
                <TableCell
                  className={cn("space-x-2 whitespace-nowrap py-1.5", actionsClass)}
                >
                  {actions(row)}
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd frontend && mise exec -- pnpm vitest run tests/entity-list-table.test.tsx
```

Expected: 10 tests pass.

### Task 3: Lint + commit Commit 1

- [ ] **Step 1: Run lint**

```bash
mise run lint
```

Expected: pass. The two new TS files must satisfy Biome.

- [ ] **Step 2: Run the full frontend Vitest suite**

```bash
mise run fe:test
```

Expected: all tests pass (existing entity-page tests must still pass; the primitives have no consumers yet).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/entity-list-table.tsx \
  frontend/src/components/entity-page-head.tsx \
  frontend/tests/entity-list-table.test.tsx \
  frontend/tests/entity-page-head.test.tsx
git commit -m "refactor(frontend): introduce EntityListTable and EntityPageHead primitives"
```

---

## Commit 2: Migrate six table-using pages

Each migration is mechanical: replace the `*PageHead` helper call with `<EntityPageHead>`, replace the `<div className="overflow-x-auto rounded-xl border bg-card"><Table>…</Table></div>` block with `<EntityListTable>`, delete the local `*PageHead` helper at the bottom of the file, drop the now-unused shadcn `Table*` imports.

For each task: edit the file, run that page's existing test (must still pass), proceed to the next page. Commit after all six migrations are clean.

### Task 4: Migrate Subjects page

**Files:**
- Modify: `frontend/src/features/subjects/subjects-page.tsx`

- [ ] **Step 1: Replace the page contents**

Rewrite `frontend/src/features/subjects/subjects-page.tsx` to:

```tsx
import { useSearch } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/empty-state";
import { type EntityColumn, EntityListTable } from "@/components/entity-list-table";
import { EntityPageHead } from "@/components/entity-page-head";
import { Toolbar } from "@/components/toolbar";
import { Button } from "@/components/ui/button";
import { resolveSubjectColor } from "./color";
import { type Subject, useSubjects } from "./hooks";
import { DeleteSubjectDialog, SubjectFormDialog } from "./subjects-dialogs";

export function SubjectsPage() {
  const { t } = useTranslation();
  const subjects = useSubjects();
  const search = useSearch({ strict: false }) as { create?: string };

  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(() => search.create === "1");
  const [editing, setEditing] = useState<Subject | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Subject | null>(null);

  const rows = (subjects.data ?? []).filter((row) =>
    q ? `${row.name} ${row.short_name}`.toLowerCase().includes(q.toLowerCase()) : true,
  );
  const showEmpty = !subjects.isLoading && subjects.data && subjects.data.length === 0 && !q;

  const subjectColumns: EntityColumn<Subject>[] = [
    {
      key: "name",
      header: t("subjects.columns.name"),
      cell: (subject) => (
        <span className="inline-flex items-center gap-2">
          <span
            className="kz-swatch"
            style={{ background: resolveSubjectColor(subject.color) }}
          />
          {subject.name}
        </span>
      ),
      cellClassName: "font-medium",
    },
    {
      key: "shortName",
      header: t("subjects.columns.shortName"),
      cell: (subject) => subject.short_name,
      cellClassName: "font-mono text-[12.5px]",
    },
  ];

  return (
    <div className="space-y-4">
      <EntityPageHead
        title={t("subjects.title")}
        subtitle={t("subjects.subtitle")}
        onCreate={() => setCreating(true)}
        createLabel={t("subjects.new")}
      />

      {subjects.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : subjects.isError ? (
        <p className="text-sm text-destructive">{t("subjects.loadError")}</p>
      ) : showEmpty ? (
        <EmptyState
          icon={<BookOpen className="h-7 w-7" />}
          title={t("subjects.empty.title")}
          body={t("subjects.empty.body")}
          steps={[t("subjects.empty.step1"), t("subjects.empty.step2"), t("subjects.empty.step3")]}
          onCreate={() => setCreating(true)}
          createLabel={t("subjects.new")}
        />
      ) : (
        <>
          <Toolbar
            search={q}
            onSearch={setQ}
            placeholder={t("common.search")}
            right={
              <span className="font-mono text-xs text-muted-foreground">
                {rows.length} {t("subjects.title").toLowerCase()}
              </span>
            }
          />
          <EntityListTable<Subject>
            rows={rows}
            rowKey={(subject) => subject.id}
            columns={subjectColumns}
            actions={(subject) => (
              <>
                <Button size="sm" variant="outline" onClick={() => setEditing(subject)}>
                  {t("common.edit")}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setConfirmDelete(subject)}
                >
                  {t("common.delete")}
                </Button>
              </>
            )}
            actionsHeader={t("subjects.columns.actions")}
          />
        </>
      )}

      <SubjectFormDialog
        open={creating}
        onOpenChange={setCreating}
        submitLabel={t("common.create")}
      />
      {editing ? (
        <SubjectFormDialog
          open={true}
          subject={editing}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          submitLabel={t("common.save")}
        />
      ) : null}
      {confirmDelete ? (
        <DeleteSubjectDialog subject={confirmDelete} onClose={() => setConfirmDelete(null)} />
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Run the existing Subjects-page test**

```bash
cd frontend && mise exec -- pnpm vitest run tests/subjects-page.test.tsx
```

Expected: all assertions pass without modification.

### Task 5: Migrate Rooms page

**Files:**
- Modify: `frontend/src/features/rooms/rooms-page.tsx`

- [ ] **Step 1: Replace the page contents**

Rewrite `frontend/src/features/rooms/rooms-page.tsx` to:

```tsx
import { useSearch } from "@tanstack/react-router";
import { DoorOpen } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/empty-state";
import { type EntityColumn, EntityListTable } from "@/components/entity-list-table";
import { EntityPageHead } from "@/components/entity-page-head";
import { Toolbar } from "@/components/toolbar";
import { Button } from "@/components/ui/button";
import { type Room, useRooms } from "./hooks";
import { DeleteRoomDialog, RoomFormDialog } from "./rooms-dialogs";

export function RoomsPage() {
  const { t } = useTranslation();
  const rooms = useRooms();
  const search = useSearch({ strict: false }) as { create?: string };

  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(() => search.create === "1");
  const [editing, setEditing] = useState<Room | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Room | null>(null);

  const rows = (rooms.data ?? []).filter((row) =>
    q ? `${row.name} ${row.short_name}`.toLowerCase().includes(q.toLowerCase()) : true,
  );
  const showEmpty = !rooms.isLoading && rooms.data && rooms.data.length === 0 && !q;

  const roomColumns: EntityColumn<Room>[] = [
    {
      key: "name",
      header: t("rooms.columns.name"),
      cell: (room) => room.name,
      cellClassName: "font-medium",
    },
    {
      key: "shortName",
      header: t("rooms.columns.shortName"),
      cell: (room) => room.short_name,
      cellClassName: "font-mono text-[12.5px]",
    },
    {
      key: "capacity",
      header: t("rooms.columns.capacity"),
      cell: (room) => room.capacity ?? "—",
      className: "text-right",
      cellClassName: "font-mono text-[12.5px]",
    },
  ];

  return (
    <div className="space-y-4">
      <EntityPageHead
        title={t("rooms.title")}
        subtitle={t("rooms.subtitle")}
        onCreate={() => setCreating(true)}
        createLabel={t("rooms.new")}
      />

      {rooms.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : rooms.isError ? (
        <p className="text-sm text-destructive">{t("rooms.loadError")}</p>
      ) : showEmpty ? (
        <EmptyState
          icon={<DoorOpen className="h-7 w-7" />}
          title={t("rooms.empty.title")}
          body={t("rooms.empty.body")}
          steps={[t("rooms.empty.step1"), t("rooms.empty.step2"), t("rooms.empty.step3")]}
          onCreate={() => setCreating(true)}
          createLabel={t("rooms.new")}
        />
      ) : (
        <>
          <Toolbar
            search={q}
            onSearch={setQ}
            placeholder={t("common.search")}
            right={
              <span className="font-mono text-xs text-muted-foreground">
                {rows.length} {t("rooms.title").toLowerCase()}
              </span>
            }
          />
          <EntityListTable<Room>
            rows={rows}
            rowKey={(room) => room.id}
            columns={roomColumns}
            actions={(room) => (
              <>
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
              </>
            )}
            actionsHeader={t("rooms.columns.actions")}
          />
        </>
      )}

      <RoomFormDialog open={creating} onOpenChange={setCreating} submitLabel={t("common.create")} />
      {editing ? (
        <RoomFormDialog
          open={true}
          room={editing}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          submitLabel={t("common.save")}
        />
      ) : null}
      {confirmDelete ? (
        <DeleteRoomDialog room={confirmDelete} onClose={() => setConfirmDelete(null)} />
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Run the existing Rooms-page test**

```bash
cd frontend && mise exec -- pnpm vitest run tests/rooms-page.test.tsx
```

Expected: all assertions pass without modification.

### Task 6: Migrate Teachers page

**Files:**
- Modify: `frontend/src/features/teachers/teachers-page.tsx`

- [ ] **Step 1: Replace the page contents**

Rewrite `frontend/src/features/teachers/teachers-page.tsx` to:

```tsx
import { useSearch } from "@tanstack/react-router";
import { GraduationCap } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/empty-state";
import { type EntityColumn, EntityListTable } from "@/components/entity-list-table";
import { EntityPageHead } from "@/components/entity-page-head";
import { Toolbar } from "@/components/toolbar";
import { Button } from "@/components/ui/button";
import { type Teacher, useTeachers } from "./hooks";
import { DeleteTeacherDialog, TeacherFormDialog } from "./teachers-dialogs";

export function TeachersPage() {
  const { t, i18n } = useTranslation();
  const teachers = useTeachers();
  const search = useSearch({ strict: false }) as { create?: string };

  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(() => search.create === "1");
  const [editing, setEditing] = useState<Teacher | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Teacher | null>(null);

  const sorted = useMemo(() => {
    const list = teachers.data ?? [];
    return [...list].sort((a, b) => a.last_name.localeCompare(b.last_name, i18n.language));
  }, [teachers.data, i18n.language]);

  const rows = sorted.filter((row) =>
    q
      ? `${row.first_name} ${row.last_name} ${row.short_code}`
          .toLowerCase()
          .includes(q.toLowerCase())
      : true,
  );
  const showEmpty = !teachers.isLoading && teachers.data && teachers.data.length === 0 && !q;

  const teacherColumns: EntityColumn<Teacher>[] = [
    {
      key: "lastName",
      header: t("teachers.columns.lastName"),
      cell: (teacher) => teacher.last_name,
      cellClassName: "font-medium",
    },
    {
      key: "firstName",
      header: t("teachers.columns.firstName"),
      cell: (teacher) => teacher.first_name,
    },
    {
      key: "shortCode",
      header: t("teachers.columns.shortCode"),
      cell: (teacher) => teacher.short_code,
      cellClassName: "font-mono text-[12.5px]",
    },
    {
      key: "maxHoursPerWeek",
      header: t("teachers.columns.maxHoursPerWeek"),
      cell: (teacher) => teacher.max_hours_per_week,
      className: "text-right",
      cellClassName: "font-mono text-[12.5px]",
    },
  ];

  return (
    <div className="space-y-4">
      <EntityPageHead
        title={t("teachers.title")}
        subtitle={t("teachers.subtitle")}
        onCreate={() => setCreating(true)}
        createLabel={t("teachers.new")}
      />

      {teachers.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : teachers.isError ? (
        <p className="text-sm text-destructive">{t("teachers.loadError")}</p>
      ) : showEmpty ? (
        <EmptyState
          icon={<GraduationCap className="h-7 w-7" />}
          title={t("teachers.empty.title")}
          body={t("teachers.empty.body")}
          steps={[t("teachers.empty.step1"), t("teachers.empty.step2"), t("teachers.empty.step3")]}
          onCreate={() => setCreating(true)}
          createLabel={t("teachers.new")}
        />
      ) : (
        <>
          <Toolbar
            search={q}
            onSearch={setQ}
            placeholder={t("common.search")}
            right={
              <span className="font-mono text-xs text-muted-foreground">
                {rows.length} {t("teachers.title").toLowerCase()}
              </span>
            }
          />
          <EntityListTable<Teacher>
            rows={rows}
            rowKey={(teacher) => teacher.id}
            columns={teacherColumns}
            actions={(teacher) => (
              <>
                <Button size="sm" variant="outline" onClick={() => setEditing(teacher)}>
                  {t("common.edit")}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setConfirmDelete(teacher)}
                >
                  {t("common.delete")}
                </Button>
              </>
            )}
            actionsHeader={t("teachers.columns.actions")}
          />
        </>
      )}

      <TeacherFormDialog
        open={creating}
        onOpenChange={setCreating}
        submitLabel={t("common.create")}
      />
      {editing ? (
        <TeacherFormDialog
          open={true}
          teacher={editing}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          submitLabel={t("common.save")}
        />
      ) : null}
      {confirmDelete ? (
        <DeleteTeacherDialog teacher={confirmDelete} onClose={() => setConfirmDelete(null)} />
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Run the existing Teachers-page test**

```bash
cd frontend && mise exec -- pnpm vitest run tests/teachers-page.test.tsx
```

Expected: all assertions pass without modification.

### Task 7: Migrate SchoolClasses page

**Files:**
- Modify: `frontend/src/features/school-classes/school-classes-page.tsx`

- [ ] **Step 1: Replace the page contents**

Rewrite `frontend/src/features/school-classes/school-classes-page.tsx` to:

```tsx
import { useSearch } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { type EntityColumn, EntityListTable } from "@/components/entity-list-table";
import { EntityPageHead } from "@/components/entity-page-head";
import { Toolbar } from "@/components/toolbar";
import { Button } from "@/components/ui/button";
import { useStundentafeln } from "@/features/stundentafeln/hooks";
import { useWeekSchemes } from "@/features/week-schemes/hooks";
import { GenerateLessonsConfirmDialog } from "./generate-lessons-dialog";
import { type SchoolClass, useSchoolClasses } from "./hooks";
import { DeleteSchoolClassDialog, SchoolClassFormDialog } from "./school-classes-dialogs";

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
  const [generateFor, setGenerateFor] = useState<SchoolClass | null>(null);

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

  const schoolClassColumns: EntityColumn<SchoolClass>[] = [
    {
      key: "name",
      header: t("schoolClasses.columns.name"),
      cell: (schoolClass) => schoolClass.name,
      cellClassName: "font-medium",
    },
    {
      key: "gradeLevel",
      header: t("schoolClasses.columns.gradeLevel"),
      cell: (schoolClass) => schoolClass.grade_level,
      className: "text-right",
      cellClassName: "font-mono text-[12.5px]",
    },
    {
      key: "stundentafel",
      header: t("schoolClasses.columns.stundentafel"),
      cell: (schoolClass) => stundentafelNameById.get(schoolClass.stundentafel_id) ?? "—",
    },
    {
      key: "weekScheme",
      header: t("schoolClasses.columns.weekScheme"),
      cell: (schoolClass) => weekSchemeNameById.get(schoolClass.week_scheme_id) ?? "—",
    },
  ];

  return (
    <div className="space-y-4">
      <EntityPageHead
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
          <EntityListTable<SchoolClass>
            rows={rows}
            rowKey={(schoolClass) => schoolClass.id}
            columns={schoolClassColumns}
            actions={(schoolClass) => (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setGenerateFor(schoolClass)}
                >
                  {t("schoolClasses.generateLessons.action")}
                </Button>
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
              </>
            )}
            actionsHeader={t("schoolClasses.columns.actions")}
          />
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
      {generateFor ? (
        <GenerateLessonsConfirmDialog
          schoolClass={generateFor}
          onDone={(count) => {
            setGenerateFor(null);
            if (count < 0) return;
            if (count === 0) {
              toast.info(t("schoolClasses.generateLessons.noneCreated"));
            } else {
              toast.success(t("schoolClasses.generateLessons.created", { count }));
            }
          }}
        />
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Run the existing SchoolClasses-page test**

```bash
cd frontend && mise exec -- pnpm vitest run tests/school-classes-page.test.tsx
```

Expected: all assertions pass without modification.

### Task 8: Migrate Stundentafeln page

**Files:**
- Modify: `frontend/src/features/stundentafeln/stundentafeln-page.tsx`

- [ ] **Step 1: Replace the page contents**

Rewrite `frontend/src/features/stundentafeln/stundentafeln-page.tsx` to:

```tsx
import { useSearch } from "@tanstack/react-router";
import { ClipboardList } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/empty-state";
import { type EntityColumn, EntityListTable } from "@/components/entity-list-table";
import { EntityPageHead } from "@/components/entity-page-head";
import { Toolbar } from "@/components/toolbar";
import { Button } from "@/components/ui/button";
import { type Stundentafel, useStundentafeln } from "./hooks";
import {
  DeleteStundentafelDialog,
  StundentafelEditDialog,
  StundentafelFormDialog,
} from "./stundentafeln-dialogs";

export function StundentafelnPage() {
  const { t } = useTranslation();
  const stundentafeln = useStundentafeln();
  const search = useSearch({ strict: false }) as { create?: string };

  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(() => search.create === "1");
  const [editing, setEditing] = useState<Stundentafel | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Stundentafel | null>(null);

  const rows = (stundentafeln.data ?? []).filter((row) => {
    if (!q) return true;
    return row.name.toLowerCase().includes(q.toLowerCase());
  });
  const showEmpty =
    !stundentafeln.isLoading && stundentafeln.data && stundentafeln.data.length === 0 && !q;

  const stundentafelColumns: EntityColumn<Stundentafel>[] = [
    {
      key: "name",
      header: t("stundentafeln.columns.name"),
      cell: (tafel) => tafel.name,
      cellClassName: "font-medium",
    },
    {
      key: "gradeLevel",
      header: t("stundentafeln.columns.gradeLevel"),
      cell: (tafel) => tafel.grade_level,
      className: "text-right",
      cellClassName: "font-mono text-[12.5px]",
    },
  ];

  return (
    <div className="space-y-4">
      <EntityPageHead
        title={t("stundentafeln.title")}
        subtitle={t("stundentafeln.subtitle")}
        onCreate={() => setCreating(true)}
        createLabel={t("stundentafeln.new")}
      />

      {stundentafeln.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : stundentafeln.isError ? (
        <p className="text-sm text-destructive">{t("stundentafeln.loadError")}</p>
      ) : showEmpty ? (
        <EmptyState
          icon={<ClipboardList className="h-7 w-7" />}
          title={t("stundentafeln.empty.title")}
          body={t("stundentafeln.empty.body")}
          steps={[
            t("stundentafeln.empty.step1"),
            t("stundentafeln.empty.step2"),
            t("stundentafeln.empty.step3"),
          ]}
          onCreate={() => setCreating(true)}
          createLabel={t("stundentafeln.new")}
        />
      ) : (
        <>
          <Toolbar
            search={q}
            onSearch={setQ}
            placeholder={t("common.search")}
            right={
              <span className="font-mono text-xs text-muted-foreground">
                {rows.length} {t("stundentafeln.title").toLowerCase()}
              </span>
            }
          />
          <EntityListTable<Stundentafel>
            rows={rows}
            rowKey={(tafel) => tafel.id}
            columns={stundentafelColumns}
            actions={(tafel) => (
              <>
                <Button size="sm" variant="outline" onClick={() => setEditing(tafel)}>
                  {t("common.edit")}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setConfirmDelete(tafel)}
                >
                  {t("common.delete")}
                </Button>
              </>
            )}
            actionsHeader={t("stundentafeln.columns.actions")}
          />
        </>
      )}

      <StundentafelFormDialog open={creating} onOpenChange={setCreating} />
      {editing ? (
        <StundentafelEditDialog stundentafel={editing} onClose={() => setEditing(null)} />
      ) : null}
      {confirmDelete ? (
        <DeleteStundentafelDialog
          stundentafel={confirmDelete}
          onClose={() => setConfirmDelete(null)}
        />
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Run the existing Stundentafeln-page test**

```bash
cd frontend && mise exec -- pnpm vitest run tests/stundentafeln-page.test.tsx
```

Expected: all assertions pass without modification.

### Task 9: Migrate Lessons page

**Files:**
- Modify: `frontend/src/features/lessons/lessons-page.tsx`

- [ ] **Step 1: Replace the page contents**

Rewrite `frontend/src/features/lessons/lessons-page.tsx` to:

```tsx
import { useSearch } from "@tanstack/react-router";
import { Layers } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/empty-state";
import { type EntityColumn, EntityListTable } from "@/components/entity-list-table";
import { EntityPageHead } from "@/components/entity-page-head";
import { Toolbar } from "@/components/toolbar";
import { Button } from "@/components/ui/button";
import { type Lesson, useLessons } from "./hooks";
import { DeleteLessonDialog, LessonFormDialog } from "./lessons-dialogs";

export function LessonsPage() {
  const { t } = useTranslation();
  const lessons = useLessons();
  const search = useSearch({ strict: false }) as { create?: string };

  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(() => search.create === "1");
  const [editing, setEditing] = useState<Lesson | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Lesson | null>(null);

  const rows = (lessons.data ?? []).filter((row) => {
    if (!q) return true;
    const needle = q.toLowerCase();
    const teacherName = row.teacher
      ? `${row.teacher.first_name} ${row.teacher.last_name} ${row.teacher.short_code}`
      : "";
    return `${row.school_class.name} ${row.subject.name} ${row.subject.short_name} ${teacherName}`
      .toLowerCase()
      .includes(needle);
  });
  const showEmpty = !lessons.isLoading && lessons.data && lessons.data.length === 0 && !q;

  const lessonColumns: EntityColumn<Lesson>[] = [
    {
      key: "schoolClass",
      header: t("lessons.columns.schoolClass"),
      cell: (lesson) => lesson.school_class.name,
      cellClassName: "font-medium",
    },
    {
      key: "subject",
      header: t("lessons.columns.subject"),
      cell: (lesson) => (
        <>
          {lesson.subject.name}{" "}
          <span className="text-muted-foreground">· {lesson.subject.short_name}</span>
        </>
      ),
    },
    {
      key: "teacher",
      header: t("lessons.columns.teacher"),
      cell: (lesson) => (
        <span
          title={
            lesson.teacher
              ? `${lesson.teacher.first_name} ${lesson.teacher.last_name}`
              : t("lessons.fields.teacherUnassigned")
          }
        >
          {lesson.teacher ? lesson.teacher.short_code : "—"}
        </span>
      ),
      cellClassName: "font-mono text-[12.5px]",
    },
    {
      key: "hoursPerWeek",
      header: t("lessons.columns.hoursPerWeek"),
      cell: (lesson) => lesson.hours_per_week,
      className: "text-right",
      cellClassName: "font-mono text-[12.5px]",
    },
    {
      key: "blockSize",
      header: t("lessons.columns.blockSize"),
      cell: (lesson) =>
        lesson.preferred_block_size === 2
          ? t("lessons.fields.blockSizeDouble")
          : t("lessons.fields.blockSizeSingle"),
    },
  ];

  return (
    <div className="space-y-4">
      <EntityPageHead
        title={t("lessons.title")}
        subtitle={t("lessons.subtitle")}
        onCreate={() => setCreating(true)}
        createLabel={t("lessons.new")}
      />

      {lessons.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : lessons.isError ? (
        <p className="text-sm text-destructive">{t("lessons.loadError")}</p>
      ) : showEmpty ? (
        <EmptyState
          icon={<Layers className="h-7 w-7" />}
          title={t("lessons.empty.title")}
          body={t("lessons.empty.body")}
          steps={[t("lessons.empty.step1"), t("lessons.empty.step2"), t("lessons.empty.step3")]}
          onCreate={() => setCreating(true)}
          createLabel={t("lessons.new")}
        />
      ) : (
        <>
          <Toolbar
            search={q}
            onSearch={setQ}
            placeholder={t("common.search")}
            right={
              <span className="font-mono text-xs text-muted-foreground">
                {rows.length} {t("lessons.title").toLowerCase()}
              </span>
            }
          />
          <EntityListTable<Lesson>
            rows={rows}
            rowKey={(lesson) => lesson.id}
            columns={lessonColumns}
            actions={(lesson) => (
              <>
                <Button size="sm" variant="outline" onClick={() => setEditing(lesson)}>
                  {t("common.edit")}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setConfirmDelete(lesson)}
                >
                  {t("common.delete")}
                </Button>
              </>
            )}
            actionsHeader={t("lessons.columns.actions")}
          />
        </>
      )}

      <LessonFormDialog
        open={creating}
        onOpenChange={setCreating}
        submitLabel={t("common.create")}
      />
      {editing ? (
        <LessonFormDialog
          open={true}
          lesson={editing}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          submitLabel={t("common.save")}
        />
      ) : null}
      {confirmDelete ? (
        <DeleteLessonDialog lesson={confirmDelete} onClose={() => setConfirmDelete(null)} />
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Run the existing Lessons-page test**

```bash
cd frontend && mise exec -- pnpm vitest run tests/lessons-page.test.tsx
```

Expected: all assertions pass without modification.

### Task 10: Lint + commit Commit 2

- [ ] **Step 1: Run the full frontend Vitest suite**

```bash
mise run fe:test
```

Expected: all tests pass.

- [ ] **Step 2: Run lint**

```bash
mise run lint
```

Expected: pass. Particular attention to `scripts/check_unique_fns.py`, which now sees `EntityListTable`, `EntityPageHead` as the only declarations of those names (the per-page `*PageHead` helpers are gone).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/subjects/subjects-page.tsx \
  frontend/src/features/rooms/rooms-page.tsx \
  frontend/src/features/teachers/teachers-page.tsx \
  frontend/src/features/school-classes/school-classes-page.tsx \
  frontend/src/features/stundentafeln/stundentafeln-page.tsx \
  frontend/src/features/lessons/lessons-page.tsx
git commit -m "refactor(frontend): adopt EntityListTable + EntityPageHead in six entity pages"
```

---

## Commit 3: Migrate WeekSchemes head

### Task 11: Migrate WeekSchemes page (head only)

**Files:**
- Modify: `frontend/src/features/week-schemes/week-schemes-page.tsx`

- [ ] **Step 1: Replace the head usage and delete the local helper**

Edit `frontend/src/features/week-schemes/week-schemes-page.tsx`:

1. Add the import at the top: `import { EntityPageHead } from "@/components/entity-page-head";`
2. Replace `<WeekSchemesPageHead ... />` with `<EntityPageHead ... />` (props are identical).
3. Delete the `function WeekSchemesPageHead({...}) { ... }` helper at the bottom of the file.
4. Remove the `Button` import if and only if `<Button>` is no longer used elsewhere in the file (it still is — at lines 100 to 103 — so keep it).

After the edits, the relevant region should read:

```tsx
import { useSearch } from "@tanstack/react-router";
import { CalendarDays } from "lucide-react";
import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/empty-state";
import { EntityPageHead } from "@/components/entity-page-head";
import { Toolbar } from "@/components/toolbar";
import { Button } from "@/components/ui/button";
import { dayShortKey } from "@/i18n/day-keys";
import { cn } from "@/lib/utils";
import { type TimeBlock, useWeekSchemeDetail, useWeekSchemes, type WeekScheme } from "./hooks";
import { DeleteWeekSchemeDialog, WeekSchemeFormDialog } from "./week-schemes-dialogs";

export function WeekSchemesPage() {
  // ...existing state setup unchanged...
  return (
    <div className="space-y-4">
      <EntityPageHead
        title={t("weekSchemes.title")}
        subtitle={t("weekSchemes.subtitle")}
        onCreate={() => setCreating(true)}
        createLabel={t("weekSchemes.new")}
      />
      {/* ...rest of file unchanged through the closing </div> of the page... */}
    </div>
  );
}

function WeekSchemeGrid({ schemeId }: { schemeId: string }) {
  // ...unchanged...
}

function WeekSchemeGridRow({
  position,
  daysPresent,
  byKey,
}: {
  position: number;
  daysPresent: number[];
  byKey: Map<string, TimeBlock>;
}) {
  // ...unchanged...
}

// `function WeekSchemesPageHead(...) { ... }` is deleted.
```

- [ ] **Step 2: Run the existing WeekSchemes-page test**

```bash
cd frontend && mise exec -- pnpm vitest run tests/week-schemes-page.test.tsx
```

Expected: all assertions pass without modification.

### Task 12: Lint + commit Commit 3

- [ ] **Step 1: Run the full frontend Vitest suite**

```bash
mise run fe:test
```

Expected: all tests pass.

- [ ] **Step 2: Run lint**

```bash
mise run lint
```

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/week-schemes/week-schemes-page.tsx
git commit -m "refactor(frontend): adopt EntityPageHead in WeekSchemes"
```

---

## Final verification

After all three commits land:

- [ ] **Step 1: Confirm no `*PageHead` helper survives**

```bash
grep -rn 'function.*PageHead' frontend/src/features/
```

Expected: no matches (all per-entity helpers were deleted).

- [ ] **Step 2: Confirm no inline table shell survives**

```bash
grep -rn 'rounded-xl border bg-card' frontend/src/features/
```

Expected: no matches (the only occurrence of that class string should be inside `frontend/src/components/entity-list-table.tsx`).

- [ ] **Step 3: Run the full lint + test suite**

```bash
mise run lint && mise run test
```

Expected: pass on all of Rust, Python, frontend, and actionlint.

---

## Self-review checklist

The plan covers, in order:

- Spec section "Goal" (three commits) ↔ Tasks 1 to 3 (commit 1), Tasks 4 to 10 (commit 2), Tasks 11 to 12 (commit 3).
- Spec section "Design > EntityListTable" ↔ Task 2 (implementation + 10 unit tests).
- Spec section "Design > EntityPageHead" ↔ Task 1 (implementation + 3 unit tests).
- Spec section "Design > Per-entity migration shape" ↔ Tasks 4 to 9 (each per-page rewrite preserves the wrinkles called out in the spec).
- Spec section "Testing > Existing tests must pass without modification" ↔ Each migration task ends with running that page's existing test.
- Spec section "Migration order" ↔ Three commits in the order the spec describes.
- Spec section "Risks > TypeScript inference" ↔ Each per-page rewrite hoists `<entity>Columns` to a typed `EntityColumn<T>[]` const, mitigating inline-inference risk.
- Spec section "Risks > Width / alignment drift on actions column" ↔ Task 2 step 1 test "applies actionsClassName to both" pins the contract.
- Spec section "Risks > One existing test relies on a class name we touch" ↔ Each migration task ends with the per-page test run; if any class assertion exists, the test will surface it before the commit lands.

No placeholders, no TBDs. Function signatures (`EntityListTable<T>`, `EntityColumn<T>`, `EntityPageHead`) are consistent across all tasks. Method props on each migrated page (`rows`, `rowKey`, `columns`, `actions`, `actionsHeader`) match the type defined in Task 2.
