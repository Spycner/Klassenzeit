import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it } from "vitest";
import i18n from "@/i18n/init";
import { teacherAvailabilityByTeacherId, timeBlocksBySchemeId } from "../../../tests/msw-handlers";
import { renderWithProviders } from "../../../tests/render-helpers";
import { TeacherAvailabilityGrid } from "./teacher-availability-grid";

const teacherId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const schemeId = "cccccccc-cccc-cccc-cccc-cccccccccccc";

describe("TeacherAvailabilityGrid", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("submits preferred and unavailable entries; omits available cells", async () => {
    timeBlocksBySchemeId[schemeId] = [
      {
        id: "tb-mon-1",
        day_of_week: 0,
        position: 1,
        start_time: "08:00:00",
        end_time: "08:45:00",
      },
      {
        id: "tb-mon-2",
        day_of_week: 0,
        position: 2,
        start_time: "08:50:00",
        end_time: "09:35:00",
      },
    ];
    teacherAvailabilityByTeacherId[teacherId] = [];
    const user = userEvent.setup();
    renderWithProviders(<TeacherAvailabilityGrid teacherId={teacherId} />);

    const preferredButtons = await screen.findAllByRole("button", {
      name: /^preferred/i,
    });
    const firstPreferred = preferredButtons[0];
    if (!firstPreferred) throw new Error("missing preferred button");
    await user.click(firstPreferred);

    const unavailableButtons = await screen.findAllByRole("button", {
      name: /^unavailable/i,
    });
    const secondUnavailable = unavailableButtons[1];
    if (!secondUnavailable) throw new Error("missing second unavailable button");
    await user.click(secondUnavailable);

    await user.click(screen.getByRole("button", { name: /save availability/i }));

    expect(teacherAvailabilityByTeacherId[teacherId]).toEqual([
      { time_block_id: "tb-mon-1", status: "preferred" },
      { time_block_id: "tb-mon-2", status: "unavailable" },
    ]);
  });
});
