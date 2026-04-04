use bitvec::prelude::*;
use klassenzeit_scheduler::constraints::{full_evaluate, IncrementalState};
use klassenzeit_scheduler::planning::*;
use proptest::prelude::*;

/// Generate a random problem with constrained dimensions.
fn arb_problem() -> impl Strategy<Value = (ProblemFacts, Vec<PlanningLesson>)> {
    // Small sizes to keep tests fast
    (1..=5usize, 1..=4usize, 1..=3usize, 0..=2usize, 1..=3usize).prop_flat_map(
        |(num_slots, num_teachers, num_classes, num_rooms, num_subjects)| {
            let facts_strat = (
                proptest::collection::vec(prop::bool::ANY, num_slots * num_teachers), // teacher availability
                proptest::collection::vec(prop::bool::ANY, num_subjects * num_teachers), // teacher quals
                proptest::collection::vec(1..=30u32, num_teachers), // max hours
                proptest::collection::vec(prop::bool::ANY, num_subjects * num_rooms), // room suitability
                proptest::collection::vec(prop::bool::ANY, num_slots * num_teachers), // teacher preferred slots
                proptest::collection::vec(proptest::option::of(0..num_teachers), num_classes), // class teacher idx
            )
                .prop_map(
                    move |(avail_bits, qual_bits, max_hours, suit_bits, pref_bits, ct_idxs)| {
                        let teachers: Vec<TeacherFact> = (0..num_teachers)
                            .map(|t| {
                                let mut available_slots = bitvec![0; num_slots];
                                for s in 0..num_slots {
                                    available_slots.set(s, avail_bits[t * num_slots + s]);
                                }
                                let mut qualified_subjects = bitvec![0; num_subjects];
                                for s in 0..num_subjects {
                                    qualified_subjects.set(s, qual_bits[t * num_subjects + s]);
                                }
                                let mut preferred_slots = bitvec![0; num_slots];
                                for s in 0..num_slots {
                                    preferred_slots.set(s, pref_bits[t * num_slots + s]);
                                }
                                TeacherFact {
                                    max_hours: max_hours[t],
                                    available_slots,
                                    qualified_subjects,
                                    preferred_slots,
                                }
                            })
                            .collect();

                        let rooms: Vec<RoomFact> = (0..num_rooms)
                            .map(|r| {
                                let mut suitable_subjects = bitvec![0; num_subjects];
                                for s in 0..num_subjects {
                                    suitable_subjects.set(s, suit_bits[r * num_subjects + s]);
                                }
                                RoomFact {
                                    capacity: Some(30),
                                    suitable_subjects,
                                }
                            })
                            .collect();

                        ProblemFacts {
                            timeslots: (0..num_slots)
                                .map(|i| Timeslot {
                                    day: (i / 8) as u8,
                                    period: (i % 8) as u8,
                                })
                                .collect(),
                            teachers,
                            classes: (0..num_classes)
                                .enumerate()
                                .map(|(c, _)| ClassFact {
                                    student_count: Some(25),
                                    class_teacher_idx: ct_idxs[c],
                                    available_slots: bitvec![1; num_slots],
                                })
                                .collect(),
                            rooms,
                            subjects: (0..num_subjects)
                                .map(|_| SubjectFact {
                                    needs_special_room: false,
                                })
                                .collect(),
                        }
                    },
                );

            // Generate random lessons
            let num_lessons = 1..(num_slots * num_classes).min(8) + 1;
            (facts_strat, num_lessons).prop_flat_map(move |(facts, n_lessons)| {
                let nt = num_teachers;
                let nc = num_classes;
                let ns = num_subjects;
                proptest::collection::vec((0..nt, 0..nc, 0..ns), n_lessons).prop_map(
                    move |lesson_specs| {
                        let lessons: Vec<PlanningLesson> = lesson_specs
                            .iter()
                            .enumerate()
                            .map(|(id, &(t, c, s))| PlanningLesson {
                                id,
                                teacher_idx: t,
                                class_idx: c,
                                subject_idx: s,
                                timeslot: None,
                                room: None,
                            })
                            .collect();
                        (facts.clone(), lessons)
                    },
                )
            })
        },
    )
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(200))]

    #[test]
    fn incremental_matches_full_on_random_assigns(
        (facts, mut lessons) in arb_problem(),
        slot_assignments in proptest::collection::vec(0..5usize, 1..8),
    ) {
        let num_slots = facts.timeslots.len();
        let mut state = IncrementalState::new(&facts);

        let n = lessons.len();
        for i in 0..n {
            let slot = slot_assignments.get(i).copied().unwrap_or(0) % num_slots;
            state.assign(&mut lessons[i], slot, None, &facts);

            let full_score = full_evaluate(&lessons, &facts);
            prop_assert_eq!(
                state.score(), full_score,
                "Mismatch after assigning lesson {} to slot {}",
                i, slot
            );
        }
    }

    #[test]
    fn incremental_matches_full_after_unassign(
        (facts, mut lessons) in arb_problem(),
        slot_assignments in proptest::collection::vec(0..5usize, 1..8),
    ) {
        let num_slots = facts.timeslots.len();
        let mut state = IncrementalState::new(&facts);

        // Assign all
        let n = lessons.len();
        for i in 0..n {
            let slot = slot_assignments.get(i).copied().unwrap_or(0) % num_slots;
            state.assign(&mut lessons[i], slot, None, &facts);
        }

        // Unassign one by one and verify
        for i in (0..lessons.len()).rev() {
            state.unassign(&mut lessons[i], &facts);
            let full_score = full_evaluate(&lessons, &facts);
            prop_assert_eq!(
                state.score(), full_score,
                "Mismatch after unassigning lesson {}",
                i
            );
        }
    }
}
