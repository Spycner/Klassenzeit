import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it } from "vitest";
import i18n from "@/i18n/init";
import { roomAvailabilityByRoomId, timeBlocksBySchemeId } from "../../../tests/msw-handlers";
import { renderWithProviders } from "../../../tests/render-helpers";
import { roomDetailQueryKey } from "./hooks";
import { RoomAvailabilityGrid } from "./room-availability-grid";

const roomId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const schemeId = "cccccccc-cccc-cccc-cccc-cccccccccccc";

describe("RoomAvailabilityGrid", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("toggles cells and saves selected time blocks", async () => {
    timeBlocksBySchemeId[schemeId] = [
      {
        id: "tb-mon-1",
        day_of_week: 0,
        position: 1,
        start_time: "08:00:00",
        end_time: "08:45:00",
      },
    ];
    roomAvailabilityByRoomId[roomId] = [];
    const user = userEvent.setup();
    renderWithProviders(<RoomAvailabilityGrid roomId={roomId} />);
    const cell = await screen.findByRole("button", {
      name: /monday/i,
    });
    await user.click(cell);
    await user.click(screen.getByRole("button", { name: /save availability/i }));
    expect(roomAvailabilityByRoomId[roomId]).toEqual(["tb-mon-1"]);
  });

  it("shows a notice when no time blocks exist in any scheme", async () => {
    for (const key of Object.keys(timeBlocksBySchemeId)) {
      timeBlocksBySchemeId[key] = [];
    }
    renderWithProviders(<RoomAvailabilityGrid roomId={roomId} />);
    expect(await screen.findByText(/no time blocks yet|create a week scheme/i)).toBeInTheDocument();
  });

  it("preserves toggled cells when the detail query refetches in the background", async () => {
    timeBlocksBySchemeId[schemeId] = [
      {
        id: "tb-mon-1",
        day_of_week: 0,
        position: 1,
        start_time: "08:00:00",
        end_time: "08:45:00",
      },
    ];
    roomAvailabilityByRoomId[roomId] = [];
    const user = userEvent.setup();
    const { queryClient } = renderWithProviders(<RoomAvailabilityGrid roomId={roomId} />);

    const cell = await screen.findByRole("button", { name: /monday/i });
    await user.click(cell);
    expect(cell).toHaveAttribute("aria-pressed", "true");

    // Simulate a sibling-tab change: a different availability set was persisted
    // by another tab, then the detail query is invalidated to trigger a refetch.
    roomAvailabilityByRoomId[roomId] = ["tb-some-other-block"];
    await queryClient.invalidateQueries({ queryKey: roomDetailQueryKey(roomId) });

    // Wait for the refetch to settle.
    await screen.findByRole("button", { name: /monday/i });

    // The user's in-progress toggle must be preserved; the refetch must not wipe state.
    expect(screen.getByRole("button", { name: /monday/i })).toHaveAttribute("aria-pressed", "true");
  });
});
