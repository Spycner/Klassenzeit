use std::collections::HashMap;

use crate::planning::{HardSoftScore, PlanningLesson, ProblemFacts};

/// Evaluate all hard constraints from scratch. O(n²) for conflict constraints.
/// This is the reference implementation for correctness testing.
pub fn full_evaluate(lessons: &[PlanningLesson], facts: &ProblemFacts) -> HardSoftScore {
    let mut score = HardSoftScore::ZERO;

    // Only consider assigned lessons (timeslot is Some)
    let assigned: Vec<&PlanningLesson> = lessons.iter().filter(|l| l.timeslot.is_some()).collect();

    // Pairwise conflict constraints
    for i in 0..assigned.len() {
        for j in (i + 1)..assigned.len() {
            let a = assigned[i];
            let b = assigned[j];
            let same_ts = a.timeslot == b.timeslot;

            if same_ts {
                // 1. Teacher conflict
                if a.teacher_idx == b.teacher_idx {
                    score += HardSoftScore::hard(-1);
                }

                // 2. Class conflict
                if a.class_idx == b.class_idx {
                    score += HardSoftScore::hard(-1);
                }

                // 3. Room conflict (skip if either room is None)
                if let (Some(ra), Some(rb)) = (a.room, b.room) {
                    if ra == rb {
                        score += HardSoftScore::hard(-1);
                    }
                }
            }
        }
    }

    // Per-lesson constraints
    let mut teacher_hours: HashMap<usize, u32> = HashMap::new();

    for lesson in &assigned {
        let ts = lesson.timeslot.unwrap();
        let teacher = &facts.teachers[lesson.teacher_idx];

        // 4. Teacher availability
        if !teacher.available_slots[ts] {
            score += HardSoftScore::hard(-1);
        }

        // 6. Teacher qualification
        if !teacher.qualified_subjects[lesson.subject_idx] {
            score += HardSoftScore::hard(-1);
        }

        // Count hours for over-capacity check
        *teacher_hours.entry(lesson.teacher_idx).or_insert(0) += 1;

        // Room constraints (only if room assigned)
        if let Some(room_idx) = lesson.room {
            let room = &facts.rooms[room_idx];

            // 7. Room suitability
            if !room.suitable_subjects[lesson.subject_idx] {
                score += HardSoftScore::hard(-1);
            }

            // 8. Room capacity
            if let (Some(cap), Some(count)) =
                (room.capacity, facts.classes[lesson.class_idx].student_count)
            {
                if cap < count {
                    score += HardSoftScore::hard(-1);
                }
            }
        }
    }

    // 5. Teacher over-capacity
    for (&teacher_idx, &hours) in &teacher_hours {
        let max = facts.teachers[teacher_idx].max_hours;
        if hours > max {
            score += HardSoftScore::hard(-((hours - max) as i64));
        }
    }

    score
}

// ---------------------------------------------------------------------------
// Incremental scoring state
// ---------------------------------------------------------------------------

/// Maintains counter matrices so that assign/unassign update the score in O(1)
/// per constraint instead of re-evaluating from scratch.
pub struct IncrementalState {
    teacher_at_slot: Vec<Vec<u16>>,
    class_at_slot: Vec<Vec<u16>>,
    room_at_slot: Vec<Vec<u16>>,
    teacher_hours: Vec<u32>,
    score: HardSoftScore,
}

impl IncrementalState {
    /// Create a zeroed state sized to the given problem.
    pub fn new(facts: &ProblemFacts) -> Self {
        let num_ts = facts.timeslots.len();
        let num_teachers = facts.teachers.len();
        let num_classes = facts.classes.len();
        let num_rooms = facts.rooms.len();

        Self {
            teacher_at_slot: vec![vec![0u16; num_ts]; num_teachers],
            class_at_slot: vec![vec![0u16; num_ts]; num_classes],
            room_at_slot: vec![vec![0u16; num_ts]; num_rooms],
            teacher_hours: vec![0u32; num_teachers],
            score: HardSoftScore::ZERO,
        }
    }

    pub fn score(&self) -> HardSoftScore {
        self.score
    }

