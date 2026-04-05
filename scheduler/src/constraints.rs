use std::collections::HashMap;

use smallvec::SmallVec;

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
            }
        }
    }

    // 3. Room conflict — count-based with per-slot capacity
    {
        let num_rooms = facts.rooms.len();
        let num_ts = facts.timeslots.len();
        let mut room_at_slot = vec![vec![0u16; num_ts]; num_rooms];
        for lesson in &assigned {
            if let (Some(room), Some(ts)) = (lesson.room, lesson.timeslot) {
                room_at_slot[room][ts] += 1;
            }
        }
        for (room_idx, slots) in room_at_slot.iter().enumerate() {
            for (ts_idx, &count) in slots.iter().enumerate() {
                let cap = facts.rooms[room_idx].max_concurrent_at_slot[ts_idx] as u16;
                if count > cap {
                    score += HardSoftScore::hard(-((count - cap) as i64));
                }
            }
        }
    }

    // Compute day info from timeslots
    let num_days = facts
        .timeslots
        .iter()
        .map(|t| t.day as usize + 1)
        .max()
        .unwrap_or(0);
    let mut first_period_per_day = vec![u8::MAX; num_days];
    for ts in &facts.timeslots {
        let d = ts.day as usize;
        if ts.period < first_period_per_day[d] {
            first_period_per_day[d] = ts.period;
        }
    }

    // Per-lesson constraints
    let mut teacher_hours: HashMap<usize, u32> = HashMap::new();

    // Soft constraint accumulators
    // teacher_day_periods[teacher][day] → list of period numbers
    let num_teachers = facts.teachers.len();
    let num_classes = facts.classes.len();
    let num_subjects = facts.subjects.len();
    let mut teacher_day_periods: Vec<Vec<Vec<u8>>> = vec![vec![Vec::new(); num_days]; num_teachers];
    // class_subject_day[class][subject][day] → count
    let mut class_subject_day: Vec<Vec<Vec<u32>>> =
        vec![vec![vec![0u32; num_days]; num_subjects]; num_classes];
    // class_day_first_period_teachers[class][day] → (has_class_teacher, has_any_lesson)
    let mut class_day_first_period: Vec<Vec<(bool, bool)>> =
        vec![vec![(false, false); num_days]; num_classes];

    for lesson in &assigned {
        let ts = lesson.timeslot.unwrap();
        let teacher = &facts.teachers[lesson.teacher_idx];
        let timeslot = &facts.timeslots[ts];
        let day = timeslot.day as usize;
        let period = timeslot.period;

        // 4. Teacher availability
        if !teacher.available_slots[ts] {
            score += HardSoftScore::hard(-1);
        }

        // 9. Class availability
        if !facts.classes[lesson.class_idx].available_slots[ts] {
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

        // --- Soft constraint tracking ---

        // Teacher gap tracking
        teacher_day_periods[lesson.teacher_idx][day].push(period);

        // Subject distribution tracking
        class_subject_day[lesson.class_idx][lesson.subject_idx][day] += 1;

        // Preferred slot penalty (direct)
        if !teacher.preferred_slots[ts] {
            score += HardSoftScore::soft(-1);
        }

        // Class teacher first period tracking
        if period == first_period_per_day[day] {
            let class_teacher = facts.classes[lesson.class_idx].class_teacher_idx;
            let entry = &mut class_day_first_period[lesson.class_idx][day];
            entry.1 = true; // has lesson in first period
            if class_teacher == Some(lesson.teacher_idx) {
                entry.0 = true; // class teacher teaches in first period
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

    // --- Post-loop soft constraint evaluation ---

    // Teacher gaps: for each teacher/day, gaps = (max_period - min_period) - (num_lessons - 1)
    for teacher_periods in &teacher_day_periods {
        for periods in teacher_periods {
            if periods.len() >= 2 {
                let min_p = *periods.iter().min().unwrap() as i64;
                let max_p = *periods.iter().max().unwrap() as i64;
                let span = max_p - min_p;
                let lessons_count = periods.len() as i64;
                let gaps = span - (lessons_count - 1);
                if gaps > 0 {
                    score += HardSoftScore::soft(-gaps);
                }
            }
        }
    }

    // Subject distribution: for each (class, subject, day) with N > 1, penalize (N-1)*-2
    for class_subjects in &class_subject_day {
        for subject_days in class_subjects {
            for &count in subject_days {
                if count > 1 {
                    score += HardSoftScore::soft(-((count - 1) as i64 * 2));
                }
            }
        }
    }

    // Class teacher first period: penalize if first period has lessons but no class teacher
    for (class_idx, class_days) in class_day_first_period.iter().enumerate() {
        let has_class_teacher = facts.classes[class_idx].class_teacher_idx.is_some();
        if !has_class_teacher {
            continue;
        }
        for &(ct_teaches, has_lesson) in class_days {
            if has_lesson && !ct_teaches {
                score += HardSoftScore::soft(-1);
            }
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
    // Hard constraint counters
    teacher_at_slot: Vec<Vec<u16>>,
    class_at_slot: Vec<Vec<u16>>,
    room_at_slot: Vec<Vec<u16>>,
    teacher_hours: Vec<u32>,

    // Soft constraint state
    num_days: usize,
    first_period_per_day: Vec<u8>,
    /// `[teacher][day]` → sorted list of periods taught that day
    teacher_day_periods: Vec<Vec<SmallVec<[u8; 4]>>>,
    /// `[class][subject][day]` → count of lessons
    class_subject_day: Vec<Vec<Vec<u16>>>,
    /// `[class][day][teacher]` → count of lessons at first period by that teacher
    class_day_first_period: Vec<Vec<Vec<u16>>>,

    score: HardSoftScore,
}

impl IncrementalState {
    /// Create a zeroed state sized to the given problem.
    pub fn new(facts: &ProblemFacts) -> Self {
        let num_ts = facts.timeslots.len();
        let num_teachers = facts.teachers.len();
        let num_classes = facts.classes.len();
        let num_rooms = facts.rooms.len();
        let num_subjects = facts.subjects.len();

        let num_days = facts
            .timeslots
            .iter()
            .map(|t| t.day as usize + 1)
            .max()
            .unwrap_or(0);

        let mut first_period_per_day = vec![u8::MAX; num_days];
        for ts in &facts.timeslots {
            let d = ts.day as usize;
            if ts.period < first_period_per_day[d] {
                first_period_per_day[d] = ts.period;
            }
        }

        Self {
            teacher_at_slot: vec![vec![0u16; num_ts]; num_teachers],
            class_at_slot: vec![vec![0u16; num_ts]; num_classes],
            room_at_slot: vec![vec![0u16; num_ts]; num_rooms],
            teacher_hours: vec![0u32; num_teachers],
            num_days,
            first_period_per_day,
            teacher_day_periods: vec![vec![SmallVec::new(); num_days]; num_teachers],
            class_subject_day: vec![vec![vec![0u16; num_days]; num_subjects]; num_classes],
            class_day_first_period: vec![vec![vec![0u16; num_teachers]; num_days]; num_classes],
            score: HardSoftScore::ZERO,
        }
    }

    /// Gap penalty for a sorted list of periods. Returns a non-positive value.
    fn gap_penalty(periods: &[u8]) -> i64 {
        if periods.len() < 2 {
            return 0;
        }
        let span = (*periods.last().unwrap() - *periods.first().unwrap()) as i64;
        let gaps = span - (periods.len() as i64 - 1);
        if gaps > 0 {
            -gaps
        } else {
            0
        }
    }

    /// Is the class teacher first period constraint violated for this class/day?
    fn is_first_period_violated(&self, class_idx: usize, day: usize, ct_idx: usize) -> bool {
        let total: u16 = self.class_day_first_period[class_idx][day].iter().sum();
        total > 0 && self.class_day_first_period[class_idx][day][ct_idx] == 0
    }

    pub fn score(&self) -> HardSoftScore {
        self.score
    }

    /// How many lessons occupy this (room, timeslot) pair right now.
    pub fn room_count_at_slot(&self, room: usize, timeslot: usize) -> u16 {
        self.room_at_slot[room][timeslot]
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
            let k_room = self.room_at_slot[r][timeslot];
            let cap = facts.rooms[r].max_concurrent_at_slot[timeslot] as u16;
            if k_room >= cap {
                delta += HardSoftScore::hard(-1);
            }
        }

        // Per-lesson constraints
        let teacher = &facts.teachers[lesson.teacher_idx];

        if !teacher.available_slots[timeslot] {
            delta += HardSoftScore::hard(-1);
        }

        // 9. Class availability
        if !facts.classes[lesson.class_idx].available_slots[timeslot] {
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

        // ── Soft constraint deltas ──
        let ts_fact = &facts.timeslots[timeslot];
        let day = ts_fact.day as usize;
        let period = ts_fact.period;

        // Teacher gap delta
        let periods = &self.teacher_day_periods[lesson.teacher_idx][day];
        let old_gap = Self::gap_penalty(periods);
        let mut new_periods = periods.clone();
        let pos = new_periods.binary_search(&period).unwrap_or_else(|p| p);
        new_periods.insert(pos, period);
        let new_gap = Self::gap_penalty(&new_periods);
        delta += HardSoftScore::soft(new_gap - old_gap);

        // Subject distribution delta
        let count = self.class_subject_day[lesson.class_idx][lesson.subject_idx][day];
        if count > 0 {
            delta += HardSoftScore::soft(-2);
        }

        // Preferred slots
        if !facts.teachers[lesson.teacher_idx].preferred_slots[timeslot] {
            delta += HardSoftScore::soft(-1);
        }

        // Class teacher first period
        if day < self.num_days && period == self.first_period_per_day[day] {
            if let Some(ct_idx) = facts.classes[lesson.class_idx].class_teacher_idx {
                let old_violated = self.is_first_period_violated(lesson.class_idx, day, ct_idx);
                let total: u16 = self.class_day_first_period[lesson.class_idx][day]
                    .iter()
                    .sum();
                let new_total = total + 1;
                let ct_count = self.class_day_first_period[lesson.class_idx][day][ct_idx];
                let new_ct_count = if lesson.teacher_idx == ct_idx {
                    ct_count + 1
                } else {
                    ct_count
                };
                let new_violated = new_total > 0 && new_ct_count == 0;
                if !old_violated && new_violated {
                    delta += HardSoftScore::soft(-1);
                } else if old_violated && !new_violated {
                    delta += HardSoftScore::soft(1);
                }
            }
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

        // Update hard counters
        self.teacher_at_slot[lesson.teacher_idx][timeslot] += 1;
        self.class_at_slot[lesson.class_idx][timeslot] += 1;
        if let Some(r) = room {
            self.room_at_slot[r][timeslot] += 1;
        }
        self.teacher_hours[lesson.teacher_idx] += 1;

        // Update soft counters
        let ts_fact = &facts.timeslots[timeslot];
        let day = ts_fact.day as usize;
        let period = ts_fact.period;

        // Teacher day periods (insert sorted)
        let periods = &mut self.teacher_day_periods[lesson.teacher_idx][day];
        let pos = periods.binary_search(&period).unwrap_or_else(|p| p);
        periods.insert(pos, period);

        // Class subject day
        self.class_subject_day[lesson.class_idx][lesson.subject_idx][day] += 1;

        // Class day first period
        if day < self.num_days && period == self.first_period_per_day[day] {
            self.class_day_first_period[lesson.class_idx][day][lesson.teacher_idx] += 1;
        }

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
            let k_room = self.room_at_slot[r][timeslot];
            let cap = facts.rooms[r].max_concurrent_at_slot[timeslot] as u16;
            if k_room >= cap {
                delta += HardSoftScore::hard(1);
            }
        }

        // Per-lesson constraints removed
        let teacher = &facts.teachers[lesson.teacher_idx];

        if !teacher.available_slots[timeslot] {
            delta += HardSoftScore::hard(1);
        }

        // 9. Class availability
        if !facts.classes[lesson.class_idx].available_slots[timeslot] {
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

        // ── Soft delta ──
        let ts_fact = &facts.timeslots[timeslot];
        let day = ts_fact.day as usize;
        let period = ts_fact.period;

        // Teacher gap: compute old and new gap penalty
        let periods = &self.teacher_day_periods[lesson.teacher_idx][day];
        let old_gap = Self::gap_penalty(periods);
        let mut new_periods = periods.clone();
        if let Some(pos) = new_periods.iter().position(|&p| p == period) {
            new_periods.remove(pos);
        }
        let new_gap = Self::gap_penalty(&new_periods);
        delta += HardSoftScore::soft(new_gap - old_gap);

        // Subject distribution
        let old_count = self.class_subject_day[lesson.class_idx][lesson.subject_idx][day];
        if old_count > 1 {
            delta += HardSoftScore::soft(2); // removing one duplicate
        }

        // Preferred slots
        if !facts.teachers[lesson.teacher_idx].preferred_slots[timeslot] {
            delta += HardSoftScore::soft(1); // removing a miss
        }

        // Class teacher first period
        if day < self.num_days && period == self.first_period_per_day[day] {
            if let Some(ct_idx) = facts.classes[lesson.class_idx].class_teacher_idx {
                let old_violated = self.is_first_period_violated(lesson.class_idx, day, ct_idx);
                // Simulate removal
                let total: u16 = self.class_day_first_period[lesson.class_idx][day]
                    .iter()
                    .sum();
                let new_total = total - 1;
                let ct_count = self.class_day_first_period[lesson.class_idx][day][ct_idx];
                let new_ct_count = if lesson.teacher_idx == ct_idx {
                    ct_count - 1
                } else {
                    ct_count
                };
                let new_violated = new_total > 0 && new_ct_count == 0;
                if old_violated && !new_violated {
                    delta += HardSoftScore::soft(1);
                } else if !old_violated && new_violated {
                    delta += HardSoftScore::soft(-1);
                }
            }
        }

        // Update soft counters
        self.teacher_day_periods[lesson.teacher_idx][day] = new_periods;
        self.class_subject_day[lesson.class_idx][lesson.subject_idx][day] -= 1;
        if day < self.num_days && period == self.first_period_per_day[day] {
            self.class_day_first_period[lesson.class_idx][day][lesson.teacher_idx] -= 1;
        }

        // Clear lesson
        lesson.timeslot = None;
        lesson.room = None;

        self.score += delta;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::planning::*;
    use bitvec::prelude::*;

    fn make_facts_with_room_capacity(cap: u8, num_timeslots: usize) -> ProblemFacts {
        ProblemFacts {
            timeslots: (0..num_timeslots)
                .map(|i| Timeslot {
                    day: 0,
                    period: i as u8,
                })
                .collect(),
            rooms: vec![RoomFact {
                capacity: None,
                suitable_subjects: bitvec![1; 1],
                max_concurrent_at_slot: vec![cap; num_timeslots],
            }],
            teachers: vec![
                TeacherFact {
                    max_hours: 28,
                    available_slots: bitvec![1; num_timeslots],
                    qualified_subjects: bitvec![1; 1],
                    preferred_slots: bitvec![1; num_timeslots],
                },
                TeacherFact {
                    max_hours: 28,
                    available_slots: bitvec![1; num_timeslots],
                    qualified_subjects: bitvec![1; 1],
                    preferred_slots: bitvec![1; num_timeslots],
                },
                TeacherFact {
                    max_hours: 28,
                    available_slots: bitvec![1; num_timeslots],
                    qualified_subjects: bitvec![1; 1],
                    preferred_slots: bitvec![1; num_timeslots],
                },
            ],
            classes: vec![
                ClassFact {
                    student_count: None,
                    class_teacher_idx: None,
                    available_slots: bitvec![1; num_timeslots],
                },
                ClassFact {
                    student_count: None,
                    class_teacher_idx: None,
                    available_slots: bitvec![1; num_timeslots],
                },
                ClassFact {
                    student_count: None,
                    class_teacher_idx: None,
                    available_slots: bitvec![1; num_timeslots],
                },
            ],
            subjects: vec![SubjectFact {
                needs_special_room: true,
            }],
        }
    }

    #[test]
    fn room_cap_2_allows_two_lessons_same_slot() {
        let facts = make_facts_with_room_capacity(2, 2);
        let lessons = vec![
            PlanningLesson {
                id: 0,
                subject_idx: 0,
                teacher_idx: 0,
                class_idx: 0,
                timeslot: Some(0),
                room: Some(0),
            },
            PlanningLesson {
                id: 1,
                subject_idx: 0,
                teacher_idx: 1,
                class_idx: 1,
                timeslot: Some(0),
                room: Some(0),
            },
        ];
        let score = full_evaluate(&lessons, &facts);
        assert_eq!(
            score.hard, 0,
            "2 lessons in room with cap 2 should have 0 hard violations"
        );
    }

    #[test]
    fn room_cap_2_penalizes_third_lesson() {
        let facts = make_facts_with_room_capacity(2, 2);
        let lessons = vec![
            PlanningLesson {
                id: 0,
                subject_idx: 0,
                teacher_idx: 0,
                class_idx: 0,
                timeslot: Some(0),
                room: Some(0),
            },
            PlanningLesson {
                id: 1,
                subject_idx: 0,
                teacher_idx: 1,
                class_idx: 1,
                timeslot: Some(0),
                room: Some(0),
            },
            PlanningLesson {
                id: 2,
                subject_idx: 0,
                teacher_idx: 2,
                class_idx: 2,
                timeslot: Some(0),
                room: Some(0),
            },
        ];
        let score = full_evaluate(&lessons, &facts);
        assert_eq!(
            score.hard, -1,
            "3 lessons in room with cap 2 should have -1 hard"
        );
    }

    #[test]
    fn room_cap_0_penalizes_any_lesson() {
        let facts = make_facts_with_room_capacity(0, 2);
        let lessons = vec![PlanningLesson {
            id: 0,
            subject_idx: 0,
            teacher_idx: 0,
            class_idx: 0,
            timeslot: Some(0),
            room: Some(0),
        }];
        let score = full_evaluate(&lessons, &facts);
        assert_eq!(
            score.hard, -1,
            "1 lesson in room with cap 0 should have -1 hard"
        );
    }

    #[test]
    fn incremental_matches_bruteforce_with_capacity() {
        let facts = make_facts_with_room_capacity(2, 2);
        let mut lessons = vec![
            PlanningLesson {
                id: 0,
                subject_idx: 0,
                teacher_idx: 0,
                class_idx: 0,
                timeslot: None,
                room: None,
            },
            PlanningLesson {
                id: 1,
                subject_idx: 0,
                teacher_idx: 1,
                class_idx: 1,
                timeslot: None,
                room: None,
            },
            PlanningLesson {
                id: 2,
                subject_idx: 0,
                teacher_idx: 2,
                class_idx: 2,
                timeslot: None,
                room: None,
            },
        ];

        let mut state = IncrementalState::new(&facts);

        // Assign all 3 lessons to slot 0, room 0
        state.assign(&mut lessons[0], 0, Some(0), &facts);
        state.assign(&mut lessons[1], 0, Some(0), &facts);
        state.assign(&mut lessons[2], 0, Some(0), &facts);

        let incremental_score = state.score();
        let brute_score = full_evaluate(&lessons, &facts);
        assert_eq!(
            incremental_score, brute_score,
            "incremental and brute-force must agree"
        );

        // Unassign last lesson — should recover the violation
        state.unassign(&mut lessons[2], &facts);
        let brute_after = full_evaluate(&lessons, &facts);
        assert_eq!(
            state.score(),
            brute_after,
            "after unassign, scores must agree"
        );
    }
}
