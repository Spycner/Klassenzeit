import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TimetableGrid } from "@/components/timetable/timetable-grid";
import type {
  RoomResponse,
  SchoolClassResponse,
  SubjectResponse,
  TeacherResponse,
  TimeSlotResponse,
  TimetableLesson,
} from "@/lib/types";

const subjects: SubjectResponse[] = [
  {
    id: "sub-1",
    name: "Math",
    abbreviation: "M",
    color: "#ff0000",
    needs_special_room: false,
  },
  {
    id: "sub-2",
    name: "English",
    abbreviation: "E",
    color: "#00ff00",
    needs_special_room: false,
  },
];
const teachers: TeacherResponse[] = [
  {
    id: "tch-1",
    first_name: "A",
    last_name: "B",
    email: null,
    abbreviation: "AB",
    max_hours_per_week: 28,
    is_part_time: false,
    is_active: true,
  },
];
const classes: SchoolClassResponse[] = [
  {
    id: "cls-1",
    name: "5a",
    grade_level: 5,
    student_count: 20,
    class_teacher_id: null,
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
const timeslots: TimeSlotResponse[] = [
  {
    id: "ts-mon",
    day_of_week: 0,
    period: 1,
    start_time: "08:00:00",
    end_time: "08:45:00",
    is_break: false,
    label: null,
  },
  {
    id: "ts-wed",
    day_of_week: 2,
    period: 1,
    start_time: "08:00:00",
    end_time: "08:45:00",
    is_break: false,
    label: null,
  },
];
const lessons: TimetableLesson[] = [
  {
    class_id: "cls-1",
    teacher_id: "tch-1",
    subject_id: "sub-1",
    room_id: "rm-1",
    timeslot_id: "ts-mon",
  },
  {
    class_id: "cls-1",
    teacher_id: "tch-1",
    subject_id: "sub-2",
    room_id: "rm-1",
    timeslot_id: "ts-wed",
  },
];

const baseProps = {
  lessons,
  timeslots,
  subjects,
  teachers,
  rooms,
  classes,
  locale: "en",
  viewMode: "class" as const,
  selectedEntityId: "cls-1",
};

describe("TimetableGrid visibleDays", () => {
  it("renders only the specified day columns", () => {
    render(<TimetableGrid {...baseProps} visibleDays={[2]} />);
    expect(screen.getByText("Wed")).toBeInTheDocument();
    expect(screen.queryByText("Mon")).not.toBeInTheDocument();
    expect(screen.getByText("E")).toBeInTheDocument();
    expect(screen.queryByText("M")).not.toBeInTheDocument();
  });

  it("renders all five days when visibleDays is omitted", () => {
    render(<TimetableGrid {...baseProps} />);
    expect(screen.getByText("Mon")).toBeInTheDocument();
    expect(screen.getByText("Tue")).toBeInTheDocument();
    expect(screen.getByText("Wed")).toBeInTheDocument();
    expect(screen.getByText("Thu")).toBeInTheDocument();
    expect(screen.getByText("Fri")).toBeInTheDocument();
  });
});
