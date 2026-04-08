//! CSV import/export for rooms. Natural key: `name`.
//!
//! Columns (export order):
//!   name, building, capacity, max_concurrent, is_active

use crate::models::_entities::rooms;
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

const REQUIRED: &[&str] = &["name"];

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RoomRow {
    pub name: String,
    pub building: Option<String>,
    pub capacity: Option<i32>,
    pub max_concurrent: i16,
    pub is_active: bool,
}

/// Parse a CSV body into typed rows. Returns rows + per-line errors and the
/// header warnings.
#[allow(clippy::type_complexity)]
pub fn parse(
    bytes: &[u8],
) -> Result<(Vec<(usize, Result<RoomRow, Vec<String>>)>, Vec<String>), CsvFileError> {
    let (header, rows) = parse_csv(bytes)?;
    let warnings = check_required(&header, REQUIRED)?;
    let mut out = Vec::new();
    for (i, row) in rows.iter().enumerate() {
        let line = i + 2; // header is line 1
        let mut errors = Vec::new();

        let name = cell(&header, row, "name").unwrap_or("").to_string();

        if name.is_empty() {
            errors.push("name is required".into());
        }

        let building = cell(&header, row, "building")
            .map(str::to_string)
            .filter(|s| !s.is_empty());

        let capacity = match cell(&header, row, "capacity").unwrap_or("").trim() {
            "" => None,
            s => match parse_i32(s) {
                Ok(v) => Some(v),
                Err(e) => {
                    errors.push(e);
                    None
                }
            },
        };

        let max_concurrent = match cell(&header, row, "max_concurrent").unwrap_or("").trim() {
            "" => 1,
            s => parse_i16(s).unwrap_or_else(|e| {
                errors.push(e);
                1
            }),
        };

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
                Ok(RoomRow {
                    name,
                    building,
                    capacity,
                    max_concurrent,
                    is_active,
                }),
            ));
        } else {
            out.push((line, Err(errors)));
        }
    }
    Ok((out, warnings))
}

