import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import type { PreviewResponse } from "@/lib/import-export";
import en from "@/messages/en.json";
import { ImportPreviewDialog } from "./import-preview-dialog";

function wrap(ui: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="en" messages={en}>
      {ui}
    </NextIntlClientProvider>
  );
}

const happyPreview: PreviewResponse = {
  token: "tok-1",
  entity: "teachers",
  summary: { create: 2, update: 1, unchanged: 0, invalid: 0 },
  rows: [
    { line: 2, action: "create", natural_key: "JD1" },
    { line: 3, action: "create", natural_key: "JD2" },
    { line: 4, action: "update", natural_key: "JD3" },
  ],
};

const invalidPreview: PreviewResponse = {
  token: "tok-2",
  entity: "teachers",
  summary: { create: 0, update: 0, unchanged: 0, invalid: 1 },
  rows: [
    {
      line: 2,
      action: "invalid",
      natural_key: "",
      errors: ["last_name is required"],
    },
  ],
};

describe("ImportPreviewDialog", () => {
  it("renders summary chips and enables Confirm when no invalid rows", () => {
    const onConfirm = vi.fn();
    render(
      wrap(
        <ImportPreviewDialog
          open
          preview={happyPreview}
          onCancel={() => {}}
          onConfirm={onConfirm}
        />,
      ),
    );
    expect(screen.getAllByText(/Create/i).length).toBeGreaterThan(0);
    expect(screen.getByText("2")).toBeInTheDocument();
    const confirmBtn = screen.getByRole("button", { name: /Confirm/i });
    expect(confirmBtn).not.toBeDisabled();
    fireEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledWith("tok-1");
  });

  it("disables Confirm when there are invalid rows", () => {
    render(
      wrap(
        <ImportPreviewDialog
          open
          preview={invalidPreview}
          onCancel={() => {}}
          onConfirm={() => {}}
        />,
      ),
    );
    expect(screen.getByRole("button", { name: /Confirm/i })).toBeDisabled();
    expect(screen.getByText(/last_name is required/)).toBeInTheDocument();
  });
});
