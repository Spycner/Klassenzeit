//! CSV import/export for school classes. Natural key: `name`.
//!
//! Columns (export order):
//!   name, grade_level, student_count, class_teacher_abbreviation, is_active
//!
//! The `class_teacher_abbreviation` column is resolved to/from `class_teacher_id`
//! via the active teachers table.

use crate::models::_entities::{school_classes, teachers};
use crate::services::import_export::csv_io::{
    cell, check_required, parse_bool, parse_csv, parse_i16, parse_i32, CsvFileError, RowError,
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

const REQUIRED: &[&str] = &["name", "grade_level"];

/// Raw parsed row (before FK resolution).
#[derive(Clone, Debug)]
pub struct RawClassRow {
    pub name: String,
    pub grade_level: i16,
    pub student_count: Option<i32>,
    pub class_teacher_abbreviation: Option<String>,
    pub is_active: bool,
}

/// Fully resolved row (FK resolved).
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ClassRow {
    pub name: String,
    pub grade_level: i16,
    pub student_count: Option<i32>,
    /// Resolved teacher UUID (None if no abbreviation provided).
    pub class_teacher_id: Option<Uuid>,
    /// For display in diffs — abbreviation string.
    pub class_teacher_abbreviation: Option<String>,
    pub is_active: bool,
}

/// Parse a CSV body into raw rows (abbreviations not yet resolved).
#[allow(clippy::type_complexity)]
pub fn parse_raw(
    bytes: &[u8],
) -> Result<(Vec<(usize, Result<RawClassRow, Vec<String>>)>, Vec<String>), CsvFileError> {
    let (header, rows) = parse_csv(bytes)?;
    let warnings = check_required(&header, REQUIRED)?;
    let mut out = Vec::new();
    for (i, row) in rows.iter().enumerate() {
        let line = i + 2;
        let mut errors = Vec::new();

        let name = cell(&header, row, "name").unwrap_or("").to_string();
        let grade_level_str = cell(&header, row, "grade_level")
            .unwrap_or("")
            .trim()
            .to_string();

        if name.is_empty() {
            errors.push("name is required".into());
        }

        let grade_level = if grade_level_str.is_empty() {
            errors.push("grade_level is required".into());
            0
        } else {
            parse_i16(&grade_level_str).unwrap_or_else(|e| {
                errors.push(e);
                0
            })
        };

        let student_count = match cell(&header, row, "student_count").unwrap_or("").trim() {
            "" => None,
            s => match parse_i32(s) {
                Ok(v) => Some(v),
                Err(e) => {
                    errors.push(e);
                    None
                }
            },
        };

        let class_teacher_abbreviation = cell(&header, row, "class_teacher_abbreviation")
            .map(str::to_string)
            .filter(|s| !s.is_empty());

        let is_active = match cell(&header, row, "is_active").unwrap_or("").trim() {
            "" => true,
            s => parse_bool(s).unwrap_or_else(|e| {
                errors.push(e);
                true
            }),
        };

        if errors.is_empty() {
            out.push((
                line,
                Ok(RawClassRow {
                    name,
                    grade_level,
                    student_count,
                    class_teacher_abbreviation,
                    is_active,
                }),
            ));
        } else {
            out.push((line, Err(errors)));
        }
    }
    Ok((out, warnings))
}

/// Resolve teacher abbreviations to UUIDs.
/// Returns a resolved ClassRow or an error message if the abbreviation is unknown.
pub fn resolve_fks(
    raw: RawClassRow,
    teacher_by_abbr: &HashMap<String, Uuid>,
) -> Result<ClassRow, String> {
    let class_teacher_id = match &raw.class_teacher_abbreviation {
        None => None,
        Some(abbr) => match teacher_by_abbr.get(abbr) {
            Some(&id) => Some(id),
            None => {
                return Err(format!("unknown teacher abbreviation '{abbr}'"));
            }
        },
    };
    Ok(ClassRow {
        name: raw.name,
        grade_level: raw.grade_level,
        student_count: raw.student_count,
        class_teacher_id,
        class_teacher_abbreviation: raw.class_teacher_abbreviation,
        is_active: raw.is_active,
    })
}

/// Compare a parsed row to an existing DB row, producing a `PreviewRow`.
/// `teacher_abbr_by_id` maps teacher UUID → abbreviation for display in diffs.
pub fn diff_row(
    line: usize,
    parsed: &ClassRow,
    existing: Option<&school_classes::Model>,
    teacher_abbr_by_id: &HashMap<Uuid, String>,
) -> PreviewRow {
    let data = json!({
        "name": parsed.name,
        "grade_level": parsed.grade_level,
        "student_count": parsed.student_count,
        "class_teacher_id": parsed.class_teacher_id,
        "class_teacher_abbreviation": parsed.class_teacher_abbreviation,
        "is_active": parsed.is_active,
    });

    match existing {
        None => PreviewRow {
            line,
            action: RowAction::Create,
            natural_key: parsed.name.clone(),
            data: Some(data),
            diff: None,
            errors: vec![],
            warnings: vec![],
        },
        Some(m) => {
            let mut diff = serde_json::Map::new();
            if m.grade_level != parsed.grade_level {
                diff.insert(
                    "grade_level".into(),
                    json!([m.grade_level, parsed.grade_level]),
                );
            }
            if m.student_count != parsed.student_count {
                diff.insert(
                    "student_count".into(),
                    json!([m.student_count, parsed.student_count]),
                );
            }
            if m.class_teacher_id != parsed.class_teacher_id {
                let old_abbr = m
                    .class_teacher_id
                    .and_then(|id| teacher_abbr_by_id.get(&id))
                    .cloned();
                diff.insert(
                    "class_teacher_abbreviation".into(),
                    json!([old_abbr, parsed.class_teacher_abbreviation]),
                );
            }
            if m.is_active != parsed.is_active {
                diff.insert("is_active".into(), json!([m.is_active, parsed.is_active]));
            }
            if diff.is_empty() {
                PreviewRow {
                    line,
                    action: RowAction::Unchanged,
                    natural_key: parsed.name.clone(),
                    data: Some(data),
                    diff: None,
                    errors: vec![],
                    warnings: vec![],
                }
            } else {
                PreviewRow {
                    line,
                    action: RowAction::Update,
                    natural_key: parsed.name.clone(),
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
    bytes: &[u8],
) -> Result<(Vec<PreviewRow>, Vec<String>), CsvFileError> {
    let (raw_parsed, file_warnings) = parse_raw(bytes)?;

    // Load active teachers for FK resolution (abbr → id and id → abbr)
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

    // Load active classes for diff
    let existing_classes: Vec<school_classes::Model> = school_classes::Entity::find()
        .filter(school_classes::Column::SchoolId.eq(school_id))
        .filter(school_classes::Column::IsActive.eq(true))
        .all(db)
        .await
        .map_err(|e| CsvFileError::Parse(e.to_string()))?;
    let by_name: HashMap<String, school_classes::Model> = existing_classes
        .into_iter()
        .map(|m| (m.name.clone(), m))
        .collect();

    let mut rows = Vec::new();
    for (line, result) in raw_parsed {
        match result {
            Ok(raw) => match resolve_fks(raw, &teacher_by_abbr) {
                Ok(parsed) => {
                    let existing = by_name.get(&parsed.name);
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
    rows: &[PreviewRow],
) -> Result<(), RowError> {
    let now: chrono::DateTime<chrono::FixedOffset> = Utc::now().into();

    for row in rows {
        match row.action {
            RowAction::Unchanged | RowAction::Invalid => continue,
            RowAction::Create => {
                let data: ClassRow =
                    serde_json::from_value(row.data.clone().unwrap()).map_err(|e| RowError {
                        line: row.line,
                        messages: vec![e.to_string()],
                    })?;
                let am = school_classes::ActiveModel {
                    id: Set(Uuid::new_v4()),
                    school_id: Set(school_id),
                    name: Set(data.name),
                    grade_level: Set(data.grade_level),
                    student_count: Set(data.student_count),
                    class_teacher_id: Set(data.class_teacher_id),
                    is_active: Set(data.is_active),
                    created_at: Set(now),
                    updated_at: Set(now),
                };
                am.insert(txn).await.map_err(|e| RowError {
                    line: row.line,
                    messages: vec![e.to_string()],
                })?;
            }
            RowAction::Update => {
                let data: ClassRow =
                    serde_json::from_value(row.data.clone().unwrap()).map_err(|e| RowError {
                        line: row.line,
                        messages: vec![e.to_string()],
                    })?;
                let existing = school_classes::Entity::find()
                    .filter(school_classes::Column::SchoolId.eq(school_id))
                    .filter(school_classes::Column::Name.eq(data.name.clone()))
                    .filter(school_classes::Column::IsActive.eq(true))
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
                let mut am: school_classes::ActiveModel = existing.into();
                am.grade_level = Set(data.grade_level);
                am.student_count = Set(data.student_count);
                am.class_teacher_id = Set(data.class_teacher_id);
                am.is_active = Set(data.is_active);
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

/// Render all active classes for a school as CSV bytes.
pub async fn export_csv(
    db: &DatabaseConnection,
    school_id: Uuid,
) -> Result<Vec<u8>, sea_orm::DbErr> {
    let mut classes = school_classes::Entity::find()
        .filter(school_classes::Column::SchoolId.eq(school_id))
        .filter(school_classes::Column::IsActive.eq(true))
        .all(db)
        .await?;
    classes.sort_by(|a, b| a.name.cmp(&b.name));

    // Build teacher id → abbreviation map
    let active_teachers: Vec<teachers::Model> = teachers::Entity::find()
        .filter(teachers::Column::SchoolId.eq(school_id))
        .filter(teachers::Column::IsActive.eq(true))
        .all(db)
        .await?;
    let teacher_abbr_by_id: HashMap<Uuid, String> = active_teachers
        .into_iter()
        .map(|t| (t.id, t.abbreviation))
        .collect();

    let mut wtr = csv::Writer::from_writer(vec![]);
    wtr.write_record([
        "name",
        "grade_level",
        "student_count",
        "class_teacher_abbreviation",
        "is_active",
    ])
    .unwrap();
    for m in classes {
        let teacher_abbr = m
            .class_teacher_id
            .and_then(|id| teacher_abbr_by_id.get(&id))
            .map(|s| s.as_str())
            .unwrap_or("");
        wtr.write_record([
            m.name.as_str(),
            &m.grade_level.to_string(),
            &m.student_count.map(|c| c.to_string()).unwrap_or_default(),
            teacher_abbr,
            if m.is_active { "true" } else { "false" },
        ])
        .unwrap();
    }
    Ok(wtr.into_inner().unwrap())
}

#[allow(unused_imports)]
#[cfg(test)]
mod tests {
    use super::*;

    fn fake_existing(name: &str) -> school_classes::Model {
        school_classes::Model {
            id: Uuid::new_v4(),
            school_id: Uuid::new_v4(),
            name: name.into(),
            grade_level: 5,
            student_count: Some(25),
            class_teacher_id: None,
            is_active: true,
            created_at: Utc::now().into(),
            updated_at: Utc::now().into(),
        }
    }

    fn empty_teacher_maps() -> (HashMap<String, Uuid>, HashMap<Uuid, String>) {
        (HashMap::new(), HashMap::new())
    }

    #[test]
    fn parse_minimum_columns() {
        let csv = b"name,grade_level\n5A,5\n";
        let (rows, warnings) = parse_raw(csv).unwrap();
        assert!(warnings.is_empty());
        assert_eq!(rows.len(), 1);
        let raw = rows[0].1.as_ref().unwrap();
        assert_eq!(raw.name, "5A");
        assert_eq!(raw.grade_level, 5);
        assert!(raw.student_count.is_none());
        assert!(raw.class_teacher_abbreviation.is_none());
        assert!(raw.is_active);
    }

    #[test]
    fn parse_missing_required_column() {
        let csv = b"name\n5A\n";
        let err = parse_raw(csv).unwrap_err();
        assert!(matches!(err, CsvFileError::MissingColumn(s) if s == "grade_level"));
    }

    #[test]
    fn parse_row_with_invalid_grade_level() {
        let csv = b"name,grade_level\n5A,abc\n";
        let (rows, _) = parse_raw(csv).unwrap();
        let errs = rows[0].1.as_ref().unwrap_err();
        assert!(errs.iter().any(|m| m.contains("integer")));
    }

    #[test]
    fn resolve_fks_unknown_teacher() {
        let raw = RawClassRow {
            name: "5A".into(),
            grade_level: 5,
            student_count: None,
            class_teacher_abbreviation: Some("XYZ".into()),
            is_active: true,
        };
        let teacher_by_abbr = HashMap::new();
        let err = resolve_fks(raw, &teacher_by_abbr).unwrap_err();
        assert!(err.contains("unknown teacher abbreviation 'XYZ'"));
    }

    #[test]
    fn resolve_fks_known_teacher() {
        let teacher_id = Uuid::new_v4();
        let raw = RawClassRow {
            name: "5A".into(),
            grade_level: 5,
            student_count: None,
            class_teacher_abbreviation: Some("JD".into()),
            is_active: true,
        };
        let mut teacher_by_abbr = HashMap::new();
        teacher_by_abbr.insert("JD".into(), teacher_id);
        let resolved = resolve_fks(raw, &teacher_by_abbr).unwrap();
        assert_eq!(resolved.class_teacher_id, Some(teacher_id));
    }

    #[test]
    fn diff_row_create_when_no_existing() {
        let parsed = ClassRow {
            name: "5A".into(),
            grade_level: 5,
            student_count: None,
            class_teacher_id: None,
            class_teacher_abbreviation: None,
            is_active: true,
        };
        let (_, teacher_abbr_by_id) = empty_teacher_maps();
        let row = diff_row(2, &parsed, None, &teacher_abbr_by_id);
        assert_eq!(row.action, RowAction::Create);
    }

    #[test]
    fn diff_row_unchanged_when_identical() {
        let existing = school_classes::Model {
            grade_level: 5,
            student_count: None,
            class_teacher_id: None,
            is_active: true,
            ..fake_existing("5A")
        };
        let parsed = ClassRow {
            name: "5A".into(),
            grade_level: 5,
            student_count: None,
            class_teacher_id: None,
            class_teacher_abbreviation: None,
            is_active: true,
        };
        let (_, teacher_abbr_by_id) = empty_teacher_maps();
        let row = diff_row(2, &parsed, Some(&existing), &teacher_abbr_by_id);
        assert_eq!(row.action, RowAction::Unchanged);
    }

    #[test]
    fn diff_row_update_when_grade_differs() {
        let existing = fake_existing("5A"); // grade_level = 5
        let parsed = ClassRow {
            name: "5A".into(),
            grade_level: 6,
            student_count: Some(25),
            class_teacher_id: None,
            class_teacher_abbreviation: None,
            is_active: true,
        };
        let (_, teacher_abbr_by_id) = empty_teacher_maps();
        let row = diff_row(2, &parsed, Some(&existing), &teacher_abbr_by_id);
        assert_eq!(row.action, RowAction::Update);
        assert!(row.diff.unwrap().get("grade_level").is_some());
    }

    #[test]
    fn diff_row_teacher_shows_abbreviation_in_diff() {
        let teacher_id = Uuid::new_v4();
        let existing = school_classes::Model {
            class_teacher_id: Some(teacher_id),
            grade_level: 5,
            student_count: None,
            is_active: true,
            ..fake_existing("5A")
        };
        let parsed = ClassRow {
            name: "5A".into(),
            grade_level: 5,
            student_count: None,
            class_teacher_id: None,
            class_teacher_abbreviation: None,
            is_active: true,
        };
        let mut teacher_abbr_by_id = HashMap::new();
        teacher_abbr_by_id.insert(teacher_id, "JD".into());
        let row = diff_row(2, &parsed, Some(&existing), &teacher_abbr_by_id);
        assert_eq!(row.action, RowAction::Update);
        let diff = row.diff.unwrap();
        let teacher_diff = diff.get("class_teacher_abbreviation").unwrap();
        assert_eq!(teacher_diff[0], "JD");
    }
}
