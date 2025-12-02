import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test/test-utils";
import { ErrorState } from "./ErrorState";

describe("ErrorState", () => {
  const testError = new Error("Something went wrong");

  it("renders error title", () => {
    render(<ErrorState error={testError} />);

    expect(
      screen.getByRole("heading", { name: "Ein Fehler ist aufgetreten" }),
    ).toBeInTheDocument();
  });

  it("renders error message", () => {
    render(<ErrorState error={testError} />);

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("renders alert icon", () => {
    render(<ErrorState error={testError} />);

    const icon = document.querySelector("svg");
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveAttribute("aria-hidden", "true");
  });

  it("has alert role for accessibility", () => {
    render(<ErrorState error={testError} />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("renders retry button when onRetry is provided", () => {
    const onRetry = vi.fn();
    render(<ErrorState error={testError} onRetry={onRetry} />);

    expect(
      screen.getByRole("button", { name: "Wiederholen" }),
    ).toBeInTheDocument();
  });

  it("does not render retry button when onRetry is not provided", () => {
    render(<ErrorState error={testError} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("calls onRetry when retry button is clicked", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<ErrorState error={testError} onRetry={onRetry} />);

    await user.click(screen.getByRole("button", { name: "Wiederholen" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("applies custom className", () => {
    render(<ErrorState error={testError} className="custom-class" />);

    expect(screen.getByRole("alert")).toHaveClass("custom-class");
  });

  it("displays different error messages", () => {
    const customError = new Error("Network connection failed");
    render(<ErrorState error={customError} />);

    expect(screen.getByText("Network connection failed")).toBeInTheDocument();
  });
});
