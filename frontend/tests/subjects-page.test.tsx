import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { SubjectsPage } from "@/features/subjects/subjects-page";
import { renderWithProviders } from "./render-helpers";

describe("SubjectsPage", () => {
  it("renders subjects fetched from the API", async () => {
    renderWithProviders(<SubjectsPage />);
    expect(await screen.findByText("Mathematik")).toBeInTheDocument();
    expect(screen.getByText("MA")).toBeInTheDocument();
  });

  it("creates a subject via the dialog and closes on success", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SubjectsPage />);

    await screen.findByText("Mathematik");
    await user.click(screen.getByRole("button", { name: /new subject/i }));

    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/^name$/i), "Deutsch");
    await user.type(within(dialog).getByLabelText(/short name/i), "DE");
    await user.click(within(dialog).getByRole("button", { name: /^create$/i }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});
