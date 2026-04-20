import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it } from "vitest";
import { LessonsPage } from "@/features/lessons/lessons-page";
import i18n from "@/i18n/init";
import { renderWithProviders } from "./render-helpers";

describe("LessonsPage", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("de");
  });

  it("renders lessons fetched from the API", async () => {
    renderWithProviders(<LessonsPage />);
    expect(await screen.findByText("1a")).toBeInTheDocument();
    expect(screen.getByText(/mathematik/i)).toBeInTheDocument();
    expect(screen.getByText("SCH")).toBeInTheDocument();
  });

  it("creates a lesson via the dialog and closes on success", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LessonsPage />);

    await screen.findByText("1a");
    await user.click(screen.getByRole("button", { name: /neuer unterricht/i }));

    const dialog = await screen.findByRole("dialog");

    // Class select
    await user.click(within(dialog).getByRole("combobox", { name: /klasse/i }));
    await user.click(await screen.findByRole("option", { name: /^1a$/ }));

    // Subject select
    await user.click(within(dialog).getByRole("combobox", { name: /fach/i }));
    await user.click(await screen.findByRole("option", { name: /mathematik/i }));

    // Teacher select: pick the seeded teacher
    await user.click(within(dialog).getByRole("combobox", { name: /lehrkraft/i }));
    await user.click(await screen.findByRole("option", { name: /schmidt/i }));

    // Hours: keep the default 1
    // Block size: keep the default single period

    await user.click(within(dialog).getByRole("button", { name: /^anlegen$/i }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});
