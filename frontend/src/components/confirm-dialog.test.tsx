import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "@/components/confirm-dialog";
import i18n from "@/i18n/init";

function wrapConfirmDialog(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("ConfirmDialog", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("renders title, description, and default cancel/confirm labels", () => {
    render(
      wrapConfirmDialog(
        <ConfirmDialog
          open
          onClose={() => {}}
          title="Delete the thing?"
          description="This cannot be undone."
          onConfirm={() => {}}
        />,
      ),
    );
    expect(screen.getByRole("heading", { name: "Delete the thing?" })).toBeInTheDocument();
    expect(screen.getByText("This cannot be undone.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("invokes onClose when the cancel button is clicked", () => {
    const onClose = vi.fn();
    render(
      wrapConfirmDialog(
        <ConfirmDialog open onClose={onClose} title="t" description="d" onConfirm={() => {}} />,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("invokes onConfirm when the confirm button is clicked", () => {
    const onConfirm = vi.fn();
    render(
      wrapConfirmDialog(
        <ConfirmDialog open onClose={() => {}} title="t" description="d" onConfirm={onConfirm} />,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("disables the confirm button and swaps the label when isPending is true", () => {
    render(
      wrapConfirmDialog(
        <ConfirmDialog
          open
          onClose={() => {}}
          title="t"
          description="d"
          onConfirm={() => {}}
          isPending
        />,
      ),
    );
    const confirm = screen.getByRole("button", { name: /deleting/i });
    expect(confirm).toBeDisabled();
  });
});
