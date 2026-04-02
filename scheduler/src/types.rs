#[derive(Debug, Clone, Default)]
pub struct ScheduleInput {
    pub teachers: Vec<Teacher>,
    pub classes: Vec<Class>,
    pub rooms: Vec<Room>,
    pub subjects: Vec<Subject>,
    pub constraints: Vec<Constraint>,
}

#[derive(Debug, Clone, Default)]
pub struct ScheduleOutput {
    pub timetable: Vec<Lesson>,
    pub score: Score,
    pub violations: Vec<Violation>,
}

#[derive(Debug, Clone)]
pub struct Teacher {
    pub id: uuid::Uuid,
    pub name: String,
}

#[derive(Debug, Clone)]
pub struct Class {
    pub id: uuid::Uuid,
    pub name: String,
    pub grade_level: u8,
}

#[derive(Debug, Clone)]
pub struct Room {
    pub id: uuid::Uuid,
    pub name: String,
    pub capacity: Option<u32>,
}

#[derive(Debug, Clone)]
pub struct Subject {
    pub id: uuid::Uuid,
    pub name: String,
}

#[derive(Debug, Clone)]
pub struct Constraint {
    pub kind: ConstraintKind,
    pub weight: ConstraintWeight,
}

#[derive(Debug, Clone)]
pub enum ConstraintKind {
    NoTeacherDoubleBooking,
    NoRoomDoubleBooking,
    NoClassDoubleBooking,
}

#[derive(Debug, Clone)]
pub enum ConstraintWeight {
    Hard,
    Soft(f64),
}

#[derive(Debug, Clone)]
pub struct Lesson {
    pub teacher_id: uuid::Uuid,
    pub class_id: uuid::Uuid,
    pub room_id: Option<uuid::Uuid>,
    pub subject_id: uuid::Uuid,
    pub timeslot: TimeSlot,
}

#[derive(Debug, Clone)]
pub struct TimeSlot {
    pub day: u8,
    pub period: u8,
}

#[derive(Debug, Clone, Default)]
pub struct Score {
    pub hard_violations: u32,
    pub soft_score: f64,
}

#[derive(Debug, Clone)]
pub struct Violation {
    pub constraint: ConstraintKind,
    pub description: String,
}
