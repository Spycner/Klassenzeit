import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Badge } from "@/components/ui/badge";
import { render, screen, within } from "@/test/test-utils";
import { type Column, DataTable } from "./DataTable";

interface TestItem {
  id: number;
  name: string;
  email: string;
  isActive: boolean;
}

const testData: TestItem[] = [
  { id: 1, name: "Alice", email: "alice@example.com", isActive: true },
  { id: 2, name: "Bob", email: "bob@example.com", isActive: false },
  { id: 3, name: "Charlie", email: "charlie@example.com", isActive: true },
];

const columns: Column<TestItem>[] = [
  { key: "name", header: "Name", sortable: true },
  { key: "email", header: "Email" },
  {
    key: "isActive",
    header: "Status",
    sortable: true,
    cell: (row) => (
      <Badge variant={row.isActive ? "default" : "secondary"}>
        {row.isActive ? "Active" : "Inactive"}
      </Badge>
    ),
  },
];

describe("DataTable", () => {
  it("renders column headers", () => {
    render(<DataTable data={testData} columns={columns} />);

    expect(
      screen.getByRole("columnheader", { name: /name/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: /email/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: /status/i }),
    ).toBeInTheDocument();
  });

  it("renders data rows", () => {
    render(<DataTable data={testData} columns={columns} />);

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("bob@example.com")).toBeInTheDocument();
  });

  it("renders custom cell content", () => {
    render(<DataTable data={testData} columns={columns} />);

    // Two rows have isActive: true, one has isActive: false
    expect(screen.getAllByText("Active")).toHaveLength(2);
    expect(screen.getByText("Inactive")).toBeInTheDocument();
  });

  it("calls onRowClick when row is clicked", async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    render(
      <DataTable data={testData} columns={columns} onRowClick={onRowClick} />,
    );

    await user.click(screen.getByText("Alice"));

    expect(onRowClick).toHaveBeenCalledWith(testData[0]);
  });

  it("does not call onRowClick when not provided", async () => {
    const user = userEvent.setup();
    render(<DataTable data={testData} columns={columns} />);

    await user.click(screen.getByText("Alice"));
    // No error should occur
  });

  it("supports keyboard navigation when onRowClick is provided", async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    render(
      <DataTable data={testData} columns={columns} onRowClick={onRowClick} />,
    );

    const row = screen.getByText("Alice").closest("tr")!;
    row.focus();
    await user.keyboard("{Enter}");

    expect(onRowClick).toHaveBeenCalledWith(testData[0]);
  });

  it("supports space key for row selection", async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    render(
      <DataTable data={testData} columns={columns} onRowClick={onRowClick} />,
    );

    const row = screen.getByText("Alice").closest("tr")!;
    row.focus();
    await user.keyboard(" ");

    expect(onRowClick).toHaveBeenCalledWith(testData[0]);
  });

  describe("Sorting", () => {
    it("shows sort icon on sortable columns", () => {
      render(<DataTable data={testData} columns={columns} />);

      const nameHeader = screen.getByRole("columnheader", { name: /name/i });
      // Sortable columns have an SVG icon
      expect(nameHeader.querySelector("svg")).toBeInTheDocument();

      // Email is not sortable, should not have icon
      const emailHeader = screen.getByRole("columnheader", { name: /email/i });
      expect(emailHeader.querySelector("svg")).not.toBeInTheDocument();
    });

    it("sorts ascending on first click", async () => {
      const user = userEvent.setup();
      render(<DataTable data={testData} columns={columns} />);

      const nameHeader = screen.getByRole("columnheader", { name: /name/i });
      await user.click(nameHeader);

      const rows = screen.getAllByRole("row").slice(1); // Skip header row
      expect(within(rows[0]).getByText("Alice")).toBeInTheDocument();
      expect(within(rows[1]).getByText("Bob")).toBeInTheDocument();
      expect(within(rows[2]).getByText("Charlie")).toBeInTheDocument();
    });

    it("sorts descending on second click", async () => {
      const user = userEvent.setup();
      render(<DataTable data={testData} columns={columns} />);

      const nameHeader = screen.getByRole("columnheader", { name: /name/i });
      await user.click(nameHeader);
      await user.click(nameHeader);

      const rows = screen.getAllByRole("row").slice(1);
      expect(within(rows[0]).getByText("Charlie")).toBeInTheDocument();
      expect(within(rows[1]).getByText("Bob")).toBeInTheDocument();
      expect(within(rows[2]).getByText("Alice")).toBeInTheDocument();
    });

    it("resets to ascending when clicking a different column", async () => {
      const user = userEvent.setup();
      render(<DataTable data={testData} columns={columns} />);

      const nameHeader = screen.getByRole("columnheader", { name: /name/i });
      const statusHeader = screen.getByRole("columnheader", {
        name: /status/i,
      });

      await user.click(nameHeader);
      await user.click(nameHeader); // desc
      await user.click(statusHeader); // new column, should be asc

      expect(statusHeader).toHaveAttribute("aria-sort", "ascending");
    });

    it("applies default sort", () => {
      render(
        <DataTable
          data={testData}
          columns={columns}
          defaultSort={{ key: "name", direction: "desc" }}
        />,
      );

      const rows = screen.getAllByRole("row").slice(1);
      expect(within(rows[0]).getByText("Charlie")).toBeInTheDocument();
      expect(within(rows[2]).getByText("Alice")).toBeInTheDocument();
    });

    it("has correct aria-sort attribute", async () => {
      const user = userEvent.setup();
      render(<DataTable data={testData} columns={columns} />);

      const nameHeader = screen.getByRole("columnheader", { name: /name/i });

      await user.click(nameHeader);
      expect(nameHeader).toHaveAttribute("aria-sort", "ascending");

      await user.click(nameHeader);
      expect(nameHeader).toHaveAttribute("aria-sort", "descending");
    });

    it("does not sort non-sortable columns when clicked", async () => {
      const user = userEvent.setup();
      render(<DataTable data={testData} columns={columns} />);

      const emailHeader = screen.getByRole("columnheader", { name: /email/i });
      await user.click(emailHeader);

      expect(emailHeader).not.toHaveAttribute("aria-sort");
    });
  });

  it("uses keyField for row keys", () => {
    render(<DataTable data={testData} columns={columns} keyField="id" />);

    // Component should render without warnings about keys
    expect(screen.getAllByRole("row")).toHaveLength(4); // 1 header + 3 data rows
  });

  it("applies custom className", () => {
    const { container } = render(
      <DataTable data={testData} columns={columns} className="custom-class" />,
    );

    expect(container.firstChild).toHaveClass("custom-class");
  });

  it("handles empty data", () => {
    render(<DataTable data={[]} columns={columns} />);

    const rows = screen.getAllByRole("row");
    expect(rows).toHaveLength(1); // Only header row
  });

  it("handles null values in data", () => {
    const dataWithNull = [
      {
        id: 1,
        name: null as unknown as string,
        email: "test@example.com",
        isActive: true,
      },
    ];

    render(<DataTable data={dataWithNull} columns={columns} />);
    expect(screen.getByText("test@example.com")).toBeInTheDocument();
  });
});
