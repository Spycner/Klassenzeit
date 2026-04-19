import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppShell } from "@/components/layout/app-shell";
import "@/i18n/init";
import { renderWithProviders } from "./render-helpers";

describe("AppShell sidebar", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it("shows a sidebar with all nav entries", async () => {
    renderWithProviders(
      <AppShell>
        <div data-testid="content" />
      </AppShell>,
    );
    expect(await screen.findByRole("link", { name: /dashboard/i })).toBeVisible();
    expect(screen.getByRole("link", { name: /subjects/i })).toBeVisible();
    expect(screen.getByRole("link", { name: /rooms/i })).toBeVisible();
    expect(screen.getByRole("link", { name: /teachers/i })).toBeVisible();
    expect(screen.getByRole("link", { name: /week schemes/i })).toBeVisible();
  });

  it("collapses and expands via the toggle button", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AppShell>
        <div data-testid="content" />
      </AppShell>,
    );
    const toggle = await screen.findByRole("button", { name: /collapse sidebar/i });
    await user.click(toggle);
    expect(localStorage.getItem("kz_sidebar_collapsed")).toBe("1");
    expect(screen.getByRole("button", { name: /expand sidebar/i })).toBeVisible();
  });
});
