//! CSV import/export for curriculum entries. Scoped per term.
//! Natural key: `"{class_name}|{subject_abbr}"` (within a term).
//!
//! CSV columns:
//!   Required: class_name, subject_abbr, hours_per_week
//!   Optional: teacher_abbreviation
//!
//! Export columns (sorted by class_name, subject_abbr):
//!   class_name, subject_abbr, teacher_abbreviation, hours_per_week
//!
//! Curriculum entries have no is_active column — hard-deleted.

use crate::models::_entities::{curriculum_entries, school_classes, subjects, teachers};
use crate::services::import_export::csv_io::{
    cell, check_required, parse_csv, parse_i32, CsvFileError, RowError,
};
use crate::services::import_export::{PreviewRow, RowAction};
use chrono::Utc;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, DatabaseConnection, DatabaseTransaction, EntityTrait,
    QueryFilter, Set,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use uuid::Uuid;

const REQUIRED: &[&str] = &["class_name", "subject_abbr", "hours_per_week"];

/// Raw parsed row (before FK resolution).
#[derive(Clone, Debug)]
pub struct RawCurriculumRow {
    pub class_name: String,
    pub subject_abbr: String,
    pub teacher_abbreviation: Option<String>,
    pub hours_per_week: i32,
}

/// Fully resolved row.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CurriculumRow {
    pub class_name: String,
    pub subject_abbr: String,
    pub school_class_id: Uuid,
    pub subject_id: Uuid,
    pub teacher_id: Option<Uuid>,
    /// For display in diffs.
    pub teacher_abbreviation: Option<String>,
    pub hours_per_week: i32,
}

impl CurriculumRow {
    pub fn natural_key(&self) -> String {
        format!("{}|{}", self.class_name, self.subject_abbr)
    }
}

/// Parse a CSV body into raw rows (FKs not yet resolved).
#[allow(clippy::type_complexity)]
pub fn parse_raw(
    bytes: &[u8],
) -> Result<
    (
        Vec<(usize, Result<RawCurriculumRow, Vec<String>>)>,
        Vec<String>,
    ),
    CsvFileError,
> {
    let (header, rows) = parse_csv(bytes)?;
    let warnings = check_required(&header, REQUIRED)?;
    let mut out = Vec::new();
    for (i, row) in rows.iter().enumerate() {
        let line = i + 2;
        let mut errors = Vec::new();

        let class_name = cell(&header, row, "class_name").unwrap_or("").to_string();
        let subject_abbr = cell(&header, row, "subject_abbr").unwrap_or("").to_string();
        let hours_str = cell(&header, row, "hours_per_week")
            .unwrap_or("")
            .trim()
            .to_string();

        if class_name.is_empty() {
            errors.push("class_name is required".into());
        }
        if subject_abbr.is_empty() {
            errors.push("subject_abbr is required".into());
        }

        let hours_per_week = if hours_str.is_empty() {
            errors.push("hours_per_week is required".into());
            0
        } else {
            parse_i32(&hours_str).unwrap_or_else(|e| {
                errors.push(e);
                0
            })
        };

        let teacher_abbreviation = cell(&header, row, "teacher_abbreviation")
            .map(str::to_string)
            .filter(|s| !s.is_empty());

        if errors.is_empty() {
            out.push((
                line,
                Ok(RawCurriculumRow {
                    class_name,
                    subject_abbr,
                    teacher_abbreviation,
                    hours_per_week,
                }),
            ));
        } else {
            out.push((line, Err(errors)));
        }
    }
    Ok((out, warnings))
}

