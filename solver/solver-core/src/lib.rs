//! solver-core — pure Rust solver logic. No Python, no PyO3.

#![deny(missing_docs)]

pub mod error;
pub mod ids;
pub(crate) mod index;
pub mod json;
pub mod solve;
pub mod types;
pub mod validate;

pub use error::Error;
pub use ids::{LessonId, RoomId, SchoolClassId, SubjectId, TeacherId, TimeBlockId};
pub use json::{error_envelope_json, solve_json};
pub use solve::{solve, solve_with_config};
pub use types::{
    ConstraintWeights, Lesson, Placement, Problem, Room, RoomBlockedTime, RoomSubjectSuitability,
    SchoolClass, Solution, SolveConfig, Subject, Teacher, TeacherBlockedTime, TeacherQualification,
    TimeBlock, Violation, ViolationKind,
};
