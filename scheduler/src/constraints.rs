use std::collections::HashMap;

use smallvec::SmallVec;

use crate::planning::{HardSoftScore, PlanningLesson, ProblemFacts};

/// Return a score for a hard-violation magnitude of `amount` (>= 0),
/// routed through the optional softening penalty.
/// `soften = None` → strict hard. `soften = Some(p)` → soft penalty `amount * p`.
#[inline]
fn hard_or_soften(amount: i64, soften: Option<i64>) -> HardSoftScore {
    match soften {
        None => HardSoftScore::hard(-amount),
        Some(p) => HardSoftScore::soft(-amount * p),
    }
}

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
            score += hard_or_soften(1, facts.weights.soften_teacher_availability);
        }

        // 9. Class availability
        if !facts.classes[lesson.class_idx].available_slots[ts] {
            score += hard_or_soften(1, facts.weights.soften_class_availability);
        }

        // 6. Teacher qualification
        if !teacher.qualified_subjects[lesson.subject_idx] {
            score += hard_or_soften(1, facts.weights.soften_teacher_qualification);
        }

        // Count hours for over-capacity check
        *teacher_hours.entry(lesson.teacher_idx).or_insert(0) += 1;

        // Room constraints (only if room assigned)
        if let Some(room_idx) = lesson.room {
            let room = &facts.rooms[room_idx];

            // 7. Room suitability
            if !room.suitable_subjects[lesson.subject_idx] {
                score += hard_or_soften(1, facts.weights.soften_room_suitability);
            }

            // 8. Room capacity
            if let (Some(cap), Some(count)) =
                (room.capacity, facts.classes[lesson.class_idx].student_count)
            {
                if cap < count {
                    score += hard_or_soften(1, facts.weights.soften_room_capacity);
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
            score += HardSoftScore::soft(-facts.weights.w_preferred_slot);
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
            score += hard_or_soften((hours - max) as i64, facts.weights.soften_teacher_max_hours);
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
                    score += HardSoftScore::soft(-gaps * facts.weights.w_teacher_gap);
                }
            }
        }
    }

    // Subject distribution: for each (class, subject, day) with N > 1, penalize (N-1)*-2
    for class_subjects in &class_subject_day {
        for subject_days in class_subjects {
            for &count in subject_days {
                if count > 1 {
                    score += HardSoftScore::soft(
                        -((count - 1) as i64) * facts.weights.w_subject_distribution,
                    );
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
                score += HardSoftScore::soft(-facts.weights.w_class_teacher_first_period);
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
            delta += hard_or_soften(1, facts.weights.soften_teacher_availability);
        }

        // 9. Class availability
        if !facts.classes[lesson.class_idx].available_slots[timeslot] {
            delta += hard_or_soften(1, facts.weights.soften_class_availability);
        }

        if !teacher.qualified_subjects[lesson.subject_idx] {
            delta += hard_or_soften(1, facts.weights.soften_teacher_qualification);
        }

        if let Some(r) = room {
            let room_fact = &facts.rooms[r];
            if !room_fact.suitable_subjects[lesson.subject_idx] {
                delta += hard_or_soften(1, facts.weights.soften_room_suitability);
            }
            if let (Some(cap), Some(count)) = (
                room_fact.capacity,
                facts.classes[lesson.class_idx].student_count,
            ) {
                if cap < count {
                    delta += hard_or_soften(1, facts.weights.soften_room_capacity);
                }
            }
        }

        // Teacher over-capacity
        let old_hours = self.teacher_hours[lesson.teacher_idx];
        if old_hours >= teacher.max_hours {
            delta += hard_or_soften(1, facts.weights.soften_teacher_max_hours);
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
        delta += HardSoftScore::soft((new_gap - old_gap) * facts.weights.w_teacher_gap);

        // Subject distribution delta
        let count = self.class_subject_day[lesson.class_idx][lesson.subject_idx][day];
        if count > 0 {
            delta += HardSoftScore::soft(-facts.weights.w_subject_distribution);
        }

        // Preferred slots
        if !facts.teachers[lesson.teacher_idx].preferred_slots[timeslot] {
            delta += HardSoftScore::soft(-facts.weights.w_preferred_slot);
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
                    delta += HardSoftScore::soft(-facts.weights.w_class_teacher_first_period);
                } else if old_violated && !new_violated {
                    delta += HardSoftScore::soft(facts.weights.w_class_teacher_first_period);
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
            delta += match facts.weights.soften_teacher_availability {
                None => HardSoftScore::hard(1),
                Some(p) => HardSoftScore::soft(p),
            };
        }

        // 9. Class availability
        if !facts.classes[lesson.class_idx].available_slots[timeslot] {
            delta += match facts.weights.soften_class_availability {
                None => HardSoftScore::hard(1),
                Some(p) => HardSoftScore::soft(p),
            };
        }

        if !teacher.qualified_subjects[lesson.subject_idx] {
            delta += match facts.weights.soften_teacher_qualification {
                None => HardSoftScore::hard(1),
                Some(p) => HardSoftScore::soft(p),
            };
        }

        if let Some(r) = room {
            let room_fact = &facts.rooms[r];
            if !room_fact.suitable_subjects[lesson.subject_idx] {
                delta += match facts.weights.soften_room_suitability {
                    None => HardSoftScore::hard(1),
                    Some(p) => HardSoftScore::soft(p),
                };
            }
            if let (Some(cap), Some(count)) = (
                room_fact.capacity,
                facts.classes[lesson.class_idx].student_count,
            ) {
                if cap < count {
                    delta += match facts.weights.soften_room_capacity {
                        None => HardSoftScore::hard(1),
                        Some(p) => HardSoftScore::soft(p),
                    };
                }
            }
        }

        // Teacher over-capacity
        let new_hours = self.teacher_hours[lesson.teacher_idx];
        if new_hours >= teacher.max_hours {
            delta += match facts.weights.soften_teacher_max_hours {
                None => HardSoftScore::hard(1),
                Some(p) => HardSoftScore::soft(p),
            };
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
        delta += HardSoftScore::soft((new_gap - old_gap) * facts.weights.w_teacher_gap);

        // Subject distribution
        let old_count = self.class_subject_day[lesson.class_idx][lesson.subject_idx][day];
        if old_count > 1 {
            delta += HardSoftScore::soft(facts.weights.w_subject_distribution); // removing one duplicate
        }

        // Preferred slots
        if !facts.teachers[lesson.teacher_idx].preferred_slots[timeslot] {
            delta += HardSoftScore::soft(facts.weights.w_preferred_slot); // removing a miss
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
                    delta += HardSoftScore::soft(facts.weights.w_class_teacher_first_period);
                } else if !old_violated && new_violated {
                    delta += HardSoftScore::soft(-facts.weights.w_class_teacher_first_period);
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

use crate::types::{DiagnosedResourceRef, DiagnosedViolation, Severity, ViolationKind};

#[inline]
fn severity_for(soften: Option<i64>) -> Severity {
    if soften.is_some() {
        Severity::Soft
    } else {
        Severity::Hard
    }
}

/// Walk every constraint defined in `full_evaluate` and emit a structured
/// item for each violation. The Hard count must equal `-full_evaluate(...).hard`
/// when no `soften_*` is set; covered by `diagnose_hard_count_matches_full_evaluate`.
pub fn diagnose(lessons: &[PlanningLesson], facts: &ProblemFacts) -> Vec<DiagnosedViolation> {
    use smallvec::smallvec;
    let mut out: Vec<DiagnosedViolation> = Vec::new();

    let assigned: Vec<(usize, &PlanningLesson)> = lessons
        .iter()
        .enumerate()
        .filter(|(_, l)| l.timeslot.is_some())
        .collect();

    // 1 & 2 — pairwise teacher/class conflicts
    for i in 0..assigned.len() {
        for j in (i + 1)..assigned.len() {
            let (ai, a) = assigned[i];
            let (bj, b) = assigned[j];
            if a.timeslot != b.timeslot {
                continue;
            }
            let ts = a.timeslot.unwrap();
            if a.teacher_idx == b.teacher_idx {
                out.push(DiagnosedViolation {
                    kind: ViolationKind::TeacherConflict,
                    severity: Severity::Hard,
                    message: format!("Teacher double-booked at timeslot {}", ts),
                    lesson_indices: smallvec![ai, bj],
                    resources: smallvec![
                        DiagnosedResourceRef::Teacher(a.teacher_idx),
                        DiagnosedResourceRef::Timeslot(ts),
                    ],
                });
            }
            if a.class_idx == b.class_idx {
                out.push(DiagnosedViolation {
                    kind: ViolationKind::ClassConflict,
                    severity: Severity::Hard,
                    message: format!("Class double-booked at timeslot {}", ts),
                    lesson_indices: smallvec![ai, bj],
                    resources: smallvec![
                        DiagnosedResourceRef::Class(a.class_idx),
                        DiagnosedResourceRef::Timeslot(ts),
                    ],
                });
            }
        }
    }

    // 3 — room over-capacity (count-based, mirrors full_evaluate)
    {
        let num_rooms = facts.rooms.len();
        let num_ts = facts.timeslots.len();
        let mut room_at_slot: Vec<Vec<SmallVec<[usize; 4]>>> =
            vec![vec![SmallVec::new(); num_ts]; num_rooms];
        for (idx, l) in &assigned {
            if let (Some(r), Some(ts)) = (l.room, l.timeslot) {
                room_at_slot[r][ts].push(*idx);
            }
        }
        for (room_idx, slots) in room_at_slot.iter().enumerate() {
            for (ts_idx, indices) in slots.iter().enumerate() {
                let cap = facts.rooms[room_idx].max_concurrent_at_slot[ts_idx] as usize;
                if indices.len() > cap {
                    let excess = indices.len() - cap;
                    for _ in 0..excess {
                        out.push(DiagnosedViolation {
                            kind: ViolationKind::RoomCapacity,
                            severity: Severity::Hard,
                            message: format!(
                                "Room over capacity at timeslot {} ({} > {})",
                                ts_idx,
                                indices.len(),
                                cap
                            ),
                            lesson_indices: indices.iter().copied().collect(),
                            resources: smallvec![
                                DiagnosedResourceRef::Room(room_idx),
                                DiagnosedResourceRef::Timeslot(ts_idx),
                            ],
                        });
                    }
                }
            }
        }
    }

    // Day computation (same as full_evaluate)
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

    let num_teachers = facts.teachers.len();
    let num_classes = facts.classes.len();
    let num_subjects = facts.subjects.len();
    let mut teacher_hours: HashMap<usize, u32> = HashMap::new();
    let mut teacher_day_periods: Vec<Vec<Vec<(u8, usize)>>> =
        vec![vec![Vec::new(); num_days]; num_teachers];
    let mut class_subject_day: Vec<Vec<Vec<SmallVec<[usize; 4]>>>> = (0..num_classes)
        .map(|_| {
            (0..num_subjects)
                .map(|_| vec![SmallVec::new(); num_days])
                .collect()
        })
        .collect();
    type FirstPeriodEntry = (bool, bool, SmallVec<[usize; 4]>);
    let mut class_day_first_period: Vec<Vec<FirstPeriodEntry>> =
        vec![vec![(false, false, SmallVec::new()); num_days]; num_classes];

    for (idx, l) in &assigned {
        let ts = l.timeslot.unwrap();
        let teacher = &facts.teachers[l.teacher_idx];
        let timeslot = &facts.timeslots[ts];
        let day = timeslot.day as usize;
        let period = timeslot.period;

        // 4 — teacher availability
        if !teacher.available_slots[ts] {
            out.push(DiagnosedViolation {
                kind: ViolationKind::TeacherUnavailable,
                severity: severity_for(facts.weights.soften_teacher_availability),
                message: format!("Teacher unavailable at timeslot {}", ts),
                lesson_indices: smallvec![*idx],
                resources: smallvec![
                    DiagnosedResourceRef::Teacher(l.teacher_idx),
                    DiagnosedResourceRef::Timeslot(ts),
                ],
            });
        }
        // 9 — class availability
        if !facts.classes[l.class_idx].available_slots[ts] {
            out.push(DiagnosedViolation {
                kind: ViolationKind::ClassUnavailable,
                severity: severity_for(facts.weights.soften_class_availability),
                message: format!("Class unavailable at timeslot {}", ts),
                lesson_indices: smallvec![*idx],
                resources: smallvec![
                    DiagnosedResourceRef::Class(l.class_idx),
                    DiagnosedResourceRef::Timeslot(ts),
                ],
            });
        }
        // 6 — teacher qualification
        if !teacher.qualified_subjects[l.subject_idx] {
            out.push(DiagnosedViolation {
                kind: ViolationKind::TeacherUnqualified,
                severity: severity_for(facts.weights.soften_teacher_qualification),
                message: format!("Teacher not qualified for subject {}", l.subject_idx),
                lesson_indices: smallvec![*idx],
                resources: smallvec![
                    DiagnosedResourceRef::Teacher(l.teacher_idx),
                    DiagnosedResourceRef::Subject(l.subject_idx),
                ],
            });
        }
        *teacher_hours.entry(l.teacher_idx).or_insert(0) += 1;

        if let Some(room_idx) = l.room {
            let room = &facts.rooms[room_idx];
            // 7 — room suitability
            if !room.suitable_subjects[l.subject_idx] {
                out.push(DiagnosedViolation {
                    kind: ViolationKind::RoomUnsuitable,
                    severity: severity_for(facts.weights.soften_room_suitability),
                    message: format!("Room not suitable for subject {}", l.subject_idx),
                    lesson_indices: smallvec![*idx],
                    resources: smallvec![
                        DiagnosedResourceRef::Room(room_idx),
                        DiagnosedResourceRef::Subject(l.subject_idx),
                    ],
                });
            }
            // 8 — room capacity
            if let (Some(cap), Some(count)) =
                (room.capacity, facts.classes[l.class_idx].student_count)
            {
                if cap < count {
                    out.push(DiagnosedViolation {
                        kind: ViolationKind::RoomTooSmall,
                        severity: severity_for(facts.weights.soften_room_capacity),
                        message: format!("Room too small ({} < {})", cap, count),
                        lesson_indices: smallvec![*idx],
                        resources: smallvec![
                            DiagnosedResourceRef::Room(room_idx),
                            DiagnosedResourceRef::Class(l.class_idx),
                        ],
                    });
                }
            }
        }

        // Soft tracking
        teacher_day_periods[l.teacher_idx][day].push((period, *idx));
        class_subject_day[l.class_idx][l.subject_idx][day].push(*idx);

        if !teacher.preferred_slots[ts] {
            // Always soft
            out.push(DiagnosedViolation {
                kind: ViolationKind::NotPreferredSlot,
                severity: Severity::Soft,
                message: "Lesson in non-preferred slot for teacher".to_string(),
                lesson_indices: smallvec![*idx],
                resources: smallvec![
                    DiagnosedResourceRef::Teacher(l.teacher_idx),
                    DiagnosedResourceRef::Timeslot(ts),
                ],
            });
        }

        if period == first_period_per_day[day] {
            let class_teacher = facts.classes[l.class_idx].class_teacher_idx;
            let entry = &mut class_day_first_period[l.class_idx][day];
            entry.1 = true;
            entry.2.push(*idx);
            if class_teacher == Some(l.teacher_idx) {
                entry.0 = true;
            }
        }
    }

    // 5 — teacher over-capacity
    for (&teacher_idx, &hours) in &teacher_hours {
        let max = facts.teachers[teacher_idx].max_hours;
        if hours > max {
            let excess = hours - max;
            for _ in 0..excess {
                out.push(DiagnosedViolation {
                    kind: ViolationKind::TeacherOverCapacity,
                    severity: severity_for(facts.weights.soften_teacher_max_hours),
                    message: format!(
                        "Teacher {} over capacity ({} > {})",
                        teacher_idx, hours, max
                    ),
                    lesson_indices: smallvec![],
                    resources: smallvec![DiagnosedResourceRef::Teacher(teacher_idx)],
                });
            }
        }
    }

    // Soft: teacher gaps — emit one violation per (teacher, day) with gaps>0
    for (t_idx, days) in teacher_day_periods.iter().enumerate() {
        for (d_idx, periods) in days.iter().enumerate() {
            if periods.len() < 2 {
                continue;
            }
            let min_p = periods.iter().map(|(p, _)| *p).min().unwrap() as i64;
            let max_p = periods.iter().map(|(p, _)| *p).max().unwrap() as i64;
            let span = max_p - min_p;
            let gaps = span - (periods.len() as i64 - 1);
            if gaps > 0 {
                out.push(DiagnosedViolation {
                    kind: ViolationKind::TeacherGap,
                    severity: Severity::Soft,
                    message: format!(
                        "Teacher {} has {} idle period(s) on day {}",
                        t_idx, gaps, d_idx
                    ),
                    lesson_indices: periods.iter().map(|(_, i)| *i).collect(),
                    resources: smallvec![DiagnosedResourceRef::Teacher(t_idx)],
                });
            }
        }
    }

    // Soft: subject clustering — emit one per (class, subject, day) with count>1
    for (c_idx, subjects) in class_subject_day.iter().enumerate() {
        for (s_idx, days) in subjects.iter().enumerate() {
            for (d_idx, idxs) in days.iter().enumerate() {
                if idxs.len() > 1 {
                    out.push(DiagnosedViolation {
                        kind: ViolationKind::SubjectClustered,
                        severity: Severity::Soft,
                        message: format!(
                            "Subject {} clustered on day {} for class {}",
                            s_idx, d_idx, c_idx
                        ),
                        lesson_indices: idxs.iter().copied().collect(),
                        resources: smallvec![
                            DiagnosedResourceRef::Class(c_idx),
                            DiagnosedResourceRef::Subject(s_idx),
                        ],
                    });
                }
            }
        }
    }

    // Soft: class teacher first period
    for (c_idx, days) in class_day_first_period.iter().enumerate() {
        if facts.classes[c_idx].class_teacher_idx.is_none() {
            continue;
        }
        for (d_idx, (ct_teaches, has_lesson, idxs)) in days.iter().enumerate() {
            if *has_lesson && !ct_teaches {
                out.push(DiagnosedViolation {
                    kind: ViolationKind::ClassTeacherFirstPeriod,
                    severity: Severity::Soft,
                    message: format!(
                        "Class teacher does not teach first period on day {} for class {}",
                        d_idx, c_idx
                    ),
                    lesson_indices: idxs.iter().copied().collect(),
                    resources: smallvec![DiagnosedResourceRef::Class(c_idx)],
                });
            }
        }
    }

    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::planning::*;
    use crate::types::{DiagnosedResourceRef, DiagnosedViolation, Severity, ViolationKind};
    use bitvec::prelude::*;

    fn count_kind(violations: &[DiagnosedViolation], k: ViolationKind) -> usize {
        violations.iter().filter(|v| v.kind == k).count()
    }

    /// Build a minimal `ProblemFacts` with all constraints trivially satisfied.
    /// `num_ts` timeslots on day 0, periods 0..num_ts.
    fn mini_facts(
        num_ts: usize,
        num_teachers: usize,
        num_classes: usize,
        num_rooms: usize,
        num_subjects: usize,
    ) -> ProblemFacts {
        ProblemFacts {
            timeslots: (0..num_ts)
                .map(|i| Timeslot {
                    day: 0,
                    period: i as u8,
                })
                .collect(),
            teachers: (0..num_teachers)
                .map(|_| TeacherFact {
                    max_hours: 100,
                    available_slots: bitvec![1; num_ts],
                    qualified_subjects: bitvec![1; num_subjects],
                    preferred_slots: bitvec![1; num_ts],
                })
                .collect(),
            classes: (0..num_classes)
                .map(|_| ClassFact {
                    student_count: None,
                    class_teacher_idx: None,
                    available_slots: bitvec![1; num_ts],
                })
                .collect(),
            rooms: (0..num_rooms)
                .map(|_| RoomFact {
                    capacity: None,
                    suitable_subjects: bitvec![1; num_subjects],
                    max_concurrent_at_slot: vec![10; num_ts],
                })
                .collect(),
            subjects: (0..num_subjects)
                .map(|_| SubjectFact {
                    needs_special_room: false,
                })
                .collect(),
            weights: ConstraintWeights::default(),
        }
    }

    fn lesson(
        id: usize,
        teacher_idx: usize,
        class_idx: usize,
        subject_idx: usize,
        timeslot: Option<usize>,
        room: Option<usize>,
    ) -> PlanningLesson {
        PlanningLesson {
            id,
            teacher_idx,
            class_idx,
            subject_idx,
            timeslot,
            room,
        }
    }

    #[test]
    fn diagnose_reports_teacher_conflict() {
        let facts = mini_facts(2, 1, 2, 1, 1);
        let lessons = vec![
            lesson(0, 0, 0, 0, Some(0), Some(0)),
            lesson(1, 0, 1, 0, Some(0), Some(0)),
        ];
        let v = diagnose(&lessons, &facts);
        let tc: Vec<_> = v
            .iter()
            .filter(|x| x.kind == ViolationKind::TeacherConflict)
            .collect();
        assert_eq!(tc.len(), 1);
        assert_eq!(tc[0].severity, Severity::Hard);
        assert!(tc[0].lesson_indices.contains(&0) && tc[0].lesson_indices.contains(&1));
        assert!(tc[0]
            .resources
            .iter()
            .any(|r| matches!(r, DiagnosedResourceRef::Teacher(0))));
        assert!(tc[0]
            .resources
            .iter()
            .any(|r| matches!(r, DiagnosedResourceRef::Timeslot(0))));
    }

    #[test]
    fn diagnose_reports_class_conflict() {
        let facts = mini_facts(2, 2, 1, 1, 1);
        let lessons = vec![
            lesson(0, 0, 0, 0, Some(0), Some(0)),
            lesson(1, 1, 0, 0, Some(0), Some(0)),
        ];
        let v = diagnose(&lessons, &facts);
        let cc: Vec<_> = v
            .iter()
            .filter(|x| x.kind == ViolationKind::ClassConflict)
            .collect();
        assert_eq!(cc.len(), 1);
        assert_eq!(cc[0].severity, Severity::Hard);
        assert!(cc[0].lesson_indices.contains(&0) && cc[0].lesson_indices.contains(&1));
        assert!(cc[0]
            .resources
            .iter()
            .any(|r| matches!(r, DiagnosedResourceRef::Class(0))));
    }

    #[test]
    fn diagnose_reports_room_capacity() {
        let mut facts = mini_facts(2, 3, 3, 1, 1);
        facts.rooms[0].max_concurrent_at_slot = vec![2; 2];
        let lessons = vec![
            lesson(0, 0, 0, 0, Some(0), Some(0)),
            lesson(1, 1, 1, 0, Some(0), Some(0)),
            lesson(2, 2, 2, 0, Some(0), Some(0)),
        ];
        let v = diagnose(&lessons, &facts);
        assert_eq!(count_kind(&v, ViolationKind::RoomCapacity), 1);
        let rc = v
            .iter()
            .find(|x| x.kind == ViolationKind::RoomCapacity)
            .unwrap();
        assert_eq!(rc.severity, Severity::Hard);
        assert!(rc
            .resources
            .iter()
            .any(|r| matches!(r, DiagnosedResourceRef::Room(0))));
        assert!(rc
            .resources
            .iter()
            .any(|r| matches!(r, DiagnosedResourceRef::Timeslot(0))));
    }

    #[test]
    fn diagnose_reports_teacher_unavailable() {
        let mut facts = mini_facts(2, 1, 1, 1, 1);
        facts.teachers[0].available_slots.set(0, false);
        let lessons = vec![lesson(0, 0, 0, 0, Some(0), Some(0))];
        let v = diagnose(&lessons, &facts);
        assert_eq!(count_kind(&v, ViolationKind::TeacherUnavailable), 1);
        let x = v
            .iter()
            .find(|x| x.kind == ViolationKind::TeacherUnavailable)
            .unwrap();
        assert_eq!(x.severity, Severity::Hard);
        assert!(x
            .resources
            .iter()
            .any(|r| matches!(r, DiagnosedResourceRef::Teacher(0))));
        assert!(x
            .resources
            .iter()
            .any(|r| matches!(r, DiagnosedResourceRef::Timeslot(0))));
    }

    #[test]
    fn diagnose_reports_class_unavailable() {
        let mut facts = mini_facts(2, 1, 1, 1, 1);
        facts.classes[0].available_slots.set(0, false);
        let lessons = vec![lesson(0, 0, 0, 0, Some(0), Some(0))];
        let v = diagnose(&lessons, &facts);
        assert_eq!(count_kind(&v, ViolationKind::ClassUnavailable), 1);
        let x = v
            .iter()
            .find(|x| x.kind == ViolationKind::ClassUnavailable)
            .unwrap();
        assert_eq!(x.severity, Severity::Hard);
        assert!(x
            .resources
            .iter()
            .any(|r| matches!(r, DiagnosedResourceRef::Class(0))));
    }

    #[test]
    fn diagnose_reports_teacher_over_capacity() {
        let mut facts = mini_facts(2, 1, 2, 1, 1);
        facts.teachers[0].max_hours = 1;
        // use two distinct classes to avoid class conflict (different timeslots anyway)
        let lessons = vec![
            lesson(0, 0, 0, 0, Some(0), Some(0)),
            lesson(1, 0, 1, 0, Some(1), Some(0)),
        ];
        let v = diagnose(&lessons, &facts);
        assert_eq!(count_kind(&v, ViolationKind::TeacherOverCapacity), 1);
        let x = v
            .iter()
            .find(|x| x.kind == ViolationKind::TeacherOverCapacity)
            .unwrap();
        assert_eq!(x.severity, Severity::Hard);
        assert!(x
            .resources
            .iter()
            .any(|r| matches!(r, DiagnosedResourceRef::Teacher(0))));
    }

    #[test]
    fn diagnose_reports_teacher_unqualified() {
        let mut facts = mini_facts(2, 1, 1, 1, 2);
        facts.teachers[0].qualified_subjects.set(1, false);
        let lessons = vec![lesson(0, 0, 0, 1, Some(0), Some(0))];
        let v = diagnose(&lessons, &facts);
        assert_eq!(count_kind(&v, ViolationKind::TeacherUnqualified), 1);
        let x = v
            .iter()
            .find(|x| x.kind == ViolationKind::TeacherUnqualified)
            .unwrap();
        assert_eq!(x.severity, Severity::Hard);
        assert!(x
            .resources
            .iter()
            .any(|r| matches!(r, DiagnosedResourceRef::Teacher(0))));
        assert!(x
            .resources
            .iter()
            .any(|r| matches!(r, DiagnosedResourceRef::Subject(1))));
    }

    #[test]
    fn diagnose_reports_room_unsuitable() {
        let mut facts = mini_facts(2, 1, 1, 1, 2);
        facts.rooms[0].suitable_subjects.set(1, false);
        let lessons = vec![lesson(0, 0, 0, 1, Some(0), Some(0))];
        let v = diagnose(&lessons, &facts);
        assert_eq!(count_kind(&v, ViolationKind::RoomUnsuitable), 1);
        let x = v
            .iter()
            .find(|x| x.kind == ViolationKind::RoomUnsuitable)
            .unwrap();
        assert_eq!(x.severity, Severity::Hard);
        assert!(x
            .resources
            .iter()
            .any(|r| matches!(r, DiagnosedResourceRef::Room(0))));
        assert!(x
            .resources
            .iter()
            .any(|r| matches!(r, DiagnosedResourceRef::Subject(1))));
    }

    #[test]
    fn diagnose_reports_room_too_small() {
        let mut facts = mini_facts(2, 1, 1, 1, 1);
        facts.rooms[0].capacity = Some(10);
        facts.classes[0].student_count = Some(25);
        let lessons = vec![lesson(0, 0, 0, 0, Some(0), Some(0))];
        let v = diagnose(&lessons, &facts);
        assert_eq!(count_kind(&v, ViolationKind::RoomTooSmall), 1);
        let x = v
            .iter()
            .find(|x| x.kind == ViolationKind::RoomTooSmall)
            .unwrap();
        assert_eq!(x.severity, Severity::Hard);
        assert!(x
            .resources
            .iter()
            .any(|r| matches!(r, DiagnosedResourceRef::Room(0))));
        assert!(x
            .resources
            .iter()
            .any(|r| matches!(r, DiagnosedResourceRef::Class(0))));
    }

    #[test]
    fn diagnose_reports_teacher_gap() {
        // periods 1 and 3 → span 2, 2 lessons, gaps = 2 - 1 = 1
        let facts = mini_facts(5, 1, 2, 1, 2);
        let lessons = vec![
            lesson(0, 0, 0, 0, Some(1), Some(0)),
            lesson(1, 0, 1, 1, Some(3), Some(0)),
        ];
        let v = diagnose(&lessons, &facts);
        assert_eq!(count_kind(&v, ViolationKind::TeacherGap), 1);
        let x = v
            .iter()
            .find(|x| x.kind == ViolationKind::TeacherGap)
            .unwrap();
        assert_eq!(x.severity, Severity::Soft);
        assert!(x
            .resources
            .iter()
            .any(|r| matches!(r, DiagnosedResourceRef::Teacher(0))));
    }

    #[test]
    fn diagnose_reports_subject_clustered() {
        // 2 lessons same class, same subject, same day (different teachers/timeslots to avoid conflicts)
        let facts = mini_facts(3, 2, 1, 1, 1);
        let lessons = vec![
            lesson(0, 0, 0, 0, Some(0), Some(0)),
            lesson(1, 1, 0, 0, Some(1), Some(0)),
        ];
        let v = diagnose(&lessons, &facts);
        assert_eq!(count_kind(&v, ViolationKind::SubjectClustered), 1);
        let x = v
            .iter()
            .find(|x| x.kind == ViolationKind::SubjectClustered)
            .unwrap();
        assert_eq!(x.severity, Severity::Soft);
        assert!(x
            .resources
            .iter()
            .any(|r| matches!(r, DiagnosedResourceRef::Class(0))));
        assert!(x
            .resources
            .iter()
            .any(|r| matches!(r, DiagnosedResourceRef::Subject(0))));
    }

    #[test]
    fn diagnose_reports_not_preferred_slot() {
        let mut facts = mini_facts(2, 1, 1, 1, 1);
        facts.teachers[0].preferred_slots.set(0, false);
        let lessons = vec![lesson(0, 0, 0, 0, Some(0), Some(0))];
        let v = diagnose(&lessons, &facts);
        assert_eq!(count_kind(&v, ViolationKind::NotPreferredSlot), 1);
        let x = v
            .iter()
            .find(|x| x.kind == ViolationKind::NotPreferredSlot)
            .unwrap();
        assert_eq!(x.severity, Severity::Soft);
        assert!(x
            .resources
            .iter()
            .any(|r| matches!(r, DiagnosedResourceRef::Teacher(0))));
        assert!(x
            .resources
            .iter()
            .any(|r| matches!(r, DiagnosedResourceRef::Timeslot(0))));
    }

    #[test]
    fn diagnose_reports_class_teacher_first_period() {
        let mut facts = mini_facts(2, 2, 1, 1, 1);
        facts.classes[0].class_teacher_idx = Some(0);
        // first-period lesson taught by teacher 1 (not the class teacher)
        let lessons = vec![lesson(0, 1, 0, 0, Some(0), Some(0))];
        let v = diagnose(&lessons, &facts);
        assert_eq!(count_kind(&v, ViolationKind::ClassTeacherFirstPeriod), 1);
        let x = v
            .iter()
            .find(|x| x.kind == ViolationKind::ClassTeacherFirstPeriod)
            .unwrap();
        assert_eq!(x.severity, Severity::Soft);
        assert!(x
            .resources
            .iter()
            .any(|r| matches!(r, DiagnosedResourceRef::Class(0))));
    }

    #[test]
    fn diagnose_softening_changes_severity() {
        let mut facts = mini_facts(2, 1, 1, 1, 2);
        facts.teachers[0].qualified_subjects.set(1, false);
        facts.weights.soften_teacher_qualification = Some(1);
        let lessons = vec![lesson(0, 0, 0, 1, Some(0), Some(0))];
        let v = diagnose(&lessons, &facts);
        let x = v
            .iter()
            .find(|x| x.kind == ViolationKind::TeacherUnqualified)
            .unwrap();
        assert_eq!(x.severity, Severity::Soft);
    }

    #[test]
    fn diagnose_hard_count_matches_full_evaluate() {
        // Build an instance with multiple hard violations:
        //  - teacher conflict (teacher 0 at ts 0)
        //  - class conflict (class 0 at ts 1)
        //  - room over-capacity at ts 2 (cap=1, 2 lessons)
        //  - teacher unavailable (teacher 1 at ts 3)
        //  - class unavailable (class 2 at ts 4)
        let mut facts = mini_facts(5, 3, 3, 2, 2);
        // Teacher 1 unavailable at ts 3
        facts.teachers[1].available_slots.set(3, false);
        // Class 2 unavailable at ts 4
        facts.classes[2].available_slots.set(4, false);
        // Room 1 cap=1 everywhere
        facts.rooms[1].max_concurrent_at_slot = vec![1; 5];

        let lessons = vec![
            // Teacher conflict: teacher 0, two diff classes, ts 0
            lesson(0, 0, 0, 0, Some(0), Some(0)),
            lesson(1, 0, 1, 0, Some(0), Some(0)),
            // Class conflict: class 0, two diff teachers, ts 1
            lesson(2, 0, 0, 0, Some(1), Some(0)),
            lesson(3, 1, 0, 0, Some(1), Some(0)),
            // Room over-capacity: room 1, ts 2, two lessons (cap=1)
            lesson(4, 0, 0, 0, Some(2), Some(1)),
            lesson(5, 1, 1, 0, Some(2), Some(1)),
            // Teacher unavailable: teacher 1 at ts 3
            lesson(6, 1, 1, 0, Some(3), Some(0)),
            // Class unavailable: class 2 at ts 4
            lesson(7, 2, 2, 0, Some(4), Some(0)),
        ];

        let score = full_evaluate(&lessons, &facts);
        let v = diagnose(&lessons, &facts);
        let hard_count = v.iter().filter(|x| x.severity == Severity::Hard).count() as i64;
        assert_eq!(
            hard_count, -score.hard,
            "diagnose hard count must match full_evaluate hard magnitude (got {} vs {})",
            hard_count, -score.hard
        );
    }

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
            weights: ConstraintWeights::default(),
        }
    }

    #[test]
    fn zero_weight_disables_gap_penalty() {
        // 3 lessons same teacher, different classes/subjects, periods 0,2,4 on day 0.
        // With default weight this produces a gap penalty of -2 (span=4, count=3, gaps=2).
        // With w_teacher_gap=0 the gap penalty must be zero.
        // Using different classes/subjects to avoid subject_distribution and class conflicts.
        let mut facts = make_facts_with_room_capacity(3, 5);
        // Extend to 3 subjects so each lesson can use a distinct one.
        facts.subjects.push(SubjectFact {
            needs_special_room: true,
        });
        facts.subjects.push(SubjectFact {
            needs_special_room: true,
        });
        for teacher in facts.teachers.iter_mut() {
            teacher.qualified_subjects = bitvec![1; 3];
        }
        for room in facts.rooms.iter_mut() {
            room.suitable_subjects = bitvec![1; 3];
        }
        facts.weights.w_teacher_gap = 0;
        let lessons = vec![
            PlanningLesson {
                id: 0,
                teacher_idx: 0,
                class_idx: 0,
                subject_idx: 0,
                timeslot: Some(0),
                room: Some(0),
            },
            PlanningLesson {
                id: 1,
                teacher_idx: 0,
                class_idx: 1,
                subject_idx: 1,
                timeslot: Some(2),
                room: Some(0),
            },
            PlanningLesson {
                id: 2,
                teacher_idx: 0,
                class_idx: 2,
                subject_idx: 2,
                timeslot: Some(4),
                room: Some(0),
            },
        ];
        // First verify that default weights produce a gap penalty, then check w=0 eliminates it.
        let default_facts = {
            let mut f = make_facts_with_room_capacity(3, 5);
            f.subjects.push(SubjectFact {
                needs_special_room: true,
            });
            f.subjects.push(SubjectFact {
                needs_special_room: true,
            });
            for teacher in f.teachers.iter_mut() {
                teacher.qualified_subjects = bitvec![1; 3];
            }
            for room in f.rooms.iter_mut() {
                room.suitable_subjects = bitvec![1; 3];
            }
            f
        };
        let default_score = full_evaluate(&lessons, &default_facts);
        assert!(
            default_score.soft < 0,
            "default weights should produce a gap penalty, got {}",
            default_score.soft
        );

        let score = full_evaluate(&lessons, &facts);
        assert_eq!(
            score.soft, 0,
            "expected no soft penalty with w_teacher_gap=0, got {}",
            score.soft
        );
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
    fn soften_teacher_max_hours_converts_hard_to_soft() {
        // Teacher max_hours=2, assign 3 lessons → 1 hour over.
        let mut facts = make_facts_with_room_capacity(3, 3);
        facts.teachers[0].max_hours = 2;
        facts.weights.soften_teacher_max_hours = Some(100);
        // 3 lessons of same subject/class on same day → disable subject_distribution penalty
        facts.weights.w_subject_distribution = 0;

        let lessons = vec![
            PlanningLesson {
                id: 0,
                teacher_idx: 0,
                class_idx: 0,
                subject_idx: 0,
                timeslot: Some(0),
                room: Some(0),
            },
            PlanningLesson {
                id: 1,
                teacher_idx: 0,
                class_idx: 0,
                subject_idx: 0,
                timeslot: Some(1),
                room: Some(0),
            },
            PlanningLesson {
                id: 2,
                teacher_idx: 0,
                class_idx: 0,
                subject_idx: 0,
                timeslot: Some(2),
                room: Some(0),
            },
        ];
        let score = full_evaluate(&lessons, &facts);
        assert_eq!(
            score.hard, 0,
            "max_hours should be softened, got hard={}",
            score.hard
        );
        assert_eq!(
            score.soft, -100,
            "expected 1 hour over * penalty 100, got {}",
            score.soft
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
