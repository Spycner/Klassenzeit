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
    cellClassName: "font-bold",
  },
  {
    key: "code",
    header: "Code",
    cell: (row) => row.code,
    className: "text-right",
  },
];

function mustGet<T>(values: readonly T[], index: number, label: string): T {
  const value = values[index];
  if (value === undefined) {
    throw new Error(`expected ${label}[${index}] to be defined`);
  }
  return value;
}

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
    const dataRows = screen.getAllByRole("row").slice(1);
    expect(dataRows).toHaveLength(2);
    const firstCells = within(mustGet(dataRows, 0, "dataRows")).getAllByRole("cell");
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
    const headers = screen.getAllByRole("columnheader");
    const codeHeader = mustGet(headers, 1, "headers");
    expect(codeHeader.className).toContain("text-right");
    const dataRows = screen.getAllByRole("row").slice(1);
    const cells = within(mustGet(dataRows, 0, "dataRows")).getAllByRole("cell");
    const codeCell = mustGet(cells, 1, "cells");
    expect(codeCell.className).toContain("text-right");
  });

  it("applies cellClassName to <td> only", () => {
    // `font-bold` chosen so it does not collide with shadcn's <TableHead> base
    // class, which bakes in `font-medium`. Using `font-medium` here would pass
    // on the cell but surface a false negative on the header.
    render(<EntityListTable rows={rows} rowKey={(r) => r.id} columns={columns} />);
    const headers = screen.getAllByRole("columnheader");
    const nameHeader = mustGet(headers, 0, "headers");
    expect(nameHeader.className).not.toContain("font-bold");
    const dataRows = screen.getAllByRole("row").slice(1);
    const cells = within(mustGet(dataRows, 0, "dataRows")).getAllByRole("cell");
    const nameCell = mustGet(cells, 0, "cells");
    expect(nameCell.className).toContain("font-bold");
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
    const headers = screen.getAllByRole("columnheader");
    const header = mustGet(headers, 0, "headers");
    expect(header.className).toContain("uppercase");
    const dataRows = screen.getAllByRole("row").slice(1);
    const cells = within(mustGet(dataRows, 0, "dataRows")).getAllByRole("cell");
    const cell = mustGet(cells, 0, "cells");
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
    const cells = within(mustGet(dataRows, 0, "dataRows")).getAllByRole("cell");
    const actionsCell = mustGet(cells, 2, "cells");
    expect(actionsCell.className).toContain("w-24");
    expect(actionsCell.className).toContain("text-center");
  });

  it("uses rowKey to reconcile rows on reorder", () => {
    const { rerender } = render(
      <EntityListTable rows={rows} rowKey={(r) => r.id} columns={columns} />,
    );
    let dataRows = screen.getAllByRole("row").slice(1);
    let firstCells = within(mustGet(dataRows, 0, "dataRows")).getAllByRole("cell");
    expect(firstCells[0]).toHaveTextContent("Alpha");

    const reversed = [...rows].reverse();
    rerender(<EntityListTable rows={reversed} rowKey={(r) => r.id} columns={columns} />);
    dataRows = screen.getAllByRole("row").slice(1);
    firstCells = within(mustGet(dataRows, 0, "dataRows")).getAllByRole("cell");
    expect(firstCells[0]).toHaveTextContent("Beta");
    const secondCells = within(mustGet(dataRows, 1, "dataRows")).getAllByRole("cell");
    expect(secondCells[0]).toHaveTextContent("Alpha");
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