/// Resolve FKs from lookup maps.
/// Returns an error string if any FK is unknown.
pub fn resolve_fks(
    raw: RawCurriculumRow,
    class_by_name: &HashMap<String, Uuid>,
    subject_by_abbr: &HashMap<String, Uuid>,
    teacher_by_abbr: &HashMap<String, Uuid>,
) -> Result<CurriculumRow, String> {
    let school_class_id = class_by_name
        .get(&raw.class_name)
        .copied()
        .ok_or_else(|| format!("unknown class name '{}'", raw.class_name))?;

    let subject_id = subject_by_abbr
        .get(&raw.subject_abbr)
        .copied()
        .ok_or_else(|| format!("unknown subject abbreviation '{}'", raw.subject_abbr))?;

    let teacher_id = match &raw.teacher_abbreviation {
        None => None,
        Some(abbr) => match teacher_by_abbr.get(abbr) {
            Some(&id) => Some(id),
            None => return Err(format!("unknown teacher abbreviation '{abbr}'")),
        },
    };

    Ok(CurriculumRow {
        class_name: raw.class_name,
        subject_abbr: raw.subject_abbr,
        school_class_id,
        subject_id,
        teacher_id,
        teacher_abbreviation: raw.teacher_abbreviation,
        hours_per_week: raw.hours_per_week,
    })
}

/// Compare a parsed row to an existing DB row, producing a `PreviewRow`.
/// `teacher_abbr_by_id` maps teacher UUID → abbreviation for display in diffs.
pub fn diff_row(
    line: usize,
    parsed: &CurriculumRow,
    existing: Option<&curriculum_entries::Model>,
    teacher_abbr_by_id: &HashMap<Uuid, String>,
) -> PreviewRow {
    let data = json!({
        "class_name": parsed.class_name,
        "subject_abbr": parsed.subject_abbr,
        "school_class_id": parsed.school_class_id,
        "subject_id": parsed.subject_id,
        "teacher_id": parsed.teacher_id,
        "teacher_abbreviation": parsed.teacher_abbreviation,
        "hours_per_week": parsed.hours_per_week,
    });
    let natural_key = parsed.natural_key();

    match existing {
        None => PreviewRow {
            line,
            action: RowAction::Create,
            natural_key,
            data: Some(data),
            diff: None,
            errors: vec![],
            warnings: vec![],
        },
        Some(m) => {
            let mut diff = serde_json::Map::new();
            if m.teacher_id != parsed.teacher_id {
                let old_abbr = m
                    .teacher_id
                    .and_then(|id| teacher_abbr_by_id.get(&id))
                    .cloned();
                diff.insert(
                    "teacher_abbreviation".into(),
                    json!([old_abbr, parsed.teacher_abbreviation]),
                );
            }
            if m.hours_per_week != parsed.hours_per_week {
                diff.insert(
                    "hours_per_week".into(),
                    json!([m.hours_per_week, parsed.hours_per_week]),
                );
            }
            if diff.is_empty() {
                PreviewRow {
                    line,
                    action: RowAction::Unchanged,
                    natural_key,
                    data: Some(data),
                    diff: None,
                    errors: vec![],
                    warnings: vec![],
                }
            } else {
                PreviewRow {
                    line,
                    action: RowAction::Update,
                    natural_key,
                    data: Some(data),
                    diff: Some(serde_json::Value::Object(diff)),
                    errors: vec![],
                    warnings: vec![],
                }
            }
        }
    }
}

