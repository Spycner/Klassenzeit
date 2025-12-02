import { describe, expect, it } from "vitest";
import { render, screen } from "@/test/test-utils";
import { LoadingState } from "./LoadingState";

describe("LoadingState", () => {
  it("renders default loading message", () => {
    render(<LoadingState />);

    expect(screen.getByRole("status")).toBeInTheDocument(); // output element has implicit status role
    expect(screen.getByText("Wird geladen...")).toBeInTheDocument();
  });

  it("renders custom message", () => {
    render(<LoadingState message="Loading teachers..." />);

    expect(screen.getByText("Loading teachers...")).toBeInTheDocument();
  });

  it("renders spinner icon", () => {
    render(<LoadingState />);

    const status = screen.getByRole("status");
    expect(status.querySelector("svg")).toBeInTheDocument();
  });

  it("renders skeleton rows when specified", () => {
    render(<LoadingState rows={3} />);

    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons).toHaveLength(3);
  });

  it("does not render skeletons when rows is 0", () => {
    render(<LoadingState rows={0} />);

    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons).toHaveLength(0);
  });

  it("renders both message and skeletons", () => {
    render(<LoadingState message="Loading data..." rows={2} />);

    expect(screen.getByText("Loading data...")).toBeInTheDocument();
    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons).toHaveLength(2);
  });

  it("applies custom className", () => {
    render(<LoadingState className="custom-class" />);

    expect(screen.getByRole("status")).toHaveClass("custom-class");
  });

  it("has accessible role and aria-live", () => {
    render(<LoadingState />);

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
  });
});
