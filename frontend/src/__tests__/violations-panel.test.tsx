import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { ViolationsPanel } from "@/components/timetable/violations-panel";
import type {
  RoomResponse,
  SchoolClassResponse,
  SubjectResponse,
  TeacherResponse,
  TimeSlotResponse,
  ViolationDto,
} from "@/lib/types";
import en from "@/messages/en.json";

const teacher: TeacherResponse = {
  id: "t1",
  first_name: "Anna",
  last_name: "Schmidt",
  email: null,
  abbreviation: "AS",
  max_hours_per_week: 28,
  is_part_time: false,
  is_active: true,
};
const cls: SchoolClassResponse = {
  id: "c1",
  name: "1A",
  grade_level: 1,
  student_count: 22,
  class_teacher_id: null,
  is_active: true,
};
const subject: SubjectResponse = {
  id: "s1",
  name: "Math",
  abbreviation: "Ma",
  color: null,
  needs_special_room: false,
};
const room: RoomResponse = {
  id: "r1",
  name: "Room 12",
  building: null,
  capacity: 30,
  max_concurrent: 1,
  is_active: true,
};
const ts: TimeSlotResponse = {
  id: "ts1",
  day_of_week: 0,
  period: 1,
  start_time: "08:00",
  end_time: "08:45",
  is_break: false,
  label: null,
};

const hardViolation: ViolationDto = {
  kind: "teacher_conflict",
  severity: "hard",
  message: "Teacher double-booked",
  lesson_refs: [
    {
      class_id: "c1",
      subject_id: "s1",
      teacher_id: "t1",
      room_id: "r1",
      timeslot_id: "ts1",
    },
  ],
  resources: [
    { type: "teacher", id: "t1" },
    { type: "timeslot", id: "ts1" },
  ],
};

const softViolation: ViolationDto = {
  kind: "teacher_gap",
  severity: "soft",
  message: "Teacher idle period",
  lesson_refs: [],
  resources: [{ type: "teacher", id: "t1" }],
};

function renderPanel(onHighlight = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ViolationsPanel
        violations={[hardViolation, softViolation]}
        highlightedId={null}
        onHighlight={onHighlight}
        refs={{
          teachers: [teacher],
          classes: [cls],
          rooms: [room],
          subjects: [subject],
          timeslots: [ts],
          locale: "en",
        }}
      />
    </NextIntlClientProvider>,
  );
  return { onHighlight };
}

describe("ViolationsPanel", () => {
  it("groups violations by severity into tabs", () => {
    renderPanel();
    expect(screen.getByText(/Hard \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Soft \(1\)/)).toBeInTheDocument();
  });

  it("renders the violation row with the i18n title for the kind", () => {
    renderPanel();
    expect(
      screen.getAllByText(/Teacher double-booked/i).length,
    ).toBeGreaterThan(0);
  });

  it("calls onHighlight when a row is clicked", () => {
    const { onHighlight } = renderPanel();
    const matches = screen.getAllByText(/Teacher double-booked/i);
    const row = matches
      .map((el) => el.closest("button"))
      .find((b): b is HTMLButtonElement => b !== null);
    expect(row).toBeTruthy();
    fireEvent.click(row as HTMLElement);
    expect(onHighlight).toHaveBeenCalledTimes(1);
    expect(onHighlight.mock.calls[0][0].kind).toBe("teacher_conflict");
  });
});
