import { describe, expect, it } from "vitest";
import { Button } from "@/components/ui/button";
import { render, screen } from "@/test/test-utils";
import { PageHeader } from "./PageHeader";

describe("PageHeader", () => {
  it("renders title", () => {
    render(<PageHeader title="Teachers" />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Teachers" }),
    ).toBeInTheDocument();
  });

  it("renders description when provided", () => {
    render(
      <PageHeader
        title="Teachers"
        description="Manage your school's teaching staff"
      />,
    );

    expect(
      screen.getByText("Manage your school's teaching staff"),
    ).toBeInTheDocument();
  });

  it("does not render description when not provided", () => {
    render(<PageHeader title="Teachers" />);

    expect(screen.queryByText(/Manage/)).not.toBeInTheDocument();
  });

  it("renders actions when provided", () => {
    render(
      <PageHeader title="Teachers" actions={<Button>Add Teacher</Button>} />,
    );

    expect(
      screen.getByRole("button", { name: "Add Teacher" }),
    ).toBeInTheDocument();
  });

  it("does not render actions container when not provided", () => {
    render(<PageHeader title="Teachers" />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders breadcrumbs when provided", () => {
    render(
      <PageHeader
        title="Edit Teacher"
        breadcrumbs={[
          { label: "Teachers", href: "/teachers" },
          { label: "Edit" },
        ]}
      />,
    );

    expect(
      screen.getByRole("navigation", { name: "breadcrumb" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Teachers" })).toBeInTheDocument();
    expect(screen.getByText("Edit")).toBeInTheDocument();
  });

  it("does not render breadcrumbs when not provided", () => {
    render(<PageHeader title="Teachers" />);

    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("renders last breadcrumb item as current page", () => {
    render(
      <PageHeader
        title="Edit Teacher"
        breadcrumbs={[
          { label: "Teachers", href: "/teachers" },
          { label: "John Doe" },
        ]}
      />,
    );

    // The last breadcrumb should be marked as current page
    const currentPage = screen.getByText("John Doe");
    expect(currentPage).toHaveAttribute("aria-current", "page");
  });

  it("breadcrumb links have correct href with language prefix", () => {
    render(
      <PageHeader
        title="Edit"
        breadcrumbs={[
          { label: "Teachers", href: "/teachers" },
          { label: "Edit" },
        ]}
      />,
      { initialEntries: ["/de/teachers/1"] },
    );

    const link = screen.getByRole("link", { name: "Teachers" });
    expect(link).toHaveAttribute("href", "/de/teachers");
  });

  it("applies custom className", () => {
    const { container } = render(
      <PageHeader title="Teachers" className="custom-class" />,
    );

    expect(container.firstChild).toHaveClass("custom-class");
  });

  it("renders complete page header with all props", () => {
    render(
      <PageHeader
        title="Edit Teacher"
        description="Update teacher information"
        actions={<Button>Save Changes</Button>}
        breadcrumbs={[
          { label: "Teachers", href: "/teachers" },
          { label: "Edit" },
        ]}
      />,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Edit Teacher" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Update teacher information")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save Changes" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("navigation")).toBeInTheDocument();
  });
});
