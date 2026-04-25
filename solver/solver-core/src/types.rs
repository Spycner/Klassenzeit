//! Public data types for `solver-core`. Field names match the backend's SQL
//! join-table columns; wire format is JSON with snake_case fields.

use serde::{Deserialize, Serialize};

use crate::ids::{LessonId, RoomId, SchoolClassId, SubjectId, TeacherId, TimeBlockId};

/// Complete solver input. Flat `Vec`s of relation pairs mirror the backend's SQL
/// join tables so serialisation is a 1:1 shape match with the API payload.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Problem {
    /// Available time blocks (slots) to place lessons into.
    pub time_blocks: Vec<TimeBlock>,
    /// Teachers eligible to teach lessons.
    pub teachers: Vec<Teacher>,
    /// Rooms available for placements.
    pub rooms: Vec<Room>,
    /// Subjects lessons can belong to.
    pub subjects: Vec<Subject>,
    /// School classes that receive lessons.
    pub school_classes: Vec<SchoolClass>,
    /// Lessons to place.
    pub lessons: Vec<Lesson>,
    /// Teacher / subject qualification pairs.
    pub teacher_qualifications: Vec<TeacherQualification>,
    /// Teacher / time-block pairs that mark a teacher as unavailable in that slot.
    pub teacher_blocked_times: Vec<TeacherBlockedTime>,
    /// Room / time-block pairs that mark a room as unavailable in that slot.
    pub room_blocked_times: Vec<RoomBlockedTime>,
    /// Room / subject pairs that explicitly mark a room as suitable for a subject.
    pub room_subject_suitabilities: Vec<RoomSubjectSuitability>,
}

/// A single time slot (e.g., a period on a given weekday).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TimeBlock {
    /// Stable identifier for this time block.
    pub id: TimeBlockId,
    /// Day of the week (0 = Monday, caller-defined).
    pub day_of_week: u8,
    /// Ordinal position within the day.
    pub position: u8,
}

/// A teacher available to teach lessons.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Teacher {
    /// Stable identifier for this teacher.
    pub id: TeacherId,
    /// Maximum teaching hours the teacher can be scheduled for per week.
    pub max_hours_per_week: u8,
}

/// A room available for placements.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Room {
    /// Stable identifier for this room.
    pub id: RoomId,
}

/// A subject (the thing being taught in a lesson).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Subject {
    /// Stable identifier for this subject.
    pub id: SubjectId,
}

/// A school class that receives lessons.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SchoolClass {
    /// Stable identifier for this school class.
    pub id: SchoolClassId,
}

/// A lesson that must be placed `hours_per_week` times.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Lesson {
    /// Stable identifier for this lesson.
    pub id: LessonId,
    /// Receiving school class.
    pub school_class_id: SchoolClassId,
    /// Subject taught in this lesson.
    pub subject_id: SubjectId,
    /// Teacher assigned to this lesson.
    pub teacher_id: TeacherId,
    /// Number of hours of this lesson to place per week.
    pub hours_per_week: u8,
}

/// A single (teacher, subject) qualification pair.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TeacherQualification {
    /// Qualified teacher.
    pub teacher_id: TeacherId,
    /// Subject the teacher is qualified for.
    pub subject_id: SubjectId,
}

/// Marks a teacher as unavailable in a specific time block.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TeacherBlockedTime {
    /// Teacher that is blocked.
    pub teacher_id: TeacherId,
    /// Time block in which the teacher is blocked.
    pub time_block_id: TimeBlockId,
}

/// Marks a room as unavailable in a specific time block.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RoomBlockedTime {
    /// Room that is blocked.
    pub room_id: RoomId,
    /// Time block in which the room is blocked.
    pub time_block_id: TimeBlockId,
}

/// Explicitly marks a room as suitable for a subject. A room with no entries
/// suits every subject; a room with entries suits only the listed subjects.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RoomSubjectSuitability {
    /// Room in question.
    pub room_id: RoomId,
    /// Subject the room is marked suitable for.
    pub subject_id: SubjectId,
}