/// Compare a parsed row to an existing DB row, producing a `PreviewRow`.
pub fn diff_row(line: usize, parsed: &RoomRow, existing: Option<&rooms::Model>) -> PreviewRow {
    let data = json!({
        "name": parsed.name,
        "building": parsed.building,
        "capacity": parsed.capacity,
        "max_concurrent": parsed.max_concurrent,
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
            if m.building != parsed.building {
                diff.insert("building".into(), json!([m.building, parsed.building]));
            }
            if m.capacity != parsed.capacity {
                diff.insert("capacity".into(), json!([m.capacity, parsed.capacity]));
            }
            if m.max_concurrent != parsed.max_concurrent {
                diff.insert(
                    "max_concurrent".into(),
                    json!([m.max_concurrent, parsed.max_concurrent]),
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
    let (parsed, file_warnings) = parse(bytes)?;

    let existing: Vec<rooms::Model> = rooms::Entity::find()
        .filter(rooms::Column::SchoolId.eq(school_id))
        .filter(rooms::Column::IsActive.eq(true))
        .all(db)
        .await
        .map_err(|e| CsvFileError::Parse(e.to_string()))?;
    let by_name: HashMap<String, rooms::Model> =
        existing.into_iter().map(|m| (m.name.clone(), m)).collect();

    let mut rows = Vec::new();
    for (line, result) in parsed {
        match result {
            Ok(parsed) => {
                let existing = by_name.get(&parsed.name);
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
                let data: RoomRow =
                    serde_json::from_value(row.data.clone().unwrap()).map_err(|e| RowError {
                        line: row.line,
                        messages: vec![e.to_string()],
                    })?;
                let am = rooms::ActiveModel {
                    id: Set(Uuid::new_v4()),
                    school_id: Set(school_id),
                    name: Set(data.name),
                    building: Set(data.building),
                    capacity: Set(data.capacity),
                    max_concurrent: Set(data.max_concurrent),
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
                let data: RoomRow =
                    serde_json::from_value(row.data.clone().unwrap()).map_err(|e| RowError {
                        line: row.line,
                        messages: vec![e.to_string()],
                    })?;
                let existing = rooms::Entity::find()
                    .filter(rooms::Column::SchoolId.eq(school_id))
                    .filter(rooms::Column::Name.eq(data.name.clone()))
                    .filter(rooms::Column::IsActive.eq(true))
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
                let mut am: rooms::ActiveModel = existing.into();
                am.building = Set(data.building);
                am.capacity = Set(data.capacity);
                am.max_concurrent = Set(data.max_concurrent);
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

/// Render all active rooms for a school as CSV bytes.
pub async fn export_csv(
    db: &DatabaseConnection,
    school_id: Uuid,
) -> Result<Vec<u8>, sea_orm::DbErr> {
    let mut items = rooms::Entity::find()
        .filter(rooms::Column::SchoolId.eq(school_id))
        .filter(rooms::Column::IsActive.eq(true))
        .all(db)
        .await?;
    items.sort_by(|a, b| a.name.cmp(&b.name));

    let mut wtr = csv::Writer::from_writer(vec![]);
    wtr.write_record([
        "name",
        "building",
        "capacity",
        "max_concurrent",
        "is_active",
    ])
    .unwrap();
    for m in items {
        wtr.write_record([
            m.name.as_str(),
            m.building.as_deref().unwrap_or(""),
            &m.capacity.map(|c| c.to_string()).unwrap_or_default(),
            &m.max_concurrent.to_string(),
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

    fn fake_existing(name: &str) -> rooms::Model {
        rooms::Model {
            id: Uuid::new_v4(),
            school_id: Uuid::new_v4(),
            name: name.into(),
            building: Some("Main".into()),
            capacity: Some(30),
            max_concurrent: 1,
            is_active: true,
            created_at: Utc::now().into(),
            updated_at: Utc::now().into(),
        }
    }

    #[test]
    fn parse_minimum_columns() {
        let csv = b"name\nRoom 101\n";
        let (rows, warnings) = parse(csv).unwrap();
        assert!(warnings.is_empty());
        assert_eq!(rows.len(), 1);
        let parsed = rows[0].1.as_ref().unwrap();
        assert_eq!(parsed.name, "Room 101");
        assert!(parsed.building.is_none());
        assert!(parsed.capacity.is_none());
        assert_eq!(parsed.max_concurrent, 1); // default
        assert!(parsed.is_active); // default
    }

    #[test]
    fn parse_missing_required_column() {
        let csv = b"building\nMain\n";
        let err = parse(csv).unwrap_err();
        assert!(matches!(err, CsvFileError::MissingColumn(s) if s == "name"));
    }

    #[test]
    fn parse_row_with_invalid_capacity() {
        let csv = b"name,capacity\nRoom 101,abc\n";
        let (rows, _) = parse(csv).unwrap();
        let errs = rows[0].1.as_ref().unwrap_err();
        assert!(errs.iter().any(|m| m.contains("integer")));
    }

    #[test]
    fn diff_row_create_when_no_existing() {
        let parsed = RoomRow {
            name: "Lab 1".into(),
            building: None,
            capacity: None,
            max_concurrent: 1,
            is_active: true,
        };
        let row = diff_row(2, &parsed, None);
        assert_eq!(row.action, RowAction::Create);
    }

    #[test]
    fn diff_row_unchanged_when_identical() {
        let existing = rooms::Model {
            building: None,
            capacity: None,
            max_concurrent: 1,
            is_active: true,
            ..fake_existing("Lab 1")
        };
        let parsed = RoomRow {
            name: "Lab 1".into(),
            building: None,
            capacity: None,
            max_concurrent: 1,
            is_active: true,
        };
        let row = diff_row(2, &parsed, Some(&existing));
        assert_eq!(row.action, RowAction::Unchanged);
    }

    #[test]
    fn diff_row_update_when_field_differs() {
        let existing = fake_existing("Lab 1"); // capacity = Some(30)
        let parsed = RoomRow {
            name: "Lab 1".into(),
            building: Some("Main".into()),
            capacity: Some(25),
            max_concurrent: 1,
            is_active: true,
        };
        let row = diff_row(2, &parsed, Some(&existing));
        assert_eq!(row.action, RowAction::Update);
        assert!(row.diff.unwrap().get("capacity").is_some());
    }
}
