/**
 * Resource types (Subject, Room, SchoolClass, TimeSlot)
 */

import type { DayOfWeek, GradeLevel, Period, Timestamps } from "./common";

// ============================================================================
// Subject
// ============================================================================

export interface CreateSubjectRequest {
  name: string;
  abbreviation: string;
  color?: string;
  needsSpecialRoom?: boolean;
}

export interface UpdateSubjectRequest {
  name: string;
  abbreviation: string;
  color?: string;
  needsSpecialRoom?: boolean;
  version?: number;
}

export interface SubjectResponse extends Timestamps {
  id: string;
  name: string;
  abbreviation: string;
  color: string | null;
  needsSpecialRoom: boolean;
  isActive: boolean;
  version?: number;
}

export interface SubjectSummary {
  id: string;
  name: string;
  abbreviation: string;
  color?: string;
  needsSpecialRoom: boolean;
}

// ============================================================================
// Room-Subject Suitability (from Subject perspective)
// ============================================================================

export interface SubjectRoomSummary {
  suitabilityId: string;
  roomId: string;
  roomName: string;
  building: string | null;
}

export interface AddRoomToSubjectRequest {
  roomId: string;
  notes?: string;
}

// ============================================================================
// Room-Subject Suitability (from Room perspective)
// ============================================================================

export interface CreateRoomSubjectSuitabilityRequest {
  subjectId: string;
  notes?: string;
}

export interface RoomSubjectSuitabilitySummary {
  id: string;
  subjectId: string;
  subjectName: string;
  subjectColor: string | null;
}

// ============================================================================
// Room
// ============================================================================

export interface CreateRoomRequest {
  name: string;
  building?: string;
  capacity?: number;
  features?: string;
}

export interface UpdateRoomRequest {
  name: string;
  building?: string;
  capacity?: number;
  features?: string;
}

export interface RoomResponse extends Timestamps {
  id: string;
  name: string;
  building: string | null;
  capacity: number;
  features: string | null;
  isActive: boolean;
}

export interface RoomSummary {
  id: string;
  name: string;
  building: string | null;
  capacity: number;
  isActive: boolean;
}

// ============================================================================
// School Class
// ============================================================================

export interface CreateSchoolClassRequest {
  name: string;
  gradeLevel: GradeLevel;
  studentCount?: number;
  classTeacherId?: string;
}

export interface UpdateSchoolClassRequest {
  name: string;
  gradeLevel: GradeLevel;
  studentCount?: number;
  classTeacherId?: string;
}

export interface SchoolClassResponse extends Timestamps {
  id: string;
  name: string;
  gradeLevel: GradeLevel;
  studentCount: number | null;
  classTeacherId: string | null;
  classTeacherName: string | null;
  isActive: boolean;
}

export interface SchoolClassSummary {
  id: string;
  name: string;
  gradeLevel: GradeLevel;
}

// ============================================================================
// Time Slot
// ============================================================================

export interface CreateTimeSlotRequest {
  dayOfWeek: DayOfWeek;
  period: Period;
  startTime: string; // ISO time format HH:mm:ss or HH:mm
  endTime: string;
  isBreak?: boolean;
  label?: string;
}

export interface UpdateTimeSlotRequest {
  dayOfWeek: DayOfWeek;
  period: Period;
  startTime: string;
  endTime: string;
  isBreak?: boolean;
  label?: string;
}

export interface TimeSlotResponse extends Timestamps {
  id: string;
  dayOfWeek: DayOfWeek;
  period: Period;
  startTime: string;
  endTime: string;
  isBreak: boolean;
  label: string | null;
}

export interface TimeSlotSummary {
  id: string;
  dayOfWeek: DayOfWeek;
  period: Period;
  startTime: string;
  endTime: string;
}
