import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { StundentafelnPage } from "@/features/stundentafeln/stundentafeln-page";
import i18n from "@/i18n/init";
import { stundentafelEntriesByTafelId } from "./msw-handlers";
import { renderWithProviders } from "./render-helpers";

describe("StundentafelnPage", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("de");
  });

  beforeEach(() => {
    // Reset entries between tests; the MSW store persists across handlers.
    for (const key of Object.keys(stundentafelEntriesByTafelId)) {
      stundentafelEntriesByTafelId[key] = [];
    }
  });

  it("renders stundentafeln fetched from the API", async () => {
    renderWithProviders(<StundentafelnPage />);
    expect(await screen.findByText(/Grundschule Klasse 1/i)).toBeInTheDocument();
  });

  it("creates a stundentafel via the dialog and closes on success", async () => {
    const user = userEvent.setup();
    renderWithProviders(<StundentafelnPage />);

    await screen.findByText(/Grundschule Klasse 1/i);
    await user.click(screen.getByRole("button", { name: /neue stundentafel/i }));

    const dialog = await screen.findByRole("dialog");

    await user.type(within(dialog).getByLabelText(/^name$/i), "Gymnasium Klasse 5");
    // Grade level: keep default 1

    await user.click(within(dialog).getByRole("button", { name: /^anlegen$/i }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("adds an entry via the nested dialog inside the edit dialog", async () => {
    const user = userEvent.setup();
    renderWithProviders(<StundentafelnPage />);

    await screen.findByText(/Grundschule Klasse 1/i);
    await user.click(screen.getByRole("button", { name: /bearbeiten/i }));

    // Edit dialog opens
    const editDialog = await screen.findByRole("dialog");
    expect(
      within(editDialog).getByRole("heading", { name: /stundentafel bearbeiten/i }),
    ).toBeInTheDocument();

    // Click "Add entry" inside the edit dialog
    await user.click(within(editDialog).getByRole("button", { name: /eintrag hinzufügen/i }));

    // Nested dialog opens. `findAllByRole` returns both the parent and the entry dialog.
    const dialogs = await screen.findAllByRole("dialog");
    const entryDialog = dialogs[dialogs.length - 1];
    if (!entryDialog) throw new Error("entry dialog did not open");

    // Pick a subject
    await user.click(within(entryDialog).getByRole("combobox", { name: /fach/i }));
    await user.click(await screen.findByRole("option", { name: /mathematik/i }));

    // Hours default 1, block size default single period
    await user.click(within(entryDialog).getByRole("button", { name: /^anlegen$/i }));

    // Nested dialog closes, edit dialog stays open
    await waitFor(() => {
      expect(screen.getAllByRole("dialog")).toHaveLength(1);
    });
    expect(
      within(await screen.findByRole("dialog")).getByRole("heading", {
        name: /stundentafel bearbeiten/i,
      }),
    ).toBeInTheDocument();
  });
});