/// Build full preview rows from raw bytes plus current DB state.
pub async fn build_preview(
    db: &DatabaseConnection,
    school_id: Uuid,
    term_id: Uuid,
    bytes: &[u8],
) -> Result<(Vec<PreviewRow>, Vec<String>), CsvFileError> {
    let (raw_parsed, file_warnings) = parse_raw(bytes)?;

    // Load FK lookup maps
    let active_classes: Vec<school_classes::Model> = school_classes::Entity::find()
        .filter(school_classes::Column::SchoolId.eq(school_id))
        .filter(school_classes::Column::IsActive.eq(true))
        .all(db)
        .await
        .map_err(|e| CsvFileError::Parse(e.to_string()))?;
    let class_by_name: HashMap<String, Uuid> = active_classes
        .iter()
        .map(|c| (c.name.clone(), c.id))
        .collect();

    let all_subjects: Vec<subjects::Model> = subjects::Entity::find()
        .filter(subjects::Column::SchoolId.eq(school_id))
        .all(db)
        .await
        .map_err(|e| CsvFileError::Parse(e.to_string()))?;
    let subject_by_abbr: HashMap<String, Uuid> = all_subjects
        .iter()
        .map(|s| (s.abbreviation.clone(), s.id))
        .collect();

    let active_teachers: Vec<teachers::Model> = teachers::Entity::find()
        .filter(teachers::Column::SchoolId.eq(school_id))
        .filter(teachers::Column::IsActive.eq(true))
        .all(db)
        .await
        .map_err(|e| CsvFileError::Parse(e.to_string()))?;
    let teacher_by_abbr: HashMap<String, Uuid> = active_teachers
        .iter()
        .map(|t| (t.abbreviation.clone(), t.id))
        .collect();
    let teacher_abbr_by_id: HashMap<Uuid, String> = active_teachers
        .iter()
        .map(|t| (t.id, t.abbreviation.clone()))
        .collect();

    // Load existing curriculum entries for this term
    let existing_entries: Vec<curriculum_entries::Model> = curriculum_entries::Entity::find()
        .filter(curriculum_entries::Column::SchoolId.eq(school_id))
        .filter(curriculum_entries::Column::TermId.eq(term_id))
        .all(db)
        .await
        .map_err(|e| CsvFileError::Parse(e.to_string()))?;
    // Key: (school_class_id, subject_id)
    let by_key: HashMap<(Uuid, Uuid), curriculum_entries::Model> = existing_entries
        .into_iter()
        .map(|e| ((e.school_class_id, e.subject_id), e))
        .collect();

    let mut rows = Vec::new();
    for (line, result) in raw_parsed {
        match result {
            Ok(raw) => match resolve_fks(raw, &class_by_name, &subject_by_abbr, &teacher_by_abbr) {
                Ok(parsed) => {
                    let key = (parsed.school_class_id, parsed.subject_id);
                    let existing = by_key.get(&key);
                    rows.push(diff_row(line, &parsed, existing, &teacher_abbr_by_id));
                }
                Err(msg) => rows.push(PreviewRow {
                    line,
                    action: RowAction::Invalid,
                    natural_key: String::new(),
                    data: None,
                    diff: None,
                    errors: vec![msg],
                    warnings: vec![],
                }),
            },
            Err(errors) => rows.push(PreviewRow {
                line,
                action: RowAction::Invalid,
                natural_key: String::new(),
                data: None,
                diff: None,
                errors,
                warnings: vec![],
            }),
        }
    }
    Ok((rows, file_warnings))
}

/// Apply preview rows in a single transaction. Caller opens/commits the txn.
pub async fn commit(
    txn: &DatabaseTransaction,
    school_id: Uuid,
    term_id: Uuid,
    rows: &[PreviewRow],
) -> Result<(), RowError> {
    let now: chrono::DateTime<chrono::FixedOffset> = Utc::now().into();

    for row in rows {
        match row.action {
            RowAction::Unchanged | RowAction::Invalid => continue,
            RowAction::Create => {
                let data: CurriculumRow = serde_json::from_value(row.data.clone().unwrap())
                    .map_err(|e| RowError {
                        line: row.line,
                        messages: vec![e.to_string()],
                    })?;
                let am = curriculum_entries::ActiveModel {
                    id: Set(Uuid::new_v4()),
                    school_id: Set(school_id),
                    term_id: Set(term_id),
                    school_class_id: Set(data.school_class_id),
                    subject_id: Set(data.subject_id),
                    teacher_id: Set(data.teacher_id),
                    hours_per_week: Set(data.hours_per_week),
                    created_at: Set(now),
                    updated_at: Set(now),
                };
                am.insert(txn).await.map_err(|e| RowError {
                    line: row.line,
                    messages: vec![e.to_string()],
                })?;
            }
            RowAction::Update => {
                let data: CurriculumRow = serde_json::from_value(row.data.clone().unwrap())
                    .map_err(|e| RowError {
                        line: row.line,
                        messages: vec![e.to_string()],
                    })?;
                let existing = curriculum_entries::Entity::find()
                    .filter(curriculum_entries::Column::SchoolId.eq(school_id))
                    .filter(curriculum_entries::Column::TermId.eq(term_id))
                    .filter(curriculum_entries::Column::SchoolClassId.eq(data.school_class_id))
                    .filter(curriculum_entries::Column::SubjectId.eq(data.subject_id))
                    .one(txn)
                    .await
                    .map_err(|e| RowError {
                        line: row.line,
                        messages: vec![e.to_string()],
                    })?
                    .ok_or_else(|| RowError {
                        line: row.line,
                        messages: vec!["row vanished between preview and commit".into()],
                    })?;
                let mut am: curriculum_entries::ActiveModel = existing.into();
                am.teacher_id = Set(data.teacher_id);
                am.hours_per_week = Set(data.hours_per_week);
                am.updated_at = Set(now);
                am.update(txn).await.map_err(|e| RowError {
                    line: row.line,
                    messages: vec![e.to_string()],
                })?;
            }
        }
    }
    Ok(())
}

