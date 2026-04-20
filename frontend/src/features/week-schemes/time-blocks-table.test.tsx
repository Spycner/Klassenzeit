import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it } from "vitest";
import i18n from "@/i18n/init";
import { timeBlocksBySchemeId } from "../../../tests/msw-handlers";
import { renderWithProviders } from "../../../tests/render-helpers";
import { TimeBlocksTable } from "./time-blocks-table";

const schemeId = "cccccccc-cccc-cccc-cccc-cccccccccccc";

describe("TimeBlocksTable", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("renders existing time blocks sorted by day then position", async () => {
    timeBlocksBySchemeId[schemeId] = [
      { id: "a", day_of_week: 0, position: 1, start_time: "08:00:00", end_time: "08:45:00" },
      { id: "b", day_of_week: 1, position: 1, start_time: "08:00:00", end_time: "08:45:00" },
    ];
    renderWithProviders(<TimeBlocksTable schemeId={schemeId} />);
    const rows = await screen.findAllByRole("row");
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it("opens a nested dialog when Add is clicked", async () => {
    timeBlocksBySchemeId[schemeId] = [];
    const user = userEvent.setup();
    renderWithProviders(<TimeBlocksTable schemeId={schemeId} />);
    await user.click(await screen.findByRole("button", { name: /add time block/i }));
    expect(await screen.findByRole("dialog", { name: /add time block/i })).toBeInTheDocument();
  });

  it("submits a new block and it appears in the table", async () => {
    timeBlocksBySchemeId[schemeId] = [];
    const user = userEvent.setup();
    renderWithProviders(<TimeBlocksTable schemeId={schemeId} />);
    await user.click(await screen.findByRole("button", { name: /add time block/i }));
    const dialog = await screen.findByRole("dialog", { name: /add time block/i });
    await user.click(within(dialog).getByRole("combobox", { name: /day/i }));
    await user.click(await screen.findByRole("option", { name: /tuesday/i }));
    await user.clear(within(dialog).getByLabelText(/period/i));
    await user.type(within(dialog).getByLabelText(/period/i), "3");
    await user.clear(within(dialog).getByLabelText(/start/i));
    await user.type(within(dialog).getByLabelText(/start/i), "09:00");
    await user.clear(within(dialog).getByLabelText(/end/i));
    await user.type(within(dialog).getByLabelText(/end/i), "09:45");
    await user.click(within(dialog).getByRole("button", { name: /create/i }));
    await waitFor(() => expect(screen.queryAllByRole("dialog").length).toBe(0));
    expect(await screen.findByText("09:00:00")).toBeInTheDocument();
  });
});
