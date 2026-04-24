import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import i18n from "@/i18n/init";
import { type ScheduleCell, ScheduleGrid } from "./schedule-grid";

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

describe("ScheduleGrid", () => {
  it("renders a day header for every day present and a row for every position", () => {
    const cells: ScheduleCell[] = [
      {
        key: "0-1",
        day: 0,
        position: 1,
        subjectName: "Mathematics",
        teacherName: "Mueller",
        roomName: "Room 101",
      },
      {
        key: "1-2",
        day: 1,
        position: 2,
        subjectName: "German",
        teacherName: "Schmidt",
        roomName: "Room 102",
      },
    ];
    render(<ScheduleGrid cells={cells} daysPresent={[0, 1]} positions={[1, 2]} />);
    expect(screen.getByText("Mon")).toBeInTheDocument();
    expect(screen.getByText("Tue")).toBeInTheDocument();
    expect(screen.getByText("P1")).toBeInTheDocument();
    expect(screen.getByText("P2")).toBeInTheDocument();
    expect(screen.getByText("Mathematics")).toBeInTheDocument();
    expect(screen.getByText("German")).toBeInTheDocument();
  });

  it("renders an empty cell when no placement exists at (day, position)", () => {
    render(<ScheduleGrid cells={[]} daysPresent={[0]} positions={[1]} />);
    const cells = document.querySelectorAll<HTMLElement>(".kz-ws-cell");
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      const text = cell.textContent ?? "";
      expect(text === "Mon" || text === "P1" || text === "").toBe(true);
    }
  });
});