/// Render all curriculum entries for a school/term as CSV bytes.
pub async fn export_csv(
    db: &DatabaseConnection,
    school_id: Uuid,
    term_id: Uuid,
) -> Result<Vec<u8>, sea_orm::DbErr> {
    let entries: Vec<curriculum_entries::Model> = curriculum_entries::Entity::find()
        .filter(curriculum_entries::Column::SchoolId.eq(school_id))
        .filter(curriculum_entries::Column::TermId.eq(term_id))
        .all(db)
        .await?;

    // Build lookup maps for display
    let all_classes: Vec<school_classes::Model> = school_classes::Entity::find()
        .filter(school_classes::Column::SchoolId.eq(school_id))
        .all(db)
        .await?;
    let class_name_by_id: HashMap<Uuid, String> =
        all_classes.into_iter().map(|c| (c.id, c.name)).collect();

    let all_subjects: Vec<subjects::Model> = subjects::Entity::find()
        .filter(subjects::Column::SchoolId.eq(school_id))
        .all(db)
        .await?;
    let subject_abbr_by_id: HashMap<Uuid, String> = all_subjects
        .into_iter()
        .map(|s| (s.id, s.abbreviation))
        .collect();

    let all_teachers: Vec<teachers::Model> = teachers::Entity::find()
        .filter(teachers::Column::SchoolId.eq(school_id))
        .all(db)
        .await?;
    let teacher_abbr_by_id: HashMap<Uuid, String> = all_teachers
        .into_iter()
        .map(|t| (t.id, t.abbreviation))
        .collect();

    // Build sortable rows
    let mut display_rows: Vec<(String, String, Option<String>, i32)> = entries
        .into_iter()
        .map(|e| {
            let class_name = class_name_by_id
                .get(&e.school_class_id)
                .cloned()
                .unwrap_or_default();
            let subject_abbr = subject_abbr_by_id
                .get(&e.subject_id)
                .cloned()
                .unwrap_or_default();
            let teacher_abbr = e
                .teacher_id
                .and_then(|id| teacher_abbr_by_id.get(&id))
                .cloned();
            (class_name, subject_abbr, teacher_abbr, e.hours_per_week)
        })
        .collect();
    display_rows.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.cmp(&b.1)));

    let mut wtr = csv::Writer::from_writer(vec![]);
    wtr.write_record([
        "class_name",
        "subject_abbr",
        "teacher_abbreviation",
        "hours_per_week",
    ])
    .unwrap();
    for (class_name, subject_abbr, teacher_abbr, hours) in display_rows {
        wtr.write_record([
            class_name.as_str(),
            subject_abbr.as_str(),
            teacher_abbr.as_deref().unwrap_or(""),
            &hours.to_string(),
        ])
        .unwrap();
    }
    Ok(wtr.into_inner().unwrap())
}

#[allow(unused_imports)]
#[cfg(test)]
mod tests {
    use super::*;

