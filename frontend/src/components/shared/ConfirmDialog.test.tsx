import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test/test-utils";
import { ConfirmDialog } from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    title: "Delete Item",
    description: "Are you sure you want to delete this item?",
    onConfirm: vi.fn(),
  };

  it("renders title and description when open", () => {
    render(<ConfirmDialog {...defaultProps} />);

    expect(
      screen.getByRole("heading", { name: "Delete Item" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Are you sure you want to delete this item?"),
    ).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(<ConfirmDialog {...defaultProps} open={false} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders cancel button with translated text", () => {
    render(<ConfirmDialog {...defaultProps} />);

    expect(
      screen.getByRole("button", { name: "Abbrechen" }),
    ).toBeInTheDocument();
  });

  it("renders default confirm button text based on variant", () => {
    render(<ConfirmDialog {...defaultProps} />);

    expect(
      screen.getByRole("button", { name: "Bestätigen" }),
    ).toBeInTheDocument();
  });

  it("renders delete text for destructive variant", () => {
    render(<ConfirmDialog {...defaultProps} variant="destructive" />);

    expect(screen.getByRole("button", { name: "Löschen" })).toBeInTheDocument();
  });

  it("renders custom confirm label", () => {
    render(<ConfirmDialog {...defaultProps} confirmLabel="Yes, delete" />);

    expect(
      screen.getByRole("button", { name: "Yes, delete" }),
    ).toBeInTheDocument();
  });

  it("calls onConfirm when confirm button is clicked", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<ConfirmDialog {...defaultProps} onConfirm={onConfirm} />);

    await user.click(screen.getByRole("button", { name: "Bestätigen" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onOpenChange with false when cancel button is clicked", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<ConfirmDialog {...defaultProps} onOpenChange={onOpenChange} />);

    await user.click(screen.getByRole("button", { name: "Abbrechen" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows loading spinner when isLoading is true", () => {
    render(<ConfirmDialog {...defaultProps} isLoading />);

    const confirmButton = screen.getByRole("button", { name: /bestätigen/i });
    expect(confirmButton.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("disables buttons when isLoading is true", () => {
    render(<ConfirmDialog {...defaultProps} isLoading />);

    expect(screen.getByRole("button", { name: "Abbrechen" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /bestätigen/i })).toBeDisabled();
  });

  it("applies destructive variant to confirm button", () => {
    render(<ConfirmDialog {...defaultProps} variant="destructive" />);

    const confirmButton = screen.getByRole("button", { name: "Löschen" });
    expect(confirmButton).toHaveClass("bg-destructive");
  });

  it("can close dialog with X button", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<ConfirmDialog {...defaultProps} onOpenChange={onOpenChange} />);

    const closeButton = screen.getByRole("button", { name: /close/i });
    await user.click(closeButton);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("has accessible dialog role", () => {
    render(<ConfirmDialog {...defaultProps} />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
