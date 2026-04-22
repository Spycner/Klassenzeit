//! solver-core — pure Rust solver logic. No Python, no PyO3.

#![deny(missing_docs)]

pub mod error;
pub mod ids;
pub mod types;

pub use error::Error;
pub use ids::{LessonId, RoomId, SchoolClassId, SubjectId, TeacherId, TimeBlockId};
pub use types::{
    Lesson, Placement, Problem, Room, RoomBlockedTime, RoomSubjectSuitability, SchoolClass,
    Solution, Subject, Teacher, TeacherBlockedTime, TeacherQualification, TimeBlock, Violation,
    ViolationKind,
};

/// Reverse the characters in a string. Legacy stub; removed in sprint step 2 when
/// `solve_json` replaces it as the `solver-py` entrypoint.
pub fn reverse_chars(s: &str) -> String {
    s.chars().rev().collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reverses_hello() {
        assert_eq!(reverse_chars("hello"), "olleh");
    }

    #[test]
    fn reverses_empty() {
        assert_eq!(reverse_chars(""), "");
    }

    #[test]
    fn reverses_unicode() {
        assert_eq!(reverse_chars("äöü"), "üöä");
    }
}
