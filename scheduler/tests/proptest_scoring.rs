use bitvec::prelude::*;
use klassenzeit_scheduler::constraints::{full_evaluate, IncrementalState};
use klassenzeit_scheduler::local_search::{build_kempe_chain, execute_kempe_chain};
use klassenzeit_scheduler::planning::*;
use proptest::prelude::*;
use rand::rngs::SmallRng;
use rand::SeedableRng;

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
                proptest::collection::vec(prop::bool::ANY, num_slots * num_classes), // class availability
                proptest::collection::vec(
                    proptest::collection::vec(0u8..=3u8, num_slots),
                    num_rooms,
                ), // room capacities per slot
            )
                .prop_map(
                    move |(
                        avail_bits,
                        qual_bits,
                        max_hours,
                        suit_bits,
                        pref_bits,
                        ct_idxs,
                        class_avail_bits,
                        room_capacities,
                    )| {
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
                                    max_concurrent_at_slot: room_capacities[r].clone(),
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
                                .map(|(c, _)| {
                                    let mut available_slots = bitvec![0; num_slots];
                                    for s in 0..num_slots {
                                        available_slots.set(s, class_avail_bits[c * num_slots + s]);
                                    }
                                    ClassFact {
                                        student_count: Some(25),
                                        class_teacher_idx: ct_idxs[c],
                                        available_slots,
                                    }
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
        slot_assignments in proptest::collection::vec(0..5usize, 1..16),
        room_choices in proptest::collection::vec(0..5usize, 1..16),
    ) {
        let num_slots = facts.timeslots.len();
        let num_rooms = facts.rooms.len();
        let mut state = IncrementalState::new(&facts);

        let n = lessons.len();
        for i in 0..n {
            let slot = slot_assignments.get(i).copied().unwrap_or(0) % num_slots;
            let room = if num_rooms > 0 {
                let r = room_choices.get(i).copied().unwrap_or(0);
                // Use None ~20% of the time to exercise both paths
                if r % 5 == 0 { None } else { Some(r % num_rooms) }
            } else {
                None
            };
            state.assign(&mut lessons[i], slot, room, &facts);

            let full_score = full_evaluate(&lessons, &facts);
            prop_assert_eq!(
                state.score(), full_score,
                "Mismatch after assigning lesson {} to slot {} room {:?}",
                i, slot, room
            );
        }
    }

    #[test]
    fn incremental_matches_full_after_unassign(
        (facts, mut lessons) in arb_problem(),
        slot_assignments in proptest::collection::vec(0..5usize, 1..16),
        room_choices in proptest::collection::vec(0..5usize, 1..16),
    ) {
        let num_slots = facts.timeslots.len();
        let num_rooms = facts.rooms.len();
        let mut state = IncrementalState::new(&facts);

        // Assign all
        let n = lessons.len();
        for i in 0..n {
            let slot = slot_assignments.get(i).copied().unwrap_or(0) % num_slots;
            let room = if num_rooms > 0 {
                let r = room_choices.get(i).copied().unwrap_or(0);
                if r % 5 == 0 { None } else { Some(r % num_rooms) }
            } else {
                None
            };
            state.assign(&mut lessons[i], slot, room, &facts);
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

    #[test]
    fn kempe_chain_score_matches_full_eval(
        (facts, mut lessons) in arb_problem(),
        slot_assignments in proptest::collection::vec(0..5usize, 1..16),
        room_choices in proptest::collection::vec(0..5usize, 1..16),
        seed_pos in 0..8usize,
        target_slot in 0..5usize,
        rng_seed in 0..1000u64,
    ) {
        let num_slots = facts.timeslots.len();
        let num_rooms = facts.rooms.len();
        if num_slots < 2 { return Ok(()); }

        let mut state = IncrementalState::new(&facts);

        let n = lessons.len();
        for i in 0..n {
            let slot = slot_assignments.get(i).copied().unwrap_or(0) % num_slots;
            let room = if num_rooms > 0 {
                let r = room_choices.get(i).copied().unwrap_or(0);
                if r % 5 == 0 { None } else { Some(r % num_rooms) }
            } else {
                None
            };
            state.assign(&mut lessons[i], slot, room, &facts);
        }

        let assigned: Vec<usize> = lessons.iter().enumerate()
            .filter(|(_, l)| l.timeslot.is_some())
            .map(|(i, _)| i)
            .collect();
        if assigned.is_empty() { return Ok(()); }
        let seed_idx = assigned[seed_pos % assigned.len()];
        let ts_a = lessons[seed_idx].timeslot.unwrap();
        let ts_b = target_slot % num_slots;
        if ts_a == ts_b { return Ok(()); }

        let chain = build_kempe_chain(seed_idx, ts_b, &lessons);
        if let Some((from_a, from_b)) = chain {
            let rooms_for_subject: Vec<Vec<usize>> = (0..facts.subjects.len())
                .map(|subj_idx| {
                    (0..facts.rooms.len())
                        .filter(|&r| facts.rooms[r].suitable_subjects[subj_idx])
                        .collect()
                })
                .collect();
            let mut rng = SmallRng::seed_from_u64(rng_seed);

            let result = execute_kempe_chain(
                &from_a, &from_b, ts_b, ts_a,
                &mut lessons, &facts, &mut state,
                &rooms_for_subject, &mut rng,
            );

            if result.is_some() {
                let full = full_evaluate(&lessons, &facts);
                prop_assert_eq!(
                    state.score(), full,
                    "Kempe chain incremental score mismatch"
                );
            }
        }
    }

    #[test]
    fn kempe_chain_undo_restores_score(
        (facts, mut lessons) in arb_problem(),
        slot_assignments in proptest::collection::vec(0..5usize, 1..16),
        room_choices in proptest::collection::vec(0..5usize, 1..16),
        seed_pos in 0..8usize,
        target_slot in 0..5usize,
        rng_seed in 0..1000u64,
    ) {
        let num_slots = facts.timeslots.len();
        let num_rooms = facts.rooms.len();
        if num_slots < 2 { return Ok(()); }

        let mut state = IncrementalState::new(&facts);

        let n = lessons.len();
        for i in 0..n {
            let slot = slot_assignments.get(i).copied().unwrap_or(0) % num_slots;
            let room = if num_rooms > 0 {
                let r = room_choices.get(i).copied().unwrap_or(0);
                if r % 5 == 0 { None } else { Some(r % num_rooms) }
            } else {
                None
            };
            state.assign(&mut lessons[i], slot, room, &facts);
        }

        let original_score = state.score();
        let original_positions: Vec<(Option<usize>, Option<usize>)> = lessons
            .iter()
            .map(|l| (l.timeslot, l.room))
            .collect();

        let assigned: Vec<usize> = lessons.iter().enumerate()
            .filter(|(_, l)| l.timeslot.is_some())
            .map(|(i, _)| i)
            .collect();
        if assigned.is_empty() { return Ok(()); }
        let seed_idx = assigned[seed_pos % assigned.len()];
        let ts_a = lessons[seed_idx].timeslot.unwrap();
        let ts_b = target_slot % num_slots;
        if ts_a == ts_b { return Ok(()); }

        let chain = build_kempe_chain(seed_idx, ts_b, &lessons);
        if let Some((from_a, from_b)) = chain {
            let rooms_for_subject: Vec<Vec<usize>> = (0..facts.subjects.len())
                .map(|subj_idx| {
                    (0..facts.rooms.len())
                        .filter(|&r| facts.rooms[r].suitable_subjects[subj_idx])
                        .collect()
                })
                .collect();
            let mut rng = SmallRng::seed_from_u64(rng_seed);

            let result = execute_kempe_chain(
                &from_a, &from_b, ts_b, ts_a,
                &mut lessons, &facts, &mut state,
                &rooms_for_subject, &mut rng,
            );

            if let Some(undo_moves) = result {
                // Undo the chain
                for &(idx, _, _) in &undo_moves {
                    state.unassign(&mut lessons[idx], &facts);
                }
                for &(idx, old_ts, old_room) in &undo_moves {
                    state.assign(&mut lessons[idx], old_ts, old_room, &facts);
                }

                prop_assert_eq!(
                    state.score(), original_score,
                    "Score not restored after Kempe undo"
                );
                for (i, l) in lessons.iter().enumerate() {
                    prop_assert_eq!(
                        (l.timeslot, l.room), original_positions[i],
                        "Lesson {} position not restored after undo", i
                    );
                }
            }
        }
    }
}
