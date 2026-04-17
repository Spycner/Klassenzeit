import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it } from "vitest";
import { WeekSchemesPage } from "@/features/week-schemes/week-schemes-page";
import i18n from "@/i18n/init";
import { renderWithProviders } from "./render-helpers";

describe("WeekSchemesPage", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("de");
  });

  it("renders week schemes fetched from the API", async () => {
    renderWithProviders(<WeekSchemesPage />);
    expect(await screen.findByText("Standardwoche")).toBeInTheDocument();
  });

  it("creates a week scheme via the dialog and closes on success", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WeekSchemesPage />);
    await screen.findByText("Standardwoche");

    await user.click(screen.getByRole("button", { name: /neues wochenschema/i }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/^name$/i), "A-Woche");
    await user.click(within(dialog).getByRole("button", { name: /^anlegen$/i }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});
