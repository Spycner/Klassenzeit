export interface SchoolResponse {
  id: string;
  name: string;
  slug: string;
  role: string;
  created_at: string;
}

export interface MemberResponse {
  user_id: string;
  email: string;
  display_name: string;
  role: string;
  is_active: boolean;
  joined_at: string;
}

export interface CurriculumEntryResponse {
  id: string;
  term_id: string;
  school_class_id: string;
  subject_id: string;
  teacher_id: string | null;
  hours_per_week: number;
  created_at: string;
  updated_at: string;
}

export interface SchedulerStatusResponse {
  status: "solving" | "solved" | "failed";
  hard_violations?: number;
  soft_score?: number;
  error?: string;
}

export type Severity = "hard" | "soft";

export type ViolationKind =
  | "teacher_conflict"
  | "class_conflict"
  | "room_capacity"
  | "teacher_unavailable"
  | "class_unavailable"
  | "teacher_over_capacity"
  | "teacher_unqualified"
  | "room_unsuitable"
  | "room_too_small"
  | "unplaced_lesson"
  | "no_qualified_teacher"
  | "teacher_gap"
  | "subject_clustered"
  | "not_preferred_slot"
  | "class_teacher_first_period";

export interface ViolationLessonRef {
  class_id: string;
  subject_id: string;
  teacher_id: string;
  room_id: string | null;
  timeslot_id: string;
}

export type ResourceRefDto =
  | { type: "teacher"; id: string }
  | { type: "class"; id: string }
  | { type: "room"; id: string }
  | { type: "subject"; id: string }
  | { type: "timeslot"; id: string };

export interface ViolationDto {
  kind: ViolationKind;
  severity: Severity;
  message: string;
  lesson_refs: ViolationLessonRef[];
  resources: ResourceRefDto[];
}

export interface SolveResult {
  timetable: SolveLesson[];
  score: { hard_violations: number; soft_score: number };
  violations: ViolationDto[];
}

export interface SolveLesson {
  teacher_id: string;
  class_id: string;
  subject_id: string;
  room_id: string | null;
  timeslot_id: string;
}

export interface SubjectResponse {
  id: string;
  name: string;
  abbreviation: string;
  color: string | null;
  needs_special_room: boolean;
}

export interface TeacherResponse {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  abbreviation: string;
  max_hours_per_week: number;
  is_part_time: boolean;
  is_active: boolean;
}

export interface SchoolClassResponse {
  id: string;
  name: string;
  grade_level: number;
  student_count: number | null;
  class_teacher_id: string | null;
  is_active: boolean;
}

export interface RoomResponse {
  id: string;
  name: string;
  building: string | null;
  capacity: number | null;
  max_concurrent: number;
  is_active: boolean;
}

export interface TimeslotCapacityOverride {
  timeslot_id: string;
  capacity: number;
}

export interface TimeSlotResponse {
  id: string;
  day_of_week: number;
  period: number;
  start_time: string;
  end_time: string;
  is_break: boolean;
  label: string | null;
}

export interface SchoolYearResponse {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
}

export interface TermResponse {
  id: string;
  school_year_id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
}

export interface ConstraintWeightsDto {
  w_preferred_slot: number;
  w_teacher_gap: number;
  w_subject_distribution: number;
  w_class_teacher_first_period: number;
  soften_teacher_availability: number | null;
  soften_teacher_max_hours: number | null;
  soften_teacher_qualification: number | null;
  soften_room_suitability: number | null;
  soften_room_capacity: number | null;
  soften_class_availability: number | null;
}

export interface SchedulerSettingsResponse {
  weights: ConstraintWeightsDto;
}

export const DEFAULT_CONSTRAINT_WEIGHTS: ConstraintWeightsDto = {
  w_preferred_slot: 1,
  w_teacher_gap: 1,
  w_subject_distribution: 2,
  w_class_teacher_first_period: 1,
  soften_teacher_availability: null,
  soften_teacher_max_hours: null,
  soften_teacher_qualification: null,
  soften_room_suitability: null,
  soften_room_capacity: null,
  soften_class_availability: null,
};

export type AvailabilityType = "available" | "blocked" | "preferred";

export interface TeacherAvailabilityEntry {
  day_of_week: number;
  period: number;
  availability_type: AvailabilityType;
  reason?: string | null;
}

export interface RoomSuitabilityEntry {
  subject_id: string;
}

export interface RoomSuitabilityPutBody {
  subject_ids: string[];
}

export interface LessonResponse {
  id: string;
  term_id: string;
  class_id: string;
  teacher_id: string;
  subject_id: string;
  room_id: string | null;
  timeslot_id: string;
  week_pattern: string;
}

export interface ListLessonsResponse {
  lessons: LessonResponse[];
  violations: ViolationDto[];
}

export interface PatchLessonRequest {
  timeslot_id?: string;
  room_id?: string | null;
  teacher_id?: string;
}

export interface PatchLessonResponse {
  lesson: LessonResponse;
  violations: ViolationDto[];
}

export interface SwapLessonsRequest {
  lesson_a_id: string;
  lesson_b_id: string;
}

export interface SwapLessonsResponse {
  lessons: LessonResponse[];
  violations: ViolationDto[];
}

export type TimetableViewMode = "class" | "teacher" | "room";

/**
 * Common shape used by `<TimetableGrid>` so it can render either a
 * SolveLesson (preview) or a LessonResponse (persisted).
 */
export interface TimetableLesson {
  class_id: string;
  teacher_id: string;
  subject_id: string;
  room_id: string | null;
  timeslot_id: string;
}
