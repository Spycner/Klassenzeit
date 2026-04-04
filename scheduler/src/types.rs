use uuid::Uuid;

#[derive(Debug, Clone, Default)]
pub struct ScheduleInput {
    pub teachers: Vec<Teacher>,
    pub classes: Vec<SchoolClass>,
    pub rooms: Vec<Room>,
    pub subjects: Vec<Subject>,
    pub timeslots: Vec<TimeSlot>,
    pub requirements: Vec<LessonRequirement>,
}

#[derive(Debug, Clone, Default)]
pub struct ScheduleOutput {
    pub timetable: Vec<Lesson>,
    pub score: Score,
    pub violations: Vec<Violation>,
    pub stats: Option<SolveStats>,
}

#[derive(Debug, Clone, Default)]
pub struct SolveStats {
    pub construction_ms: u64,
    pub local_search_ms: u64,
    pub iterations: u64,
    pub iterations_per_sec: f64,
    pub moves_accepted: u64,
    pub moves_rejected: u64,
    pub score_history: Vec<(u64, i64, i64)>, // (iteration, hard, soft)
    pub best_found_at_iteration: u64,
}

#[derive(Debug, Clone)]
pub struct Teacher {
    pub id: Uuid,
    pub name: String,
    pub max_hours_per_week: u32,
    pub is_part_time: bool,
    pub available_slots: Vec<TimeSlot>,
    pub qualified_subjects: Vec<Uuid>,
    pub preferred_slots: Vec<TimeSlot>,
}

#[derive(Debug, Clone)]
pub struct SchoolClass {
    pub id: Uuid,
    pub name: String,
    pub grade_level: u8,
    pub student_count: Option<u32>,
    pub class_teacher_id: Option<Uuid>,
}

#[derive(Debug, Clone)]
pub struct Room {
    pub id: Uuid,
    pub name: String,
    pub capacity: Option<u32>,
    pub suitable_subjects: Vec<Uuid>,
}

#[derive(Debug, Clone)]
pub struct Subject {
    pub id: Uuid,
    pub name: String,
    pub needs_special_room: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct TimeSlot {
    pub id: Uuid,
    pub day: u8,
    pub period: u8,
}

#[derive(Debug, Clone)]
pub struct LessonRequirement {
    pub class_id: Uuid,
    pub subject_id: Uuid,
    pub teacher_id: Option<Uuid>,
    pub hours_per_week: u32,
}

#[derive(Debug, Clone)]
pub struct Lesson {
    pub teacher_id: Uuid,
    pub class_id: Uuid,
    pub subject_id: Uuid,
    pub room_id: Option<Uuid>,
    pub timeslot: TimeSlot,
}

#[derive(Debug, Clone, Default)]
pub struct Score {
    pub hard_violations: u32,
    pub soft_score: f64,
}

#[derive(Debug, Clone)]
pub struct Violation {
    pub description: String,
}
