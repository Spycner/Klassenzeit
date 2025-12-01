/**
 * Teacher-related types (Teacher, Qualification, Availability)
 */

import type {
  AvailabilityType,
  DayOfWeek,
  GradeLevel,
  Period,
  QualificationLevel,
  Timestamps,
} from "./common";

// ============================================================================
// Teacher
// ============================================================================

export interface CreateTeacherRequest {
  firstName: string;
  lastName: string;
  email: string;
  abbreviation: string;
  maxHoursPerWeek?: number;
  isPartTime?: boolean;
}

export interface UpdateTeacherRequest {
  firstName: string;
  lastName: string;
  email: string;
  abbreviation: string;
  maxHoursPerWeek?: number;
  isPartTime?: boolean;
}

export interface TeacherResponse extends Timestamps {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  abbreviation: string;
  maxHoursPerWeek: number | null;
  isPartTime: boolean;
  isActive: boolean;
}

export interface TeacherSummary {
  id: string;
  firstName: string;
  lastName: string;
  abbreviation: string;
}

// ============================================================================
// Teacher Qualification
// ============================================================================

export interface CreateQualificationRequest {
  subjectId: string;
  qualificationLevel: QualificationLevel;
  canTeachGrades?: GradeLevel[];
  maxHoursPerWeek?: number;
}

export interface UpdateQualificationRequest {
  subjectId: string;
  qualificationLevel: QualificationLevel;
  canTeachGrades?: GradeLevel[];
  maxHoursPerWeek?: number;
}

export interface QualificationResponse extends Timestamps {
  id: string;
  subjectId: string;
  subjectName: string;
  qualificationLevel: QualificationLevel;
  canTeachGrades: GradeLevel[];
  maxHoursPerWeek: number | null;
}

export interface QualificationSummary {
  id: string;
  subjectId: string;
  subjectName: string;
  qualificationLevel: QualificationLevel;
}

// ============================================================================
// Teacher Availability
// ============================================================================

export interface CreateAvailabilityRequest {
  termId?: string;
  dayOfWeek: DayOfWeek;
  period: Period;
  availabilityType: AvailabilityType;
  reason?: string;
}

export interface UpdateAvailabilityRequest {
  termId?: string;
  dayOfWeek: DayOfWeek;
  period: Period;
  availabilityType: AvailabilityType;
  reason?: string;
}

export interface AvailabilityResponse extends Timestamps {
  id: string;
  termId: string | null;
  termName: string | null;
  dayOfWeek: DayOfWeek;
  period: Period;
  availabilityType: AvailabilityType;
  reason: string | null;
  isGlobal: boolean;
}

export interface AvailabilitySummary {
  id: string;
  dayOfWeek: DayOfWeek;
  period: Period;
  availabilityType: AvailabilityType;
}
