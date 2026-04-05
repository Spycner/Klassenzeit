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

export interface SolveResult {
  timetable: SolveLesson[];
  score: { hard_violations: number; soft_score: number };
  violations: string[];
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
