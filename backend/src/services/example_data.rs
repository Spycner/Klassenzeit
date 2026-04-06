//! Builds the canonical example dataset for a school.
//!
//! Mirrors `docker/seeds/dev-seed.sql` but generates fresh UUIDs and accepts an
//! arbitrary `school_id`, so it can be invoked at runtime by the onboarding wizard.

use chrono::{NaiveDate, NaiveTime, Utc};
use loco_rs::Result;
use sea_orm::{ActiveModelTrait, DatabaseTransaction, Set};
use uuid::Uuid;

use crate::models::_entities::{
    curriculum_entries, room_subject_suitabilities, rooms, school_classes, school_years, subjects,
    teacher_availabilities, teacher_subject_qualifications, teachers, terms, time_slots,
};

/// Populate the given (assumed-empty) school with the canonical example dataset.
///
/// All inserts run in the supplied transaction. Caller is responsible for
/// committing or rolling back.
#[allow(clippy::too_many_lines)]
pub async fn load_example_school_data(txn: &DatabaseTransaction, school_id: Uuid) -> Result<()> {
    let now = Utc::now().into();

    // ── School Year ─────────────────────────────────────────────────────────
    let school_year_id = Uuid::new_v4();
    school_years::ActiveModel {
        id: Set(school_year_id),
        school_id: Set(school_id),
        name: Set("2025/2026".to_string()),
        start_date: Set(NaiveDate::from_ymd_opt(2025, 8, 1).unwrap()),
        end_date: Set(NaiveDate::from_ymd_opt(2026, 7, 31).unwrap()),
        is_current: Set(true),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(txn)
    .await?;

    // ── Terms ───────────────────────────────────────────────────────────────
    let term1_id = Uuid::new_v4();
    let term2_id = Uuid::new_v4();
    terms::ActiveModel {
        id: Set(term1_id),
        school_year_id: Set(school_year_id),
        name: Set("1. Halbjahr".to_string()),
        start_date: Set(NaiveDate::from_ymd_opt(2025, 8, 1).unwrap()),
        end_date: Set(NaiveDate::from_ymd_opt(2026, 1, 31).unwrap()),
        is_current: Set(true),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(txn)
    .await?;
    terms::ActiveModel {
        id: Set(term2_id),
        school_year_id: Set(school_year_id),
        name: Set("2. Halbjahr".to_string()),
        start_date: Set(NaiveDate::from_ymd_opt(2026, 2, 1).unwrap()),
        end_date: Set(NaiveDate::from_ymd_opt(2026, 7, 31).unwrap()),
        is_current: Set(false),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(txn)
    .await?;

    // ── Teachers ────────────────────────────────────────────────────────────
    let teacher_mueller = Uuid::new_v4();
    let teacher_schmidt = Uuid::new_v4();
    let teacher_weber = Uuid::new_v4();
    let teacher_fischer = Uuid::new_v4();
    let teacher_becker = Uuid::new_v4();
    let teacher_hoffmann = Uuid::new_v4();
    let teacher_klein = Uuid::new_v4();
    let teacher_wagner = Uuid::new_v4();

    let teacher_specs: [(Uuid, &str, &str, &str, &str, i32, bool); 8] = [
        (
            teacher_mueller,
            "Anna",
            "Müller",
            "a.mueller@grundschule-am-see.de",
            "MÜL",
            28,
            false,
        ),
        (
            teacher_schmidt,
            "Thomas",
            "Schmidt",
            "t.schmidt@grundschule-am-see.de",
            "SCH",
            28,
            false,
        ),
        (
            teacher_weber,
            "Maria",
            "Weber",
            "m.weber@grundschule-am-see.de",
            "WEB",
            28,
            false,
        ),
        (
            teacher_fischer,
            "Klaus",
            "Fischer",
            "k.fischer@grundschule-am-see.de",
            "FIS",
            28,
            false,
        ),
        (
            teacher_becker,
            "Sabine",
            "Becker",
            "s.becker@grundschule-am-see.de",
            "BEC",
            14,
            true,
        ),
        (
            teacher_hoffmann,
            "Peter",
            "Hoffmann",
            "p.hoffmann@grundschule-am-see.de",
            "HOF",
            28,
            false,
        ),
        (
            teacher_klein,
            "Laura",
            "Klein",
            "l.klein@grundschule-am-see.de",
            "KLE",
            14,
            true,
        ),
        (
            teacher_wagner,
            "Markus",
            "Wagner",
            "m.wagner@grundschule-am-see.de",
            "WAG",
            28,
            false,
        ),
    ];

    for (id, first, last, email, abbr, max_hours, part_time) in teacher_specs {
        teachers::ActiveModel {
            id: Set(id),
            school_id: Set(school_id),
            first_name: Set(first.to_string()),
            last_name: Set(last.to_string()),
            email: Set(Some(email.to_string())),
            abbreviation: Set(abbr.to_string()),
            max_hours_per_week: Set(max_hours),
            is_part_time: Set(part_time),
            is_active: Set(true),
            created_at: Set(now),
            updated_at: Set(now),
        }
        .insert(txn)
        .await?;
    }

    // ── Subjects ────────────────────────────────────────────────────────────
    let subject_de = Uuid::new_v4();
    let subject_ma = Uuid::new_v4();
    let subject_en = Uuid::new_v4();
    let subject_su = Uuid::new_v4();
    let subject_sp = Uuid::new_v4();
    let subject_mu = Uuid::new_v4();
    let subject_ku = Uuid::new_v4();
    let subject_re = Uuid::new_v4();

    let subject_specs: [(Uuid, &str, &str, &str, bool); 8] = [
        (subject_de, "Deutsch", "DE", "#4A90D9", false),
        (subject_ma, "Mathematik", "MA", "#E74C3C", false),
        (subject_en, "Englisch", "EN", "#2ECC71", false),
        (subject_su, "Sachunterricht", "SU", "#F39C12", false),
        (subject_sp, "Sport", "SP", "#9B59B6", true),
        (subject_mu, "Musik", "MU", "#1ABC9C", true),
        (subject_ku, "Kunst", "KU", "#E67E22", false),
        (subject_re, "Religion", "RE", "#95A5A6", false),
    ];

    for (id, name, abbr, color, special) in subject_specs {
        subjects::ActiveModel {
            id: Set(id),
            school_id: Set(school_id),
            name: Set(name.to_string()),
            abbreviation: Set(abbr.to_string()),
            color: Set(Some(color.to_string())),
            needs_special_room: Set(special),
            created_at: Set(now),
            updated_at: Set(now),
        }
        .insert(txn)
        .await?;
    }

    // ── Rooms ───────────────────────────────────────────────────────────────
    let room_101 = Uuid::new_v4();
    let room_102 = Uuid::new_v4();
    let room_103 = Uuid::new_v4();
    let room_104 = Uuid::new_v4();
    let room_turnhalle = Uuid::new_v4();
    let room_musikraum = Uuid::new_v4();

    let room_specs: [(Uuid, &str, &str, i32); 6] = [
        (room_101, "101", "Hauptgebäude", 30),
        (room_102, "102", "Hauptgebäude", 30),
        (room_103, "103", "Hauptgebäude", 30),
        (room_104, "104", "Hauptgebäude", 30),
        (room_turnhalle, "Turnhalle", "Nebengebäude", 60),
        (room_musikraum, "Musikraum", "Hauptgebäude", 30),
    ];

    for (id, name, building, capacity) in room_specs {
        rooms::ActiveModel {
            id: Set(id),
            school_id: Set(school_id),
            name: Set(name.to_string()),
            building: Set(Some(building.to_string())),
            capacity: Set(Some(capacity)),
            is_active: Set(true),
            max_concurrent: Set(1),
            created_at: Set(now),
            updated_at: Set(now),
        }
        .insert(txn)
        .await?;
    }

    // ── School Classes ──────────────────────────────────────────────────────
    let class_1a = Uuid::new_v4();
    let class_2a = Uuid::new_v4();
    let class_3a = Uuid::new_v4();
    let class_4a = Uuid::new_v4();

    let class_specs: [(Uuid, &str, i16, i32, Uuid); 4] = [
        (class_1a, "1a", 1, 24, teacher_mueller),
        (class_2a, "2a", 2, 26, teacher_schmidt),
        (class_3a, "3a", 3, 25, teacher_weber),
        (class_4a, "4a", 4, 22, teacher_fischer),
    ];

    for (id, name, grade, students, class_teacher) in class_specs {
        school_classes::ActiveModel {
            id: Set(id),
            school_id: Set(school_id),
            name: Set(name.to_string()),
            grade_level: Set(grade),
            student_count: Set(Some(students)),
            class_teacher_id: Set(Some(class_teacher)),
            is_active: Set(true),
            created_at: Set(now),
            updated_at: Set(now),
        }
        .insert(txn)
        .await?;
    }

    // ── Time Slots (5 days × 6 periods = 30) ────────────────────────────────
    let period_times: [(NaiveTime, NaiveTime); 6] = [
        (
            NaiveTime::from_hms_opt(8, 0, 0).unwrap(),
            NaiveTime::from_hms_opt(8, 45, 0).unwrap(),
        ),
        (
            NaiveTime::from_hms_opt(8, 50, 0).unwrap(),
            NaiveTime::from_hms_opt(9, 35, 0).unwrap(),
        ),
        (
            NaiveTime::from_hms_opt(9, 55, 0).unwrap(),
            NaiveTime::from_hms_opt(10, 40, 0).unwrap(),
        ),
        (
            NaiveTime::from_hms_opt(10, 45, 0).unwrap(),
            NaiveTime::from_hms_opt(11, 30, 0).unwrap(),
        ),
        (
            NaiveTime::from_hms_opt(11, 45, 0).unwrap(),
            NaiveTime::from_hms_opt(12, 30, 0).unwrap(),
        ),
        (
            NaiveTime::from_hms_opt(12, 35, 0).unwrap(),
            NaiveTime::from_hms_opt(13, 20, 0).unwrap(),
        ),
    ];

    for day in 0_i16..=4 {
        for period in 1_i16..=6 {
            let (start, end) = period_times[(period - 1) as usize];
            time_slots::ActiveModel {
                id: Set(Uuid::new_v4()),
                school_id: Set(school_id),
                day_of_week: Set(day),
                period: Set(period),
                start_time: Set(start),
                end_time: Set(end),
                is_break: Set(false),
                label: Set(Some(format!("{period}. Stunde"))),
                created_at: Set(now),
                updated_at: Set(now),
            }
            .insert(txn)
            .await?;
        }
    }

    // ── Teacher-Subject Qualifications (16) ─────────────────────────────────
    let qualification_specs: [(Uuid, Uuid, &str); 16] = [
        // Müller: DE + MA (primary)
        (teacher_mueller, subject_de, "primary"),
        (teacher_mueller, subject_ma, "primary"),
        // Schmidt: DE + MA (primary)
        (teacher_schmidt, subject_de, "primary"),
        (teacher_schmidt, subject_ma, "primary"),
        // Weber: DE + MA (primary)
        (teacher_weber, subject_de, "primary"),
        (teacher_weber, subject_ma, "primary"),
        // Fischer: DE + MA (primary)
        (teacher_fischer, subject_de, "primary"),
        (teacher_fischer, subject_ma, "primary"),
        // Becker: SP (primary) + KU (secondary)
        (teacher_becker, subject_sp, "primary"),
        (teacher_becker, subject_ku, "secondary"),
        // Hoffmann: EN (primary) + SU (secondary)
        (teacher_hoffmann, subject_en, "primary"),
        (teacher_hoffmann, subject_su, "secondary"),
        // Klein: MU (primary) + RE (secondary)
        (teacher_klein, subject_mu, "primary"),
        (teacher_klein, subject_re, "secondary"),
        // Wagner: SU (primary) + EN (secondary)
        (teacher_wagner, subject_su, "primary"),
        (teacher_wagner, subject_en, "secondary"),
    ];

    for (teacher_id, subject_id, level) in qualification_specs {
        teacher_subject_qualifications::ActiveModel {
            id: Set(Uuid::new_v4()),
            teacher_id: Set(teacher_id),
            subject_id: Set(subject_id),
            qualification_level: Set(level.to_string()),
            max_hours_per_week: Set(None),
            created_at: Set(now),
            updated_at: Set(now),
        }
        .insert(txn)
        .await?;
    }

    // ── Teacher Availabilities (24): part-time block-outs, term_id = NULL ───
    // Becker: Thu (3) + Fri (4), all 6 periods
    // Klein: Mon (0) + Tue (1), all 6 periods
    let availability_specs: [(Uuid, i16); 4] = [
        (teacher_becker, 3),
        (teacher_becker, 4),
        (teacher_klein, 0),
        (teacher_klein, 1),
    ];

    for (teacher_id, day) in availability_specs {
        for period in 1_i16..=6 {
            teacher_availabilities::ActiveModel {
                id: Set(Uuid::new_v4()),
                teacher_id: Set(teacher_id),
                term_id: Set(None),
                day_of_week: Set(day),
                period: Set(period),
                availability_type: Set("blocked".to_string()),
                reason: Set(Some("Teilzeit — nicht verfügbar".to_string())),
                created_at: Set(now),
                updated_at: Set(now),
            }
            .insert(txn)
            .await?;
        }
    }

    // ── Room-Subject Suitabilities (2) ──────────────────────────────────────
    room_subject_suitabilities::ActiveModel {
        id: Set(Uuid::new_v4()),
        room_id: Set(room_turnhalle),
        subject_id: Set(subject_sp),
        notes: Set(None),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(txn)
    .await?;
    room_subject_suitabilities::ActiveModel {
        id: Set(Uuid::new_v4()),
        room_id: Set(room_musikraum),
        subject_id: Set(subject_mu),
        notes: Set(None),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(txn)
    .await?;

    // ── Curriculum Entries (30) — 1. Halbjahr only ──────────────────────────
    // Each entry: (class, subject, teacher, hours_per_week)
    let curriculum_specs: [(Uuid, Uuid, Uuid, i32); 30] = [
        // Class 1a (Müller): DE 6, MA 5, SU 3, SP 3, MU 2, KU 2, RE 2
        (class_1a, subject_de, teacher_mueller, 6),
        (class_1a, subject_ma, teacher_mueller, 5),
        (class_1a, subject_su, teacher_wagner, 3),
        (class_1a, subject_sp, teacher_becker, 3),
        (class_1a, subject_mu, teacher_klein, 2),
        (class_1a, subject_ku, teacher_becker, 2),
        (class_1a, subject_re, teacher_klein, 2),
        // Class 2a (Schmidt): DE 6, MA 5, SU 3, SP 3, MU 2, KU 2, RE 2
        (class_2a, subject_de, teacher_schmidt, 6),
        (class_2a, subject_ma, teacher_schmidt, 5),
        (class_2a, subject_su, teacher_wagner, 3),
        (class_2a, subject_sp, teacher_becker, 3),
        (class_2a, subject_mu, teacher_klein, 2),
        (class_2a, subject_ku, teacher_becker, 2),
        (class_2a, subject_re, teacher_klein, 2),
        // Class 3a (Weber): DE 6, MA 5, EN 2, SU 3, SP 3, MU 2, KU 2, RE 2
        (class_3a, subject_de, teacher_weber, 6),
        (class_3a, subject_ma, teacher_weber, 5),
        (class_3a, subject_en, teacher_hoffmann, 2),
        (class_3a, subject_su, teacher_wagner, 3),
        (class_3a, subject_sp, teacher_becker, 3),
        (class_3a, subject_mu, teacher_klein, 2),
        (class_3a, subject_ku, teacher_becker, 2),
        (class_3a, subject_re, teacher_klein, 2),
        // Class 4a (Fischer): DE 6, MA 5, EN 2, SU 3, SP 3, MU 2, KU 2, RE 2
        (class_4a, subject_de, teacher_fischer, 6),
        (class_4a, subject_ma, teacher_fischer, 5),
        (class_4a, subject_en, teacher_hoffmann, 2),
        (class_4a, subject_su, teacher_wagner, 3),
        (class_4a, subject_sp, teacher_becker, 3),
        (class_4a, subject_mu, teacher_klein, 2),
        (class_4a, subject_ku, teacher_becker, 2),
        (class_4a, subject_re, teacher_klein, 2),
    ];

    for (class_id, subject_id, teacher_id, hours) in curriculum_specs {
        curriculum_entries::ActiveModel {
            id: Set(Uuid::new_v4()),
            school_id: Set(school_id),
            term_id: Set(term1_id),
            school_class_id: Set(class_id),
            subject_id: Set(subject_id),
            teacher_id: Set(Some(teacher_id)),
            hours_per_week: Set(hours),
            created_at: Set(now),
            updated_at: Set(now),
        }
        .insert(txn)
        .await?;
    }

    Ok(())
}
