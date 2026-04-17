import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it } from "vitest";
import { TeachersPage } from "@/features/teachers/teachers-page";
import i18n from "@/i18n/init";
import { renderWithProviders } from "./render-helpers";

describe("TeachersPage", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("de");
  });

  it("renders teachers fetched from the API", async () => {
    renderWithProviders(<TeachersPage />);
    expect(await screen.findByText("Schmidt")).toBeInTheDocument();
    expect(screen.getByText("Anna")).toBeInTheDocument();
    expect(screen.getByText("SCH")).toBeInTheDocument();
  });

  it("creates a teacher via the dialog and closes on success", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TeachersPage />);
    await screen.findByText("Schmidt");

    await user.click(screen.getByRole("button", { name: /neue lehrkraft/i }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/vorname/i), "Max");
    await user.type(within(dialog).getByLabelText(/nachname/i), "Müller");
    await user.type(within(dialog).getByLabelText(/kürzel/i), "MÜL");
    await user.type(within(dialog).getByLabelText(/stunden/i), "20");
    await user.click(within(dialog).getByRole("button", { name: /^anlegen$/i }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});
