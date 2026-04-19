import { screen } from "@testing-library/react";
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

  it("renders the school-classes stat card with a zero count", async () => {
    await i18n.changeLanguage("en");
    renderWithProviders(<DashboardPage />);
    expect(await screen.findByText("School classes")).toBeVisible();
  });
});