    fn fake_existing(class_id: Uuid, subject_id: Uuid) -> curriculum_entries::Model {
        curriculum_entries::Model {
            id: Uuid::new_v4(),
            school_id: Uuid::new_v4(),
            term_id: Uuid::new_v4(),
            school_class_id: class_id,
            subject_id,
            teacher_id: None,
            hours_per_week: 3,
            created_at: Utc::now().into(),
            updated_at: Utc::now().into(),
        }
    }

    fn make_maps() -> (
        HashMap<String, Uuid>,
        HashMap<String, Uuid>,
        HashMap<String, Uuid>,
        HashMap<Uuid, String>,
    ) {
        let class_id = Uuid::new_v4();
        let subject_id = Uuid::new_v4();
        let teacher_id = Uuid::new_v4();
        let mut class_by_name = HashMap::new();
        class_by_name.insert("5A".into(), class_id);
        let mut subject_by_abbr = HashMap::new();
        subject_by_abbr.insert("MA".into(), subject_id);
        let mut teacher_by_abbr = HashMap::new();
        teacher_by_abbr.insert("JD".into(), teacher_id);
        let mut teacher_abbr_by_id = HashMap::new();
        teacher_abbr_by_id.insert(teacher_id, "JD".into());
        (
            class_by_name,
            subject_by_abbr,
            teacher_by_abbr,
            teacher_abbr_by_id,
        )
    }

    #[test]
    fn parse_minimum_columns() {
        let csv = b"class_name,subject_abbr,hours_per_week\n5A,MA,3\n";
        let (rows, warnings) = parse_raw(csv).unwrap();
        assert!(warnings.is_empty());
        assert_eq!(rows.len(), 1);
        let raw = rows[0].1.as_ref().unwrap();
        assert_eq!(raw.class_name, "5A");
        assert_eq!(raw.subject_abbr, "MA");
        assert_eq!(raw.hours_per_week, 3);
        assert!(raw.teacher_abbreviation.is_none());
    }

    #[test]
    fn parse_missing_required_column() {
        let csv = b"class_name,subject_abbr\n5A,MA\n";
        let err = parse_raw(csv).unwrap_err();
        assert!(matches!(err, CsvFileError::MissingColumn(s) if s == "hours_per_week"));
    }

    #[test]
    fn parse_row_with_invalid_hours() {
        let csv = b"class_name,subject_abbr,hours_per_week\n5A,MA,abc\n";
        let (rows, _) = parse_raw(csv).unwrap();
        let errs = rows[0].1.as_ref().unwrap_err();
        assert!(errs.iter().any(|m| m.contains("integer")));
    }

    #[test]
    fn resolve_fks_unknown_class() {
        let (_, subject_by_abbr, teacher_by_abbr, _) = make_maps();
        let raw = RawCurriculumRow {
            class_name: "UNKNOWN".into(),
            subject_abbr: "MA".into(),
            teacher_abbreviation: None,
            hours_per_week: 3,
        };
        let err =
            resolve_fks(raw, &HashMap::new(), &subject_by_abbr, &teacher_by_abbr).unwrap_err();
        assert!(err.contains("unknown class name 'UNKNOWN'"));
    }

    #[test]
    fn resolve_fks_unknown_subject() {
        let (class_by_name, _, teacher_by_abbr, _) = make_maps();
        let raw = RawCurriculumRow {
            class_name: "5A".into(),
            subject_abbr: "UNKNOWN".into(),
            teacher_abbreviation: None,
            hours_per_week: 3,
        };
        let err = resolve_fks(raw, &class_by_name, &HashMap::new(), &teacher_by_abbr).unwrap_err();
        assert!(err.contains("unknown subject abbreviation 'UNKNOWN'"));
    }

