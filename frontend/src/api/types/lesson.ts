/**
 * Lesson types (Timetable entries)
 */

import type { DayOfWeek, Period, Timestamps, WeekPattern } from "./common";

// ============================================================================
// Lesson
// ============================================================================

export interface CreateLessonRequest {
  schoolClassId: string;
  teacherId: string;
  subjectId: string;
  timeslotId: string;
  roomId?: string;
  weekPattern?: WeekPattern;
}

export interface UpdateLessonRequest {
  schoolClassId: string;
  teacherId: string;
  subjectId: string;
  timeslotId: string;
  roomId?: string;
  weekPattern?: WeekPattern;
}

export interface LessonResponse extends Timestamps {
  id: string;
  schoolClassId: string;
  schoolClassName: string;
  teacherId: string;
  teacherName: string;
  subjectId: string;
  subjectName: string;
  timeslotId: string;
  dayOfWeek: DayOfWeek;
  period: Period;
  startTime: string;
  endTime: string;
  roomId: string | null;
  roomName: string | null;
  weekPattern: WeekPattern;
}

export interface LessonSummary {
  id: string;
  schoolClassName: string;
  teacherName: string;
  subjectName: string;
  roomName: string | null;
}
