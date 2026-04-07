import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const _tCache = new Map<string, ReturnType<typeof makeT>>();

function makeT(ns: string) {
  const fn = (k: string) => `${ns}.${k}`;
  fn.raw = (k: string) => `${ns}.${k}`;
  return fn;
}

vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => {
    let fn = _tCache.get(ns);
    if (!fn) {
      fn = makeT(ns);
      _tCache.set(ns, fn);
    }
    return fn;
  },
}));

import { LessonEditDialog } from "@/components/timetable/lesson-edit-dialog";
import type {
  LessonResponse,
  RoomResponse,
  TeacherResponse,
} from "@/lib/types";

const lesson: LessonResponse = {
  id: "lesson-1",
  term_id: "term-1",
  class_id: "class-1",
  teacher_id: "teacher-1",
  subject_id: "subject-1",
  room_id: "room-1",
  timeslot_id: "ts-1",
  week_pattern: "every",
};

const teachers: TeacherResponse[] = [
  {
    id: "teacher-1",
    first_name: "A",
    last_name: "X",
    abbreviation: "AX",
  } as TeacherResponse,
  {
    id: "teacher-2",
    first_name: "B",
    last_name: "Y",
    abbreviation: "BY",
  } as TeacherResponse,
];

const rooms: RoomResponse[] = [
  { id: "room-1", name: "R1" } as RoomResponse,
  { id: "room-2", name: "R2" } as RoomResponse,
];

describe("LessonEditDialog", () => {
  beforeEach(() => {
    _tCache.clear();
  });

  it("submits only the changed teacher_id", () => {
    const onSubmit = vi.fn();
    render(
      <LessonEditDialog
        open
        lesson={lesson}
        teachers={teachers}
        rooms={rooms}
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.change(screen.getByLabelText("Teacher"), {
      target: { value: "teacher-2" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "timetable.edit.apply" }),
    );
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toEqual({ teacher_id: "teacher-2" });
  });

  it("submits room_id: null when room is cleared", () => {
    const onSubmit = vi.fn();
    render(
      <LessonEditDialog
        open
        lesson={lesson}
        teachers={teachers}
        rooms={rooms}
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.change(screen.getByLabelText("Room"), {
      target: { value: "" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "timetable.edit.apply" }),
    );
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toEqual({ room_id: null });
  });

  it("does nothing when no fields changed", () => {
    const onSubmit = vi.fn();
    render(
      <LessonEditDialog
        open
        lesson={lesson}
        teachers={teachers}
        rooms={rooms}
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "timetable.edit.apply" }),
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
