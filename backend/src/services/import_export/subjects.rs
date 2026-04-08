//! CSV import/export for subjects. Natural key: `abbreviation`.
//!
//! Columns (export order):
//!   name, abbreviation, color, needs_special_room

use crate::models::_entities::subjects;
use crate::services::import_export::csv_io::{
    cell, check_required, parse_bool, parse_csv, CsvFileError, RowError,
};
use crate::services::import_export::{PreviewRow, RowAction};
use chrono::Utc;
use regex::Regex;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, DatabaseConnection, DatabaseTransaction, EntityTrait,
    QueryFilter, Set,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::sync::OnceLock;
use uuid::Uuid;

const REQUIRED: &[&str] = &["name", "abbreviation"];

static COLOR_RE: OnceLock<Regex> = OnceLock::new();

fn color_regex() -> &'static Regex {
    COLOR_RE.get_or_init(|| Regex::new(r"^#[0-9a-fA-F]{6}$").unwrap())
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SubjectRow {
    pub name: String,
    pub abbreviation: String,
    pub color: Option<String>,
    pub needs_special_room: bool,
}

/// Parse a CSV body into typed rows. Returns rows + per-line errors and the
/// header warnings.
#[allow(clippy::type_complexity)]
pub fn parse(
    bytes: &[u8],
) -> Result<(Vec<(usize, Result<SubjectRow, Vec<String>>)>, Vec<String>), CsvFileError> {
    let (header, rows) = parse_csv(bytes)?;
    let warnings = check_required(&header, REQUIRED)?;
    let mut out = Vec::new();
    for (i, row) in rows.iter().enumerate() {
        let line = i + 2; // header is line 1
        let mut errors = Vec::new();

        let name = cell(&header, row, "name").unwrap_or("").to_string();
        let abbreviation = cell(&header, row, "abbreviation").unwrap_or("").to_string();

        if name.is_empty() {
            errors.push("name is required".into());
        }
        if abbreviation.is_empty() {
            errors.push("abbreviation is required".into());
        }

        let color = cell(&header, row, "color")
            .map(str::to_string)
            .filter(|s| !s.is_empty());

        if let Some(ref c) = color {
            if !color_regex().is_match(c) {
                errors.push(format!(
                    "color must be a 6-digit hex color (e.g. #1A2B3C), got '{c}'"
                ));
            }
        }

        let needs_special_room = match cell(&header, row, "needs_special_room")
            .unwrap_or("")
            .trim()
        {
            "" => false,
            s => parse_bool(s).unwrap_or_else(|e| {
                errors.push(e);
                false
            }),
        };

        if errors.is_empty() {
            out.push((
                line,
                Ok(SubjectRow {
                    name,
                    abbreviation,
                    color,
                    needs_special_room,
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
    parsed: &SubjectRow,
    existing: Option<&subjects::Model>,
) -> PreviewRow {
    let data = json!({
        "name": parsed.name,
        "abbreviation": parsed.abbreviation,
        "color": parsed.color,
        "needs_special_room": parsed.needs_special_room,
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
            if m.name != parsed.name {
                diff.insert("name".into(), json!([m.name, parsed.name]));
            }
            if m.color != parsed.color {
                diff.insert("color".into(), json!([m.color, parsed.color]));
            }
            if m.needs_special_room != parsed.needs_special_room {
                diff.insert(
                    "needs_special_room".into(),
                    json!([m.needs_special_room, parsed.needs_special_room]),
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

    // Subjects has no is_active column
    let existing: Vec<subjects::Model> = subjects::Entity::find()
        .filter(subjects::Column::SchoolId.eq(school_id))
        .all(db)
        .await
        .map_err(|e| CsvFileError::Parse(e.to_string()))?;
    let by_abbr: HashMap<String, subjects::Model> = existing
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
                let data: SubjectRow =
                    serde_json::from_value(row.data.clone().unwrap()).map_err(|e| RowError {
                        line: row.line,
                        messages: vec![e.to_string()],
                    })?;
                let am = subjects::ActiveModel {
                    id: Set(Uuid::new_v4()),
                    school_id: Set(school_id),
                    name: Set(data.name),
                    abbreviation: Set(data.abbreviation),
                    color: Set(data.color),
                    needs_special_room: Set(data.needs_special_room),
                    created_at: Set(now),
                    updated_at: Set(now),
                };
                am.insert(txn).await.map_err(|e| RowError {
                    line: row.line,
                    messages: vec![e.to_string()],
                })?;
            }
            RowAction::Update => {
                let data: SubjectRow =
                    serde_json::from_value(row.data.clone().unwrap()).map_err(|e| RowError {
                        line: row.line,
                        messages: vec![e.to_string()],
                    })?;
                let existing = subjects::Entity::find()
                    .filter(subjects::Column::SchoolId.eq(school_id))
                    .filter(subjects::Column::Abbreviation.eq(data.abbreviation.clone()))
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
                let mut am: subjects::ActiveModel = existing.into();
                am.name = Set(data.name);
                am.color = Set(data.color);
                am.needs_special_room = Set(data.needs_special_room);
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

/// Render all subjects for a school as CSV bytes.
pub async fn export_csv(
    db: &DatabaseConnection,
    school_id: Uuid,
) -> Result<Vec<u8>, sea_orm::DbErr> {
    let mut items = subjects::Entity::find()
        .filter(subjects::Column::SchoolId.eq(school_id))
        .all(db)
        .await?;
    items.sort_by(|a, b| a.abbreviation.cmp(&b.abbreviation));

    let mut wtr = csv::Writer::from_writer(vec![]);
    wtr.write_record(["name", "abbreviation", "color", "needs_special_room"])
        .unwrap();
    for m in items {
        wtr.write_record([
            m.name.as_str(),
            m.abbreviation.as_str(),
            m.color.as_deref().unwrap_or(""),
            if m.needs_special_room {
                "true"
            } else {
                "false"
            },
        ])
        .unwrap();
    }
    Ok(wtr.into_inner().unwrap())
}

#[allow(unused_imports)]
#[cfg(test)]
mod tests {
    use super::*;

    fn fake_existing(abbr: &str) -> subjects::Model {
        subjects::Model {
            id: Uuid::new_v4(),
            school_id: Uuid::new_v4(),
            name: "Old Subject".into(),
            abbreviation: abbr.into(),
            color: Some("#FF0000".into()),
            needs_special_room: false,
            created_at: Utc::now().into(),
            updated_at: Utc::now().into(),
        }
    }

    #[test]
    fn parse_minimum_columns() {
        let csv = b"name,abbreviation\nMath,MA\n";
        let (rows, warnings) = parse(csv).unwrap();
        assert!(warnings.is_empty());
        assert_eq!(rows.len(), 1);
        let parsed = rows[0].1.as_ref().unwrap();
        assert_eq!(parsed.abbreviation, "MA");
        assert_eq!(parsed.name, "Math");
        assert!(parsed.color.is_none());
        assert!(!parsed.needs_special_room);
    }

    #[test]
    fn parse_missing_required_column() {
        let csv = b"name\nMath\n";
        let err = parse(csv).unwrap_err();
        assert!(matches!(err, CsvFileError::MissingColumn(s) if s == "abbreviation"));
    }

    #[test]
    fn parse_row_with_invalid_color() {
        let csv = b"name,abbreviation,color\nMath,MA,notacolor\n";
        let (rows, _) = parse(csv).unwrap();
        let errs = rows[0].1.as_ref().unwrap_err();
        assert!(errs.iter().any(|m| m.contains("hex color")));
    }

    #[test]
    fn parse_row_with_valid_color() {
        let csv = b"name,abbreviation,color\nMath,MA,#1A2B3C\n";
        let (rows, _) = parse(csv).unwrap();
        let parsed = rows[0].1.as_ref().unwrap();
        assert_eq!(parsed.color.as_deref(), Some("#1A2B3C"));
    }

    #[test]
    fn diff_row_create_when_no_existing() {
        let parsed = SubjectRow {
            name: "Math".into(),
            abbreviation: "MA".into(),
            color: None,
            needs_special_room: false,
        };
        let row = diff_row(2, &parsed, None);
        assert_eq!(row.action, RowAction::Create);
    }

    #[test]
    fn diff_row_unchanged_when_identical() {
        let existing = subjects::Model {
            name: "Old Subject".into(),
            abbreviation: "OS".into(),
            color: None,
            needs_special_room: false,
            ..fake_existing("OS")
        };
        let parsed = SubjectRow {
            name: "Old Subject".into(),
            abbreviation: "OS".into(),
            color: None,
            needs_special_room: false,
        };
        let row = diff_row(2, &parsed, Some(&existing));
        assert_eq!(row.action, RowAction::Unchanged);
    }

    #[test]
    fn diff_row_update_when_field_differs() {
        let existing = fake_existing("OS"); // name = "Old Subject"
        let parsed = SubjectRow {
            name: "New Subject".into(),
            abbreviation: "OS".into(),
            color: Some("#FF0000".into()),
            needs_special_room: false,
        };
        let row = diff_row(2, &parsed, Some(&existing));
        assert_eq!(row.action, RowAction::Update);
        assert!(row.diff.unwrap().get("name").is_some());
    }
}