/// Result of a solver run.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Solution {
    /// Successful placements, one per `(lesson, hour)`.
    pub placements: Vec<Placement>,
    /// Violations recorded during solving (e.g., unplaced hours, no qualified teacher).
    pub violations: Vec<Violation>,
}

/// A single successful placement of one hour of one lesson.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Placement {
    /// Lesson whose hour has been placed.
    pub lesson_id: LessonId,
    /// Time block the lesson was placed into.
    pub time_block_id: TimeBlockId,
    /// Room the lesson was placed into.
    pub room_id: RoomId,
}

/// A single hard-constraint violation recorded by the solver.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Violation {
    /// Kind of violation.
    pub kind: ViolationKind,
    /// Lesson the violation is about.
    pub lesson_id: LessonId,
    /// Zero-based hour index within the lesson.
    pub hour_index: u8,
}

/// Discriminator for `Violation`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ViolationKind {
    /// The lesson's assigned teacher lacks the subject qualification.
    NoQualifiedTeacher,
    /// Placing this hour would push the teacher past `max_hours_per_week`.
    TeacherOverCapacity,
    /// No time block has both the (teacher, class) pair free.
    NoFreeTimeBlock,
    /// No room is suitable for the subject and free in any free time block.
    NoSuitableRoom,
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    fn lesson_id() -> LessonId {
        LessonId(Uuid::parse_str("11111111-1111-1111-1111-111111111111").unwrap())
    }

    #[test]
    fn problem_round_trips_through_json() {
        let original = Problem {
            time_blocks: vec![],
            teachers: vec![],
            rooms: vec![],
            subjects: vec![],
            school_classes: vec![],
            lessons: vec![],
            teacher_qualifications: vec![],
            teacher_blocked_times: vec![],
            room_blocked_times: vec![],
            room_subject_suitabilities: vec![],
        };
        let json = serde_json::to_string(&original).unwrap();
        let parsed: Problem = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, original);
    }

    #[test]
    fn violation_kind_serialises_in_snake_case() {
        assert_eq!(
            serde_json::to_string(&ViolationKind::NoQualifiedTeacher).unwrap(),
            "\"no_qualified_teacher\""
        );
        assert_eq!(
            serde_json::to_string(&ViolationKind::TeacherOverCapacity).unwrap(),
            "\"teacher_over_capacity\""
        );
        assert_eq!(
            serde_json::to_string(&ViolationKind::NoFreeTimeBlock).unwrap(),
            "\"no_free_time_block\""
        );
        assert_eq!(
            serde_json::to_string(&ViolationKind::NoSuitableRoom).unwrap(),
            "\"no_suitable_room\""
        );
    }

    #[test]
    fn lesson_rejects_unknown_preferred_block_size_field() {
        let json = format!(
            r#"{{"id":"{}","school_class_id":"{}","subject_id":"{}","teacher_id":"{}","hours_per_week":1,"preferred_block_size":2}}"#,
            Uuid::nil(),
            Uuid::nil(),
            Uuid::nil(),
            Uuid::nil()
        );
        let err = serde_json::from_str::<Lesson>(&json).unwrap_err();
        assert!(
            err.to_string().contains("preferred_block_size"),
            "error should name the unknown field: {err}"
        );
    }

    #[test]
    fn solution_round_trips_with_placements_and_violations() {
        let solution = Solution {
            placements: vec![Placement {
                lesson_id: lesson_id(),
                time_block_id: TimeBlockId(Uuid::nil()),
                room_id: RoomId(Uuid::nil()),
            }],
            violations: vec![Violation {
                kind: ViolationKind::TeacherOverCapacity,
                lesson_id: lesson_id(),
                hour_index: 0,
            }],
        };
        let json = serde_json::to_string(&solution).unwrap();
        let parsed: Solution = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, solution);
    }
}
