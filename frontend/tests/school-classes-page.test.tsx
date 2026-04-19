import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it } from "vitest";
import { SchoolClassesPage } from "@/features/school-classes/school-classes-page";
import i18n from "@/i18n/init";
import { renderWithProviders } from "./render-helpers";

describe("SchoolClassesPage", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("de");
  });

  it("renders school classes fetched from the API", async () => {
    renderWithProviders(<SchoolClassesPage />);
    expect(await screen.findByText("1a")).toBeInTheDocument();
    expect(screen.getByText("Grundschule Klasse 1")).toBeInTheDocument();
    expect(screen.getByText("Standardwoche")).toBeInTheDocument();
  });

  it("creates a school class via the dialog and closes on success", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SchoolClassesPage />);

    await screen.findByText("1a");
    await user.click(screen.getByRole("button", { name: /neue klasse/i }));

    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/^name$/i), "1b");

    // Open the curriculum select and pick the seeded entry.
    await user.click(within(dialog).getByRole("combobox", { name: /stundentafel/i }));
    await user.click(await screen.findByRole("option", { name: /grundschule klasse 1/i }));

    // Open the week scheme select and pick the seeded entry.
    await user.click(within(dialog).getByRole("combobox", { name: /wochenschema/i }));
    await user.click(await screen.findByRole("option", { name: /standardwoche/i }));

    await user.click(within(dialog).getByRole("button", { name: /^anlegen$/i }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});
