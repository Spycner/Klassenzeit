"use client";

import type {
  RoomResponse,
  SchoolClassResponse,
  SubjectResponse,
  TeacherResponse,
  TimeSlotResponse,
  TimetableLesson,
  TimetableViewMode,
} from "@/lib/types";

const DAY_LABELS_EN = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const DAY_LABELS_DE = ["Mo", "Di", "Mi", "Do", "Fr"];

interface TimetableGridProps {
  lessons: TimetableLesson[];
  viewMode: TimetableViewMode;
  selectedEntityId: string | null;
  timeslots: TimeSlotResponse[];
  subjects: SubjectResponse[];
  teachers: TeacherResponse[];
  rooms: RoomResponse[];
  classes: SchoolClassResponse[];
  locale: string;
}

export function TimetableGrid({
  lessons,
  viewMode,
  selectedEntityId,
  timeslots,
  subjects,
  teachers,
  rooms,
  classes,
  locale,
}: TimetableGridProps) {
  const dayLabels = locale === "de" ? DAY_LABELS_DE : DAY_LABELS_EN;

  const subjectMap = new Map(subjects.map((s) => [s.id, s]));
  const teacherMap = new Map(teachers.map((t) => [t.id, t]));
  const roomMap = new Map(rooms.map((r) => [r.id, r]));
  const classMap = new Map(classes.map((c) => [c.id, c]));
  const timeslotMap = new Map(timeslots.map((ts) => [ts.id, ts]));

  const periods = [
    ...new Set(timeslots.filter((ts) => !ts.is_break).map((ts) => ts.period)),
  ].sort((a, b) => a - b);

  function lessonMatchesEntity(lesson: TimetableLesson): boolean {
    if (!selectedEntityId) return false;
    switch (viewMode) {
      case "class":
        return lesson.class_id === selectedEntityId;
      case "teacher":
        return lesson.teacher_id === selectedEntityId;
      case "room":
        return lesson.room_id === selectedEntityId;
    }
  }

  function getLessonForCell(day: number, period: number) {
    return lessons.find((lesson) => {
      const ts = timeslotMap.get(lesson.timeslot_id);
      return (
        ts &&
        ts.day_of_week === day &&
        ts.period === period &&
        lessonMatchesEntity(lesson)
      );
    });
  }

  function renderCellContent(lesson: TimetableLesson) {
    const subject = subjectMap.get(lesson.subject_id);
    const teacher = teacherMap.get(lesson.teacher_id);
    const room = lesson.room_id ? roomMap.get(lesson.room_id) : null;
    const cls = classMap.get(lesson.class_id);

    let bottom = "";
    switch (viewMode) {
      case "class":
        bottom = `${teacher?.abbreviation ?? ""}${room ? ` - ${room.name}` : ""}`;
        break;
      case "teacher":
        bottom = `${cls?.name ?? ""}${room ? ` - ${room.name}` : ""}`;
        break;
      case "room":
        bottom = `${cls?.name ?? ""}${teacher ? ` - ${teacher.abbreviation}` : ""}`;
        break;
    }

    return (
      <div className="text-center">
        <div className="font-medium">{subject?.abbreviation ?? ""}</div>
        <div className="text-xs text-muted-foreground">{bottom}</div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="p-2 text-left font-medium" />
            {dayLabels.map((day) => (
              <th key={day} className="p-2 text-center font-medium">
                {day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periods.map((period) => (
            <tr key={`period-${period}`} className="border-b">
              <td className="p-2 text-center font-medium text-muted-foreground">
                {period}
              </td>
              {[0, 1, 2, 3, 4].map((day) => {
                const lesson = getLessonForCell(day, period);
                if (!lesson) {
                  return (
                    <td
                      key={`cell-${day}-${period}`}
                      className="border-l p-2"
                    />
                  );
                }
                const subject = subjectMap.get(lesson.subject_id);
                const color = subject?.color ?? null;
                return (
                  <td
                    key={`cell-${day}-${period}`}
                    className="border-l p-2"
                    style={
                      color ? { backgroundColor: `${color}20` } : undefined
                    }
                  >
                    {renderCellContent(lesson)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
