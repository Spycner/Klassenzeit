use bitvec::prelude::*;
use std::cmp::Ordering;
use std::fmt;
use std::ops::{Add, AddAssign};

// ---------------------------------------------------------------------------
// Score
// ---------------------------------------------------------------------------

/// Lexicographic score: hard violations take absolute priority over soft.
/// Both fields are ≤ 0 (penalties). A perfect score is (0, 0).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct HardSoftScore {
    pub hard: i64,
    pub soft: i64,
}

impl HardSoftScore {
    pub const ZERO: Self = Self { hard: 0, soft: 0 };

    pub fn hard(penalty: i64) -> Self {
        Self {
            hard: penalty,
            soft: 0,
        }
    }

    pub fn soft(penalty: i64) -> Self {
        Self {
            hard: 0,
            soft: penalty,
        }
    }

    pub fn is_feasible(&self) -> bool {
        self.hard == 0
    }
}

impl Ord for HardSoftScore {
    fn cmp(&self, other: &Self) -> Ordering {
        self.hard.cmp(&other.hard).then(self.soft.cmp(&other.soft))
    }
}

impl PartialOrd for HardSoftScore {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Add for HardSoftScore {
    type Output = Self;
    fn add(self, rhs: Self) -> Self {
        Self {
            hard: self.hard + rhs.hard,
            soft: self.soft + rhs.soft,
        }
    }
}

impl AddAssign for HardSoftScore {
    fn add_assign(&mut self, rhs: Self) {
        self.hard += rhs.hard;
        self.soft += rhs.soft;
    }
}

impl fmt::Display for HardSoftScore {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}hard/{}soft", self.hard, self.soft)
    }
}

// ---------------------------------------------------------------------------
// Constraint weights
// ---------------------------------------------------------------------------

/// Per-school tunable weights for soft constraints and optional softening of
/// business-rule hard constraints.
///
/// Soft weight of `0` disables the corresponding soft constraint.
/// A `Some(p)` in a `soften_*` field converts the corresponding hard
/// constraint into a soft penalty of `p`; `None` keeps it strict.
/// Structural conflict constraints (teacher/class/room pairwise) are never
/// softened.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConstraintWeights {
    pub w_preferred_slot: i64,
    pub w_teacher_gap: i64,
    pub w_subject_distribution: i64,
    pub w_class_teacher_first_period: i64,

    pub soften_teacher_availability: Option<i64>,
    pub soften_teacher_max_hours: Option<i64>,
    pub soften_teacher_qualification: Option<i64>,
    pub soften_room_suitability: Option<i64>,
    pub soften_room_capacity: Option<i64>,
    pub soften_class_availability: Option<i64>,
}

impl Default for ConstraintWeights {
    fn default() -> Self {
        Self {
            w_preferred_slot: 1,
            w_teacher_gap: 1,
            w_subject_distribution: 2,
            w_class_teacher_first_period: 1,
            soften_teacher_availability: None,
            soften_teacher_max_hours: None,
            soften_teacher_qualification: None,
            soften_room_suitability: None,
            soften_room_capacity: None,
            soften_class_availability: None,
        }
    }
}

// ---------------------------------------------------------------------------
// Problem facts (immutable during solving)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct ProblemFacts {
    pub timeslots: Vec<Timeslot>,
    pub rooms: Vec<RoomFact>,
    pub teachers: Vec<TeacherFact>,
    pub classes: Vec<ClassFact>,
    pub subjects: Vec<SubjectFact>,
    pub weights: ConstraintWeights,
}

#[derive(Debug, Clone)]
pub struct Timeslot {
    pub day: u8,
    pub period: u8,
}

#[derive(Debug, Clone)]
pub struct RoomFact {
    pub capacity: Option<u32>,
    /// Bit i is set if this room is suitable for subject i.
    pub suitable_subjects: BitVec,
    /// Dense array indexed by timeslot index giving max concurrent classes allowed.
    pub max_concurrent_at_slot: Vec<u8>,
}

#[derive(Debug, Clone)]
pub struct TeacherFact {
    pub max_hours: u32,
    /// Bit i is set if teacher is available in timeslot i.
    pub available_slots: BitVec,
    /// Bit i is set if teacher is qualified for subject i.
    pub qualified_subjects: BitVec,
    /// Bit i is set if teacher prefers timeslot i.
    pub preferred_slots: BitVec,
}

#[derive(Debug, Clone)]
pub struct ClassFact {
    pub student_count: Option<u32>,
    pub class_teacher_idx: Option<usize>,
    pub available_slots: BitVec,
}

#[derive(Debug, Clone)]
pub struct SubjectFact {
    pub needs_special_room: bool,
}

// ---------------------------------------------------------------------------
// Planning entity
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct PlanningLesson {
    pub id: usize,
    pub subject_idx: usize,
    pub teacher_idx: usize,
    pub class_idx: usize,
    pub timeslot: Option<usize>,
    pub room: Option<usize>,
}

// ---------------------------------------------------------------------------
// Solution container
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct PlanningSolution {
    pub lessons: Vec<PlanningLesson>,
    pub facts: ProblemFacts,
    pub score: HardSoftScore,
}
