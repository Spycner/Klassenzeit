"use client";

import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { MoreVertical } from "lucide-react";
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
  highlightedCells?: Set<string>;
  highlightTone?: "error" | "warn";
  editable?: boolean;
  visibleDays?: number[];
  onLessonMove?: (lessonId: string, targetTimeslotId: string) => void;
  onLessonSwap?: (lessonAId: string, lessonBId: string) => void;
  onLessonEdit?: (lessonId: string) => void;
}

interface DraggableLessonProps {
  lessonId: string;
  children: React.ReactNode;
}

function DraggableLesson({ lessonId, children }: DraggableLessonProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `lesson:${lessonId}`,
    data: { lessonId },
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`cursor-grab ${isDragging ? "opacity-40" : ""}`}
    >
      {children}
    </div>
  );
}

interface DropCellProps {
  timeslotId: string;
  occupantLessonId: string | null;
  className: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

function DropCell({
  timeslotId,
  occupantLessonId,
  className,
  style,
  children,
}: DropCellProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `cell:${timeslotId}`,
    data: { timeslotId, occupantLessonId },
  });
  return (
    <td
      ref={setNodeRef}
      className={`${className} ${
        isOver ? "outline outline-2 outline-dashed outline-blue-400" : ""
      }`}
      style={style}
    >
      {children}
    </td>
  );
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
  highlightedCells,
  highlightTone = "error",
  editable = false,
  onLessonMove,
  onLessonSwap,
  onLessonEdit,
  visibleDays,
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

  const activeDays = visibleDays ?? [0, 1, 2, 3, 4];

  // Pointer activation distance prevents accidental drags during clicks on the kebab.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

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

  function findTimeslotIdFor(day: number, period: number): string | null {
    const ts = timeslots.find(
      (t) => !t.is_break && t.day_of_week === day && t.period === period,
    );
    return ts?.id ?? null;
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

    const inner = (
      <div className="text-center">
        <div className="font-medium">{subject?.abbreviation ?? ""}</div>
        <div className="text-xs text-muted-foreground">{bottom}</div>
      </div>
    );

    if (!editable || !lesson.id) return inner;

    const lessonId = lesson.id;
    return (
      <div className="relative">
        <DraggableLesson lessonId={lessonId}>{inner}</DraggableLesson>
        <button
          type="button"
          aria-label="Edit lesson"
          className="absolute right-0 top-0 rounded p-0.5 text-muted-foreground hover:bg-accent"
          onClick={(e) => {
            e.stopPropagation();
            onLessonEdit?.(lessonId);
          }}
        >
          <MoreVertical className="h-3 w-3" />
        </button>
      </div>
    );
  }

  function handleDragEnd(e: DragEndEvent) {
    if (!e.over) return;
    const lessonId = (
      e.active.data.current as { lessonId?: string } | undefined
    )?.lessonId;
    const targetTimeslotId = (
      e.over.data.current as { timeslotId?: string } | undefined
    )?.timeslotId;
    const occupantLessonId = (
      e.over.data.current as { occupantLessonId?: string | null } | undefined
    )?.occupantLessonId;
    if (!lessonId || !targetTimeslotId) return;
    if (occupantLessonId && occupantLessonId !== lessonId) {
      onLessonSwap?.(lessonId, occupantLessonId);
    } else if (!occupantLessonId) {
      onLessonMove?.(lessonId, targetTimeslotId);
    }
  }

  const grid = (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="p-2 text-left font-medium" />
            {activeDays.map((day) => (
              <th key={`day-${day}`} className="p-2 text-center font-medium">
                {dayLabels[day]}
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
              {activeDays.map((day) => {
                const lesson = getLessonForCell(day, period);
                const cellKey = `${day}-${period}`;
                const isHighlighted = highlightedCells?.has(cellKey) ?? false;
                const ringClass = isHighlighted
                  ? highlightTone === "warn" && lesson
                    ? "ring-2 ring-amber-500 ring-offset-1 animate-[pulse_600ms_ease-out_1]"
                    : "ring-2 ring-red-500 ring-offset-1 animate-[pulse_600ms_ease-out_1]"
                  : "";
                const baseClass = `border-l p-2 ${ringClass}`;
                const subject = lesson
                  ? subjectMap.get(lesson.subject_id)
                  : null;
                const color = subject?.color ?? null;
                const style = color
                  ? { backgroundColor: `${color}20` }
                  : undefined;

                if (!editable) {
                  return (
                    <td
                      key={`cell-${day}-${period}`}
                      className={baseClass}
                      style={style}
                    >
                      {lesson ? renderCellContent(lesson) : null}
                    </td>
                  );
                }

                const tsId = findTimeslotIdFor(day, period);
                if (!tsId) {
                  return (
                    <td key={`cell-${day}-${period}`} className={baseClass} />
                  );
                }
                return (
                  <DropCell
                    key={`cell-${day}-${period}`}
                    timeslotId={tsId}
                    occupantLessonId={lesson?.id ?? null}
                    className={baseClass}
                    style={style}
                  >
                    {lesson ? renderCellContent(lesson) : null}
                  </DropCell>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  if (!editable) return grid;

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      {grid}
    </DndContext>
  );
}
