/**
 * Tests for ErrorBoundary Component
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";

// Component that throws an error
function ThrowingComponent({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error("Test error message");
  }
  return <div>Normal content</div>;
}

describe("ErrorBoundary", () => {
  // Suppress console.error during tests since we're testing error boundaries
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("should render children when there is no error", () => {
    render(
      <ErrorBoundary>
        <div>Child content</div>
      </ErrorBoundary>,
    );

    expect(screen.getByText("Child content")).toBeInTheDocument();
  });

  it("should render fallback UI when an error is thrown", () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    );

    // German translations
    expect(screen.getByText("Etwas ist schiefgelaufen")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es erneut.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /erneut versuchen/i }),
    ).toBeInTheDocument();
  });

  it("should display error details in expandable section", () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    );

    // German: Fehlerdetails
    const details = screen.getByText("Fehlerdetails");
    expect(details).toBeInTheDocument();

    // Expand details
    details.click();

    expect(screen.getByText(/Test error message/)).toBeInTheDocument();
  });

  it("should reset error state when Try Again is clicked", async () => {
    const user = userEvent.setup();

    const { rerender } = render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    );

    // German: Etwas ist schiefgelaufen
    expect(screen.getByText("Etwas ist schiefgelaufen")).toBeInTheDocument();

    // Rerender with non-throwing component before clicking reset
    rerender(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={false} />
      </ErrorBoundary>,
    );

    // Click reset - German: Erneut versuchen
    const retryButton = screen.getByRole("button", {
      name: /erneut versuchen/i,
    });
    await user.click(retryButton);

    // After reset, should show normal content
    expect(screen.getByText("Normal content")).toBeInTheDocument();
    expect(
      screen.queryByText("Etwas ist schiefgelaufen"),
    ).not.toBeInTheDocument();
  });

  it("should render custom fallback when provided", () => {
    render(
      <ErrorBoundary fallback={<div>Custom fallback</div>}>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Custom fallback")).toBeInTheDocument();
    expect(
      screen.queryByText("Etwas ist schiefgelaufen"),
    ).not.toBeInTheDocument();
  });

  it("should call componentDidCatch with error info", () => {
    const consoleSpy = vi.spyOn(console, "error");

    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(consoleSpy).toHaveBeenCalled();
    // Check that our custom error logging was called
    const calls = consoleSpy.mock.calls;
    const errorBoundaryCalls = calls.filter(
      (call) =>
        typeof call[0] === "string" &&
        call[0].includes("ErrorBoundary caught an error"),
    );
    expect(errorBoundaryCalls.length).toBeGreaterThan(0);
  });
});
