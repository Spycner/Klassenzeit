import { render, screen } from "@testing-library/react";
import { toast } from "sonner";
import { describe, expect, it } from "vitest";
import { Toaster } from "@/components/ui/sonner";

describe("Toaster (shadcn sonner wrapper)", () => {
  it("renders without a ThemeProvider (falls back to system theme)", () => {
    render(<Toaster />);
    // sonner 2.x renders a <section> live region on mount; the
    // [data-sonner-toaster] ordered list is only attached once a toast fires.
    expect(document.querySelector('section[aria-label="Notifications alt+T"]')).toBeInTheDocument();
  });

  it("shows a success toast with the given message", async () => {
    render(<Toaster />);
    toast.success("Saved successfully");
    expect(await screen.findByText("Saved successfully")).toBeInTheDocument();
  });

  it("shows an info toast with the given message", async () => {
    render(<Toaster />);
    toast.info("Nothing changed");
    expect(await screen.findByText("Nothing changed")).toBeInTheDocument();
  });
});
