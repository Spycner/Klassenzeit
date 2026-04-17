import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it } from "vitest";
import { RoomsPage } from "@/features/rooms/rooms-page";
import i18n from "@/i18n/init";
import { renderWithProviders } from "./render-helpers";

describe("RoomsPage", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("de");
  });

  it("renders rooms fetched from the API", async () => {
    renderWithProviders(<RoomsPage />);
    expect(await screen.findByText("Raum 101")).toBeInTheDocument();
    expect(screen.getByText("101")).toBeInTheDocument();
  });

  it("creates a room via the dialog and closes on success", async () => {
    const user = userEvent.setup();
    renderWithProviders(<RoomsPage />);

    await screen.findByText("Raum 101");
    await user.click(screen.getByRole("button", { name: /neuer raum/i }));

    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/^name$/i), "Raum 102");
    await user.type(within(dialog).getByLabelText(/kürzel/i), "102");
    await user.click(within(dialog).getByRole("button", { name: /^anlegen$/i }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});
