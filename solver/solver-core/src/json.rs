//! JSON string adapter over `solve`. Consumed by `solver-py` in step 2 of the
//! sprint. Input errors are wrapped in a tagged envelope; success emits the
//! `Solution` JSON directly.

use serde::Serialize;

use crate::error::Error;
use crate::solve::solve;
use crate::types::Problem;

/// Solve a timetable problem supplied as a JSON string and return the resulting
/// `Solution` serialised as JSON. Malformed input JSON and serialisation
/// failures are mapped to [`Error::Input`] so callers can distinguish client
/// mistakes from solver-internal issues.
pub fn solve_json(json: &str) -> Result<String, Error> {
    let problem: Problem =
        serde_json::from_str(json).map_err(|e| Error::Input(format!("json: {e}")))?;
    let solution = solve(&problem)?;
    serde_json::to_string(&solution).map_err(|e| Error::Input(format!("serialize: {e}")))
}

/// Tagged JSON envelope that step 2's `solver-py` wrapper emits to Python so the
/// FastAPI layer can branch on a single field instead of parsing error strings.
#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ErrorEnvelope<'a> {
    /// Wraps an [`Error::Input`] with its stringified reason.
    Input {
        /// Human-readable description of the input failure.
        reason: &'a str,
    },
}

impl<'a> From<&'a Error> for ErrorEnvelope<'a> {
    fn from(e: &'a Error) -> Self {
        match e {
            Error::Input(msg) => ErrorEnvelope::Input {
                reason: msg.as_str(),
            },
        }
    }
}

/// Serialise a [`Error`] into the tagged JSON envelope consumed by `solver-py`.
/// Falls back to a hand-rolled literal if `serde_json` cannot serialise the
/// envelope (should not happen with the current variants).
pub fn error_envelope_json(e: &Error) -> String {
    serde_json::to_string(&ErrorEnvelope::from(e))
        .unwrap_or_else(|_| "{\"kind\":\"input\",\"reason\":\"serialize failed\"}".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ids::{LessonId, RoomId, SchoolClassId, SubjectId, TeacherId, TimeBlockId};
    use crate::types::{
        Lesson, Problem, Room, SchoolClass, Subject, Teacher, TeacherQualification, TimeBlock,
    };
    use uuid::Uuid;

    fn json_uuid(n: u8) -> Uuid {
        Uuid::from_bytes([n; 16])
    }

    fn minimal_json() -> String {
        let p = Problem {
            time_blocks: vec![TimeBlock {
                id: TimeBlockId(json_uuid(10)),
                day_of_week: 0,
                position: 0,
            }],
            teachers: vec![Teacher {
                id: TeacherId(json_uuid(20)),
                max_hours_per_week: 5,
            }],
            rooms: vec![Room {
                id: RoomId(json_uuid(30)),
            }],
            subjects: vec![Subject {
                id: SubjectId(json_uuid(40)),
            }],
            school_classes: vec![SchoolClass {
                id: SchoolClassId(json_uuid(50)),
            }],
            lessons: vec![Lesson {
                id: LessonId(json_uuid(60)),
                school_class_id: SchoolClassId(json_uuid(50)),
                subject_id: SubjectId(json_uuid(40)),
                teacher_id: TeacherId(json_uuid(20)),
                hours_per_week: 1,
            }],
            teacher_qualifications: vec![TeacherQualification {
                teacher_id: TeacherId(json_uuid(20)),
                subject_id: SubjectId(json_uuid(40)),
            }],
            teacher_blocked_times: vec![],
            room_blocked_times: vec![],
            room_subject_suitabilities: vec![],
        };
        serde_json::to_string(&p).unwrap()
    }

    #[test]
    fn solve_json_round_trips_minimal_problem() {
        let out = solve_json(&minimal_json()).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&out).unwrap();
        assert_eq!(parsed["placements"].as_array().unwrap().len(), 1);
        assert_eq!(parsed["violations"].as_array().unwrap().len(), 0);
    }

    #[test]
    fn solve_json_returns_input_error_for_malformed_json() {
        let err = solve_json("not json").unwrap_err();
        assert!(matches!(err, Error::Input(msg) if msg.contains("json:")));
    }

    #[test]
    fn error_envelope_tags_input_variant() {
        let env = error_envelope_json(&Error::Input("no time_blocks".into()));
        let parsed: serde_json::Value = serde_json::from_str(&env).unwrap();
        assert_eq!(parsed["kind"], "input");
        assert_eq!(parsed["reason"], "no time_blocks");
    }
}
