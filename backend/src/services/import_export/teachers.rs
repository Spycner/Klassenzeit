//! CSV import/export for teachers. Natural key: `abbreviation`.
//!
//! Columns (export order):
//!   first_name, last_name, abbreviation, email,
//!   max_hours_per_week, is_part_time

use crate::models::_entities::teachers;
use crate::services::import_export::csv_io::{
    cell, check_required, parse_bool, parse_csv, parse_i32, CsvFileError, RowError,
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

const REQUIRED: &[&str] = &["first_name", "last_name", "abbreviation"];

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TeacherRow {
    pub first_name: String,
    pub last_name: String,
    pub abbreviation: String,
    pub email: Option<String>,
    pub max_hours_per_week: i32,
    pub is_part_time: bool,
}

/// Parse a CSV body into typed rows. Returns rows + per-line errors and the
/// header warnings.
#[allow(clippy::type_complexity)]
pub fn parse(
    bytes: &[u8],
) -> Result<(Vec<(usize, Result<TeacherRow, Vec<String>>)>, Vec<String>), CsvFileError> {
    let (header, rows) = parse_csv(bytes)?;
    let warnings = check_required(&header, REQUIRED)?;
    let mut out = Vec::new();
    for (i, row) in rows.iter().enumerate() {
        let line = i + 2; // header is line 1
        let mut errors = Vec::new();

        let first_name = cell(&header, row, "first_name").unwrap_or("").to_string();
        let last_name = cell(&header, row, "last_name").unwrap_or("").to_string();
        let abbreviation = cell(&header, row, "abbreviation").unwrap_or("").to_string();

        if first_name.is_empty() {
            errors.push("first_name is required".into());
        }
        if last_name.is_empty() {
            errors.push("last_name is required".into());
        }
        if abbreviation.is_empty() {
            errors.push("abbreviation is required".into());
        }

        let email = cell(&header, row, "email")
            .map(str::to_string)
            .filter(|s| !s.is_empty());

        let max_hours_per_week = match cell(&header, row, "max_hours_per_week")
            .unwrap_or("")
            .trim()
        {
            "" => 28,
            s => parse_i32(s).unwrap_or_else(|e| {
                errors.push(e);
                0
            }),
        };

        let is_part_time = match cell(&header, row, "is_part_time").unwrap_or("").trim() {
            "" => false,
            s => parse_bool(s).unwrap_or_else(|e| {
                errors.push(e);
                false
            }),
        };

        if errors.is_empty() {
            out.push((
                line,
                Ok(TeacherRow {
                    first_name,
                    last_name,
                    abbreviation,
                    email,
                    max_hours_per_week,
                    is_part_time,
                }),
            ));
        } else {
            out.push((line, Err(errors)));
        }
    }
    Ok((out, warnings))
}

/// Compare a parsed row to an existing DB row, producing a `PreviewRow`.
pub fn diff_row(
    line: usize,
    parsed: &TeacherRow,
    existing: Option<&teachers::Model>,
) -> PreviewRow {
    let data = json!({
        "first_name": parsed.first_name,
        "last_name": parsed.last_name,
        "abbreviation": parsed.abbreviation,
        "email": parsed.email,
        "max_hours_per_week": parsed.max_hours_per_week,
        "is_part_time": parsed.is_part_time,
    });

    match existing {
        None => PreviewRow {
            line,
            action: RowAction::Create,
            natural_key: parsed.abbreviation.clone(),
            data: Some(data),
            diff: None,
            errors: vec![],
            warnings: vec![],
        },
        Some(m) => {
            let mut diff = serde_json::Map::new();
            if m.first_name != parsed.first_name {
                diff.insert(
                    "first_name".into(),
                    json!([m.first_name, parsed.first_name]),
                );
            }
            if m.last_name != parsed.last_name {
                diff.insert("last_name".into(), json!([m.last_name, parsed.last_name]));
            }
            if m.email != parsed.email {
                diff.insert("email".into(), json!([m.email, parsed.email]));
            }
            if m.max_hours_per_week != parsed.max_hours_per_week {
                diff.insert(
                    "max_hours_per_week".into(),
                    json!([m.max_hours_per_week, parsed.max_hours_per_week]),
                );
            }
            if m.is_part_time != parsed.is_part_time {
                diff.insert(
                    "is_part_time".into(),
                    json!([m.is_part_time, parsed.is_part_time]),
                );
            }
            if diff.is_empty() {
                PreviewRow {
                    line,
                    action: RowAction::Unchanged,
                    natural_key: parsed.abbreviation.clone(),
                    data: Some(data),
                    diff: None,
                    errors: vec![],
                    warnings: vec![],
                }
            } else {
                PreviewRow {
                    line,
                    action: RowAction::Update,
                    natural_key: parsed.abbreviation.clone(),
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
    let (parsed, file_warnings) = parse(bytes)?;

    let existing: Vec<teachers::Model> = teachers::Entity::find()
        .filter(teachers::Column::SchoolId.eq(school_id))
        .filter(teachers::Column::IsActive.eq(true))
        .all(db)
        .await
        .map_err(|e| CsvFileError::Parse(e.to_string()))?;
    let by_abbr: HashMap<String, teachers::Model> = existing
        .into_iter()
        .map(|m| (m.abbreviation.clone(), m))
        .collect();

    let mut rows = Vec::new();
    for (line, result) in parsed {
        match result {
            Ok(parsed) => {
                let existing = by_abbr.get(&parsed.abbreviation);
                rows.push(diff_row(line, &parsed, existing));
            }
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
                let data: TeacherRow =
                    serde_json::from_value(row.data.clone().unwrap()).map_err(|e| RowError {
                        line: row.line,
                        messages: vec![e.to_string()],
                    })?;
                let am = teachers::ActiveModel {
                    id: Set(Uuid::new_v4()),
                    school_id: Set(school_id),
                    first_name: Set(data.first_name),
                    last_name: Set(data.last_name),
                    abbreviation: Set(data.abbreviation),
                    email: Set(data.email),
                    max_hours_per_week: Set(data.max_hours_per_week),
                    is_part_time: Set(data.is_part_time),
                    is_active: Set(true),
                    created_at: Set(now),
                    updated_at: Set(now),
                };
                am.insert(txn).await.map_err(|e| RowError {
                    line: row.line,
                    messages: vec![e.to_string()],
                })?;
            }
            RowAction::Update => {
                let data: TeacherRow =
                    serde_json::from_value(row.data.clone().unwrap()).map_err(|e| RowError {
                        line: row.line,
                        messages: vec![e.to_string()],
                    })?;
                let existing = teachers::Entity::find()
                    .filter(teachers::Column::SchoolId.eq(school_id))
                    .filter(teachers::Column::Abbreviation.eq(data.abbreviation.clone()))
                    .filter(teachers::Column::IsActive.eq(true))
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
                let mut am: teachers::ActiveModel = existing.into();
                am.first_name = Set(data.first_name);
                am.last_name = Set(data.last_name);
                am.email = Set(data.email);
                am.max_hours_per_week = Set(data.max_hours_per_week);
                am.is_part_time = Set(data.is_part_time);
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

/// Render all teachers for a school as CSV bytes.
pub async fn export_csv(
    db: &DatabaseConnection,
    school_id: Uuid,
) -> Result<Vec<u8>, sea_orm::DbErr> {
    let mut items = teachers::Entity::find()
        .filter(teachers::Column::SchoolId.eq(school_id))
        .filter(teachers::Column::IsActive.eq(true))
        .all(db)
        .await?;
    items.sort_by(|a, b| a.abbreviation.cmp(&b.abbreviation));

    let mut wtr = csv::Writer::from_writer(vec![]);
    wtr.write_record([
        "first_name",
        "last_name",
        "abbreviation",
        "email",
        "max_hours_per_week",
        "is_part_time",
    ])
    .unwrap();
    for m in items {
        wtr.write_record([
            m.first_name.as_str(),
            m.last_name.as_str(),
            m.abbreviation.as_str(),
            m.email.as_deref().unwrap_or(""),
            &m.max_hours_per_week.to_string(),
            if m.is_part_time { "true" } else { "false" },
        ])
        .unwrap();
    }
    Ok(wtr.into_inner().unwrap())
}

#[allow(unused_imports)]
#[cfg(test)]
mod tests {
    use super::*;

    fn fake_existing(abbr: &str) -> teachers::Model {
        teachers::Model {
            id: Uuid::new_v4(),
            school_id: Uuid::new_v4(),
            first_name: "Old".into(),
            last_name: "Name".into(),
            email: Some("old@example.com".into()),
            abbreviation: abbr.into(),
            max_hours_per_week: 28,
            is_part_time: false,
            is_active: true,
            created_at: Utc::now().into(),
            updated_at: Utc::now().into(),
        }
    }

    #[test]
    fn parse_minimum_columns() {
        let csv = b"first_name,last_name,abbreviation\nJane,Doe,JD\n";
        let (rows, warnings) = parse(csv).unwrap();
        assert!(warnings.is_empty());
        assert_eq!(rows.len(), 1);
        let parsed = rows[0].1.as_ref().unwrap();
        assert_eq!(parsed.abbreviation, "JD");
        assert_eq!(parsed.max_hours_per_week, 28); // default
        assert!(!parsed.is_part_time);
        assert!(parsed.email.is_none());
    }

    #[test]
    fn parse_missing_required_column() {
        let csv = b"first_name,last_name\nJane,Doe\n";
        let err = parse(csv).unwrap_err();
        assert!(matches!(err, CsvFileError::MissingColumn(s) if s == "abbreviation"));
    }

    #[test]
    fn parse_row_with_invalid_int() {
        let csv = b"first_name,last_name,abbreviation,max_hours_per_week\nJane,Doe,JD,abc\n";
        let (rows, _) = parse(csv).unwrap();
        let errs = rows[0].1.as_ref().unwrap_err();
        assert!(errs.iter().any(|m| m.contains("integer")));
    }

    #[test]
    fn diff_row_create_when_no_existing() {
        let parsed = TeacherRow {
            first_name: "Jane".into(),
            last_name: "Doe".into(),
            abbreviation: "JD".into(),
            email: None,
            max_hours_per_week: 28,
            is_part_time: false,
        };
        let row = diff_row(2, &parsed, None);
        assert_eq!(row.action, RowAction::Create);
    }

    #[test]
    fn diff_row_unchanged_when_identical() {
        let existing = teachers::Model {
            first_name: "Jane".into(),
            last_name: "Doe".into(),
            abbreviation: "JD".into(),
            email: None,
            max_hours_per_week: 28,
            is_part_time: false,
            ..fake_existing("JD")
        };
        let parsed = TeacherRow {
            first_name: "Jane".into(),
            last_name: "Doe".into(),
            abbreviation: "JD".into(),
            email: None,
            max_hours_per_week: 28,
            is_part_time: false,
        };
        let row = diff_row(2, &parsed, Some(&existing));
        assert_eq!(row.action, RowAction::Unchanged);
    }

    #[test]
    fn diff_row_update_when_field_differs() {
        let existing = fake_existing("JD"); // first_name = "Old"
        let parsed = TeacherRow {
            first_name: "Jane".into(),
            last_name: "Name".into(),
            abbreviation: "JD".into(),
            email: Some("old@example.com".into()),
            max_hours_per_week: 28,
            is_part_time: false,
        };
        let row = diff_row(2, &parsed, Some(&existing));
        assert_eq!(row.action, RowAction::Update);
        assert!(row.diff.unwrap().get("first_name").is_some());
    }
}
