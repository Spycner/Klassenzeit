use smallvec::SmallVec;
use std::collections::HashMap;
use uuid::Uuid;

#[derive(Debug, Clone, Default)]
pub struct ScheduleInput {
    pub teachers: Vec<Teacher>,
    pub classes: Vec<SchoolClass>,
    pub rooms: Vec<Room>,
    pub subjects: Vec<Subject>,
    pub timeslots: Vec<TimeSlot>,
    pub requirements: Vec<LessonRequirement>,
    pub stundentafeln: Vec<Stundentafel>,
    pub weights: crate::planning::ConstraintWeights,
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
    pub kempe_attempted: u64,
    pub kempe_accepted: u64,
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
    pub available_slots: Vec<TimeSlot>,
    pub grade: Option<u8>,
}

#[derive(Debug, Clone)]
pub struct Room {
    pub id: Uuid,
    pub name: String,
    pub capacity: Option<u32>,
    pub suitable_subjects: Vec<Uuid>,
    pub max_concurrent: u8,
    pub timeslot_capacity_overrides: HashMap<TimeSlot, u8>,
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
pub struct Stundentafel {
    pub grade: u8,
    pub entries: Vec<StundentafelEntry>,
}

#[derive(Debug, Clone)]
pub struct StundentafelEntry {
    pub subject_id: Uuid,
    pub hours_per_week: u32,
    pub teacher_id: Option<Uuid>,
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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Severity {
    Hard,
    Soft,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ViolationKind {
    // Hard / softenable
    TeacherConflict,
    ClassConflict,
    RoomCapacity,
    TeacherUnavailable,
    ClassUnavailable,
    TeacherOverCapacity,
    TeacherUnqualified,
    RoomUnsuitable,
    RoomTooSmall,
    UnplacedLesson,
    NoQualifiedTeacher,
    // Soft
    TeacherGap,
    SubjectClustered,
    NotPreferredSlot,
    ClassTeacherFirstPeriod,
}

impl ViolationKind {
    pub fn as_snake_case(self) -> &'static str {
        match self {
            ViolationKind::TeacherConflict => "teacher_conflict",
            ViolationKind::ClassConflict => "class_conflict",
            ViolationKind::RoomCapacity => "room_capacity",
            ViolationKind::TeacherUnavailable => "teacher_unavailable",
            ViolationKind::ClassUnavailable => "class_unavailable",
            ViolationKind::TeacherOverCapacity => "teacher_over_capacity",
            ViolationKind::TeacherUnqualified => "teacher_unqualified",
            ViolationKind::RoomUnsuitable => "room_unsuitable",
            ViolationKind::RoomTooSmall => "room_too_small",
            ViolationKind::UnplacedLesson => "unplaced_lesson",
            ViolationKind::NoQualifiedTeacher => "no_qualified_teacher",
            ViolationKind::TeacherGap => "teacher_gap",
            ViolationKind::SubjectClustered => "subject_clustered",
            ViolationKind::NotPreferredSlot => "not_preferred_slot",
            ViolationKind::ClassTeacherFirstPeriod => "class_teacher_first_period",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LessonRef {
    pub class_id: Uuid,
    pub subject_id: Uuid,
    pub teacher_id: Uuid,
    pub room_id: Option<Uuid>,
    pub timeslot_id: Uuid,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ResourceRef {
    Teacher(Uuid),
    Class(Uuid),
    Room(Uuid),
    Subject(Uuid),
    Timeslot(Uuid),
}

#[derive(Debug, Clone)]
pub struct Violation {
    pub kind: ViolationKind,
    pub severity: Severity,
    pub message: String,
    pub lesson_refs: SmallVec<[LessonRef; 4]>,
    pub resources: SmallVec<[ResourceRef; 4]>,
}
