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
];

const teachers: TeacherResponse[] = [
  {
    id: "tch-1",
    first_name: "Anne",
    last_name: "Mueller",
    email: null,
    abbreviation: "AM",
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
    id: "ts-1",
    day_of_week: 0,
    period: 1,
    start_time: "08:00:00",
    end_time: "08:45:00",
    is_break: false,
    label: null,
  },
  {
    id: "ts-2",
    day_of_week: 1,
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
    timeslot_id: "ts-1",
  },
  {
    class_id: "cls-1",
    teacher_id: "tch-1",
    subject_id: "sub-1",
    room_id: null,
    timeslot_id: "ts-2",
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
};

describe("TimetableGrid", () => {
  it("renders a class-view cell with subject, teacher and room", () => {
    render(
      <TimetableGrid
        {...baseProps}
        viewMode="class"
        selectedEntityId="cls-1"
      />,
    );
    expect(screen.getAllByText("M").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/AM.*R101/)).toBeInTheDocument();
  });

  it("renders a teacher-view cell with subject, class and room", () => {
    render(
      <TimetableGrid
        {...baseProps}
        viewMode="teacher"
        selectedEntityId="tch-1"
      />,
    );
    expect(screen.getAllByText("M").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/5a.*R101/)).toBeInTheDocument();
  });

  it("hides lessons with null room_id in room view", () => {
    render(
      <TimetableGrid {...baseProps} viewMode="room" selectedEntityId="rm-1" />,
    );
    // lesson 1 (ts-1) has room rm-1 → visible
    // lesson 2 (ts-2) has no room → hidden
    expect(screen.getAllByText("M")).toHaveLength(1);
  });

  it("renders day headers", () => {
    render(
      <TimetableGrid
        {...baseProps}
        viewMode="class"
        selectedEntityId="cls-1"
      />,
    );
    expect(screen.getByText("Mon")).toBeInTheDocument();
    expect(screen.getByText("Fri")).toBeInTheDocument();
  });

  it("uses German day labels when locale is de", () => {
    render(
      <TimetableGrid
        {...baseProps}
        locale="de"
        viewMode="class"
        selectedEntityId="cls-1"
      />,
    );
    expect(screen.getByText("Mo")).toBeInTheDocument();
    expect(screen.getByText("Fr")).toBeInTheDocument();
  });
});

describe("TimetableGrid editable mode", () => {
  const editableProps = {
    lessons: [
      {
        id: "l1",
        class_id: "cls-1",
        teacher_id: "tch-1",
        subject_id: "sub-1",
        room_id: "rm-1",
        timeslot_id: "ts-1",
      },
    ] satisfies TimetableLesson[],
    viewMode: "class" as const,
    selectedEntityId: "cls-1",
    timeslots,
    subjects,
    teachers,
    rooms,
    classes,
    locale: "en",
  };

  it("renders no edit kebab when editable is false", () => {
    const { queryAllByLabelText } = render(
      <TimetableGrid {...editableProps} />,
    );
    expect(queryAllByLabelText("Edit lesson")).toHaveLength(0);
  });

  it("renders edit kebab on each lesson when editable is true", () => {
    const { queryAllByLabelText } = render(
      <TimetableGrid {...editableProps} editable onLessonEdit={() => {}} />,
    );
    expect(queryAllByLabelText("Edit lesson")).toHaveLength(1);
  });
});
