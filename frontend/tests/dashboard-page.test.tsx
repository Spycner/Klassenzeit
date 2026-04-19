import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DashboardPage } from "@/features/dashboard/dashboard-page";
import i18n from "@/i18n/init";
import { renderWithProviders } from "./render-helpers";

describe("DashboardPage", () => {
  it("renders the welcome heading and the readiness and quick-add section headings", async () => {
    await i18n.changeLanguage("en");
    renderWithProviders(<DashboardPage />);
    expect(await screen.findByRole("heading", { level: 1, name: /welcome back/i })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: /scheduling readiness/i })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: /quick add/i })).toBeVisible();
  });

  it("renders the school-classes stat card with a live count from the API", async () => {
    await i18n.changeLanguage("en");
    renderWithProviders(<DashboardPage />);
    const statLabel = await waitFor(() => {
      const labels = screen.getAllByText("School classes");
      const found = labels.find(
        (el) => el.className.includes("uppercase") && el.className.includes("tracking-wider"),
      );
      if (!found) throw new Error("Stat-card label not found");
      return found;
    });
    const card = statLabel.closest("div");
    expect(card).not.toBeNull();
    if (!card) return;
    expect(await within(card).findByText("1")).toBeVisible();
  });
});
