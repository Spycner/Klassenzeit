import { Users } from "lucide-react";
import { describe, expect, it } from "vitest";
import { Button } from "@/components/ui/button";
import { render, screen } from "@/test/test-utils";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("renders title", () => {
    render(<EmptyState title="No items found" />);

    expect(
      screen.getByRole("heading", { name: "No items found" }),
    ).toBeInTheDocument();
  });

  it("renders description when provided", () => {
    render(
      <EmptyState
        title="No teachers"
        description="Add your first teacher to get started"
      />,
    );

    expect(
      screen.getByText("Add your first teacher to get started"),
    ).toBeInTheDocument();
  });

  it("does not render description when not provided", () => {
    render(<EmptyState title="No items" />);

    expect(screen.queryByText(/Add your/)).not.toBeInTheDocument();
  });

  it("renders icon when provided", () => {
    render(<EmptyState title="No teachers" icon={Users} />);

    const icon = document.querySelector("svg");
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveAttribute("aria-hidden", "true");
  });

  it("does not render icon container when not provided", () => {
    render(<EmptyState title="No items" />);

    expect(document.querySelector("svg")).not.toBeInTheDocument();
  });

  it("renders action when provided", () => {
    render(
      <EmptyState title="No teachers" action={<Button>Add Teacher</Button>} />,
    );

    expect(
      screen.getByRole("button", { name: "Add Teacher" }),
    ).toBeInTheDocument();
  });

  it("does not render action container when not provided", () => {
    render(<EmptyState title="No items" />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <EmptyState title="No items" className="custom-class" />,
    );

    expect(container.firstChild).toHaveClass("custom-class");
  });

  it("renders complete empty state with all props", () => {
    render(
      <EmptyState
        icon={Users}
        title="No teachers yet"
        description="Add your first teacher to get started"
        action={<Button>Add Teacher</Button>}
      />,
    );

    expect(document.querySelector("svg")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "No teachers yet" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Add your first teacher to get started"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add Teacher" }),
    ).toBeInTheDocument();
  });
});
