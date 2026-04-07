import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ViewModeSelector } from "@/components/timetable/view-mode-selector";
import type {
  RoomResponse,
  SchoolClassResponse,
  TeacherResponse,
} from "@/lib/types";

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
}));

const classes: SchoolClassResponse[] = [
  {
    id: "cls-1",
    name: "5a",
    grade_level: 5,
    student_count: 20,
    class_teacher_id: null,
    is_active: true,
  },
  {
    id: "cls-2",
    name: "5b",
    grade_level: 5,
    student_count: 22,
    class_teacher_id: null,
    is_active: true,
  },
];

const teachers: TeacherResponse[] = [
  {
    id: "tch-1",
    first_name: "Anne",
    last_name: "M",
    email: null,
    abbreviation: "AM",
    max_hours_per_week: 28,
    is_part_time: false,
    is_active: true,
  },
];

const rooms: RoomResponse[] = [
  {
    id: "rm-1",
    name: "R101",
    building: null,
    capacity: 30,
    max_concurrent: 1,
    is_active: true,
  },
];

describe("ViewModeSelector", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("calls onChange when toggling to teacher mode", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ViewModeSelector
        schoolId="school-1"
        viewMode="class"
        selectedEntityId="cls-1"
        classes={classes}
        teachers={teachers}
        rooms={rooms}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: /teacher/i }));

    expect(onChange).toHaveBeenCalledWith({
      viewMode: "teacher",
      selectedEntityId: "tch-1",
    });
  });

  it("persists the last view to localStorage", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ViewModeSelector
        schoolId="school-1"
        viewMode="class"
        selectedEntityId="cls-1"
        classes={classes}
        teachers={teachers}
        rooms={rooms}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: /room/i }));

    expect(localStorage.getItem("timetable:lastView:school-1")).toContain(
      '"viewMode":"room"',
    );
  });
});