    #[test]
    fn resolve_fks_unknown_teacher() {
        let (class_by_name, subject_by_abbr, _, _) = make_maps();
        let raw = RawCurriculumRow {
            class_name: "5A".into(),
            subject_abbr: "MA".into(),
            teacher_abbreviation: Some("XYZ".into()),
            hours_per_week: 3,
        };
        let err = resolve_fks(raw, &class_by_name, &subject_by_abbr, &HashMap::new()).unwrap_err();
        assert!(err.contains("unknown teacher abbreviation 'XYZ'"));
    }

    #[test]
    fn diff_row_create_when_no_existing() {
        let (class_by_name, subject_by_abbr, teacher_by_abbr, teacher_abbr_by_id) = make_maps();
        let raw = RawCurriculumRow {
            class_name: "5A".into(),
            subject_abbr: "MA".into(),
            teacher_abbreviation: None,
            hours_per_week: 3,
        };
        let parsed = resolve_fks(raw, &class_by_name, &subject_by_abbr, &teacher_by_abbr).unwrap();
        let row = diff_row(2, &parsed, None, &teacher_abbr_by_id);
        assert_eq!(row.action, RowAction::Create);
        assert_eq!(row.natural_key, "5A|MA");
    }

    #[test]
    fn diff_row_unchanged_when_identical() {
        let (class_by_name, subject_by_abbr, teacher_by_abbr, teacher_abbr_by_id) = make_maps();
        let class_id = *class_by_name.get("5A").unwrap();
        let subject_id = *subject_by_abbr.get("MA").unwrap();
        let existing = fake_existing(class_id, subject_id); // hours=3, teacher=None
        let raw = RawCurriculumRow {
            class_name: "5A".into(),
            subject_abbr: "MA".into(),
            teacher_abbreviation: None,
            hours_per_week: 3,
        };
        let parsed = resolve_fks(raw, &class_by_name, &subject_by_abbr, &teacher_by_abbr).unwrap();
        let row = diff_row(2, &parsed, Some(&existing), &teacher_abbr_by_id);
        assert_eq!(row.action, RowAction::Unchanged);
    }

    #[test]
    fn diff_row_update_when_hours_differ() {
        let (class_by_name, subject_by_abbr, teacher_by_abbr, teacher_abbr_by_id) = make_maps();
        let class_id = *class_by_name.get("5A").unwrap();
        let subject_id = *subject_by_abbr.get("MA").unwrap();
        let existing = fake_existing(class_id, subject_id); // hours=3
        let raw = RawCurriculumRow {
            class_name: "5A".into(),
            subject_abbr: "MA".into(),
            teacher_abbreviation: None,
            hours_per_week: 4,
        };
        let parsed = resolve_fks(raw, &class_by_name, &subject_by_abbr, &teacher_by_abbr).unwrap();
        let row = diff_row(2, &parsed, Some(&existing), &teacher_abbr_by_id);
        assert_eq!(row.action, RowAction::Update);
        assert!(row.diff.unwrap().get("hours_per_week").is_some());
    }

    #[test]
    fn diff_row_teacher_shown_as_abbreviation_in_diff() {
        let (class_by_name, subject_by_abbr, teacher_by_abbr, teacher_abbr_by_id) = make_maps();
        let teacher_id = *teacher_by_abbr.get("JD").unwrap();
        let class_id = *class_by_name.get("5A").unwrap();
        let subject_id = *subject_by_abbr.get("MA").unwrap();
        let mut existing = fake_existing(class_id, subject_id);
        existing.teacher_id = Some(teacher_id);
        let raw = RawCurriculumRow {
            class_name: "5A".into(),
            subject_abbr: "MA".into(),
            teacher_abbreviation: None, // removing teacher
            hours_per_week: 3,
        };
        let parsed = resolve_fks(raw, &class_by_name, &subject_by_abbr, &teacher_by_abbr).unwrap();
        let row = diff_row(2, &parsed, Some(&existing), &teacher_abbr_by_id);
        assert_eq!(row.action, RowAction::Update);
        let diff = row.diff.unwrap();
        let teacher_diff = diff.get("teacher_abbreviation").unwrap();
        assert_eq!(teacher_diff[0], "JD");
        assert!(teacher_diff[1].is_null());
    }
}