    /// Compute the score delta of assigning `lesson` to `timeslot`/`room`
    /// without modifying any state.
    pub fn evaluate_assign(
        &self,
        lesson: &PlanningLesson,
        timeslot: usize,
        room: Option<usize>,
        facts: &ProblemFacts,
    ) -> HardSoftScore {
        let mut delta = HardSoftScore::ZERO;

        // Conflict pairs: each existing occupant at the same slot creates one new pair.
        let k_teacher = self.teacher_at_slot[lesson.teacher_idx][timeslot] as i64;
        delta += HardSoftScore::hard(-k_teacher);

        let k_class = self.class_at_slot[lesson.class_idx][timeslot] as i64;
        delta += HardSoftScore::hard(-k_class);

        if let Some(r) = room {
            let k_room = self.room_at_slot[r][timeslot] as i64;
            delta += HardSoftScore::hard(-k_room);
        }

        // Per-lesson constraints
        let teacher = &facts.teachers[lesson.teacher_idx];

        if !teacher.available_slots[timeslot] {
            delta += HardSoftScore::hard(-1);
        }

        if !teacher.qualified_subjects[lesson.subject_idx] {
            delta += HardSoftScore::hard(-1);
        }

        if let Some(r) = room {
            let room_fact = &facts.rooms[r];
            if !room_fact.suitable_subjects[lesson.subject_idx] {
                delta += HardSoftScore::hard(-1);
            }
            if let (Some(cap), Some(count)) = (
                room_fact.capacity,
                facts.classes[lesson.class_idx].student_count,
            ) {
                if cap < count {
                    delta += HardSoftScore::hard(-1);
                }
            }
        }

        // Teacher over-capacity
        let old_hours = self.teacher_hours[lesson.teacher_idx];
        if old_hours >= teacher.max_hours {
            delta += HardSoftScore::hard(-1);
        }

        delta
    }

    /// Assign a lesson to a timeslot and optional room, updating the score.
    /// The lesson must not already be assigned.
    pub fn assign(
        &mut self,
        lesson: &mut PlanningLesson,
        timeslot: usize,
        room: Option<usize>,
        facts: &ProblemFacts,
    ) {
        debug_assert!(
            lesson.timeslot.is_none(),
            "assign called on already-assigned lesson {}",
            lesson.id
        );

        let delta = self.evaluate_assign(lesson, timeslot, room, facts);

        // Update counters
        self.teacher_at_slot[lesson.teacher_idx][timeslot] += 1;
        self.class_at_slot[lesson.class_idx][timeslot] += 1;
        if let Some(r) = room {
            self.room_at_slot[r][timeslot] += 1;
        }
        self.teacher_hours[lesson.teacher_idx] += 1;

        // Update lesson
        lesson.timeslot = Some(timeslot);
        lesson.room = room;

        self.score += delta;
    }

    /// Unassign a lesson, reversing its score contribution.
    /// The lesson must currently be assigned.
    pub fn unassign(&mut self, lesson: &mut PlanningLesson, facts: &ProblemFacts) {
        let timeslot = lesson
            .timeslot
            .expect("unassign called on unassigned lesson");
        let room = lesson.room;

        // Decrement counters first, then remaining count = pairs removed.
        self.teacher_at_slot[lesson.teacher_idx][timeslot] -= 1;
        self.class_at_slot[lesson.class_idx][timeslot] -= 1;
        if let Some(r) = room {
            self.room_at_slot[r][timeslot] -= 1;
        }
        self.teacher_hours[lesson.teacher_idx] -= 1;

        let mut delta = HardSoftScore::ZERO;

        // Conflict pairs removed
        let k_teacher = self.teacher_at_slot[lesson.teacher_idx][timeslot] as i64;
        delta += HardSoftScore::hard(k_teacher);

        let k_class = self.class_at_slot[lesson.class_idx][timeslot] as i64;
        delta += HardSoftScore::hard(k_class);

        if let Some(r) = room {
            let k_room = self.room_at_slot[r][timeslot] as i64;
            delta += HardSoftScore::hard(k_room);
        }

        // Per-lesson constraints removed
        let teacher = &facts.teachers[lesson.teacher_idx];

        if !teacher.available_slots[timeslot] {
            delta += HardSoftScore::hard(1);
        }

        if !teacher.qualified_subjects[lesson.subject_idx] {
            delta += HardSoftScore::hard(1);
        }

        if let Some(r) = room {
            let room_fact = &facts.rooms[r];
            if !room_fact.suitable_subjects[lesson.subject_idx] {
                delta += HardSoftScore::hard(1);
            }
            if let (Some(cap), Some(count)) = (
                room_fact.capacity,
                facts.classes[lesson.class_idx].student_count,
            ) {
                if cap < count {
                    delta += HardSoftScore::hard(1);
                }
            }
        }

        // Teacher over-capacity
        let new_hours = self.teacher_hours[lesson.teacher_idx];
        if new_hours >= teacher.max_hours {
            delta += HardSoftScore::hard(1);
        }

        // Clear lesson
        lesson.timeslot = None;
        lesson.room = None;

        self.score += delta;
    }
}
