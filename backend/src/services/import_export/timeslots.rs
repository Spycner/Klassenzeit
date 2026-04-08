//! CSV import/export for time slots. Natural key: `"{day_of_week}-{period}"`.
//!
//! Columns (export order):
//!   day_of_week, period, start_time, end_time, is_break, label
//!
//! Time slots are hard-deleted (no is_active column).

use crate::models::_entities::time_slots;
use crate::services::import_export::csv_io::{
    cell, check_required, parse_bool, parse_csv, parse_i16, parse_time, CsvFileError, RowError,
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

const REQUIRED: &[&str] = &["day_of_week", "period", "start_time", "end_time"];

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TimeslotRow {
    pub day_of_week: i16,
    pub period: i16,
    pub start_time: String, // stored as HH:MM string for JSON serialization
    pub end_time: String,
    pub is_break: bool,
    pub label: Option<String>,
}

impl TimeslotRow {
    pub fn natural_key(&self) -> String {
        format!("{}-{}", self.day_of_week, self.period)
    }
}

/// Parse a CSV body into typed rows. Returns rows + per-line errors and the
/// header warnings.
#[allow(clippy::type_complexity)]
pub fn parse(
    bytes: &[u8],
) -> Result<(Vec<(usize, Result<TimeslotRow, Vec<String>>)>, Vec<String>), CsvFileError> {
    let (header, rows) = parse_csv(bytes)?;
    let warnings = check_required(&header, REQUIRED)?;
    let mut out = Vec::new();
    for (i, row) in rows.iter().enumerate() {
        let line = i + 2;
        let mut errors = Vec::new();

        let day_of_week_str = cell(&header, row, "day_of_week")
            .unwrap_or("")
            .trim()
            .to_string();
        let period_str = cell(&header, row, "period")
            .unwrap_or("")
            .trim()
            .to_string();
        let start_time_str = cell(&header, row, "start_time")
            .unwrap_or("")
            .trim()
            .to_string();
        let end_time_str = cell(&header, row, "end_time")
            .unwrap_or("")
            .trim()
            .to_string();

        let day_of_week = if day_of_week_str.is_empty() {
            errors.push("day_of_week is required".into());
            0
        } else {
            parse_i16(&day_of_week_str).unwrap_or_else(|e| {
                errors.push(e);
                0
            })
        };

        if day_of_week != 0 && !(1..=7).contains(&day_of_week) {
            errors.push(format!(
                "day_of_week must be between 1 and 7, got {day_of_week}"
            ));
        }

        let period = if period_str.is_empty() {
            errors.push("period is required".into());
            0
        } else {
            parse_i16(&period_str).unwrap_or_else(|e| {
                errors.push(e);
                0
            })
        };

        if period < 0 {
            errors.push(format!("period must be >= 0, got {period}"));
        }

        let start_time = if start_time_str.is_empty() {
            errors.push("start_time is required".into());
            String::new()
        } else {
            match parse_time(&start_time_str) {
                Ok(_) => start_time_str,
                Err(e) => {
                    errors.push(e);
                    String::new()
                }
            }
        };

        let end_time = if end_time_str.is_empty() {
            errors.push("end_time is required".into());
            String::new()
        } else {
            match parse_time(&end_time_str) {
                Ok(_) => end_time_str,
                Err(e) => {
                    errors.push(e);
                    String::new()
                }
            }
        };

        let is_break = match cell(&header, row, "is_break").unwrap_or("").trim() {
            "" => false,
            s => parse_bool(s).unwrap_or_else(|e| {
                errors.push(e);
                false
            }),
        };

        let label = cell(&header, row, "label")
            .map(str::to_string)
            .filter(|s| !s.is_empty());

        if errors.is_empty() {
            out.push((
                line,
                Ok(TimeslotRow {
                    day_of_week,
                    period,
                    start_time,
                    end_time,
                    is_break,
                    label,
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
    parsed: &TimeslotRow,
    existing: Option<&time_slots::Model>,
) -> PreviewRow {
    let data = json!({
        "day_of_week": parsed.day_of_week,
        "period": parsed.period,
        "start_time": parsed.start_time,
        "end_time": parsed.end_time,
        "is_break": parsed.is_break,
        "label": parsed.label,
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
            let existing_start = m.start_time.format("%H:%M").to_string();
            let existing_end = m.end_time.format("%H:%M").to_string();
            let mut diff = serde_json::Map::new();
            if existing_start != parsed.start_time {
                diff.insert(
                    "start_time".into(),
                    json!([existing_start, parsed.start_time]),
                );
            }
            if existing_end != parsed.end_time {
                diff.insert("end_time".into(), json!([existing_end, parsed.end_time]));
            }
            if m.is_break != parsed.is_break {
                diff.insert("is_break".into(), json!([m.is_break, parsed.is_break]));
            }
            if m.label != parsed.label {
                diff.insert("label".into(), json!([m.label, parsed.label]));
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
    bytes: &[u8],
) -> Result<(Vec<PreviewRow>, Vec<String>), CsvFileError> {
    let (parsed, file_warnings) = parse(bytes)?;

    // Time slots have no is_active — load all
    let existing: Vec<time_slots::Model> = time_slots::Entity::find()
        .filter(time_slots::Column::SchoolId.eq(school_id))
        .all(db)
        .await
        .map_err(|e| CsvFileError::Parse(e.to_string()))?;
    // Key: "{day}-{period}"
    let by_key: HashMap<String, time_slots::Model> = existing
        .into_iter()
        .map(|m| (format!("{}-{}", m.day_of_week, m.period), m))
        .collect();

    let mut rows = Vec::new();
    for (line, result) in parsed {
        match result {
            Ok(parsed) => {
                let key = parsed.natural_key();
                let existing = by_key.get(&key);
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
                let data: TimeslotRow =
                    serde_json::from_value(row.data.clone().unwrap()).map_err(|e| RowError {
                        line: row.line,
                        messages: vec![e.to_string()],
                    })?;
                let start = parse_time(&data.start_time).map_err(|e| RowError {
                    line: row.line,
                    messages: vec![e],
                })?;
                let end = parse_time(&data.end_time).map_err(|e| RowError {
                    line: row.line,
                    messages: vec![e],
                })?;
                let am = time_slots::ActiveModel {
                    id: Set(Uuid::new_v4()),
                    school_id: Set(school_id),
                    day_of_week: Set(data.day_of_week),
                    period: Set(data.period),
                    start_time: Set(start),
                    end_time: Set(end),
                    is_break: Set(data.is_break),
                    label: Set(data.label),
                    created_at: Set(now),
                    updated_at: Set(now),
                };
                am.insert(txn).await.map_err(|e| RowError {
                    line: row.line,
                    messages: vec![e.to_string()],
                })?;
            }
            RowAction::Update => {
                let data: TimeslotRow =
                    serde_json::from_value(row.data.clone().unwrap()).map_err(|e| RowError {
                        line: row.line,
                        messages: vec![e.to_string()],
                    })?;
                let start = parse_time(&data.start_time).map_err(|e| RowError {
                    line: row.line,
                    messages: vec![e],
                })?;
                let end = parse_time(&data.end_time).map_err(|e| RowError {
                    line: row.line,
                    messages: vec![e],
                })?;
                let existing = time_slots::Entity::find()
                    .filter(time_slots::Column::SchoolId.eq(school_id))
                    .filter(time_slots::Column::DayOfWeek.eq(data.day_of_week))
                    .filter(time_slots::Column::Period.eq(data.period))
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
                let mut am: time_slots::ActiveModel = existing.into();
                am.start_time = Set(start);
                am.end_time = Set(end);
                am.is_break = Set(data.is_break);
                am.label = Set(data.label);
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

/// Render all time slots for a school as CSV bytes.
pub async fn export_csv(
    db: &DatabaseConnection,
    school_id: Uuid,
) -> Result<Vec<u8>, sea_orm::DbErr> {
    let mut items = time_slots::Entity::find()
        .filter(time_slots::Column::SchoolId.eq(school_id))
        .all(db)
        .await?;
    items.sort_by(|a, b| {
        a.day_of_week
            .cmp(&b.day_of_week)
            .then(a.period.cmp(&b.period))
    });

    let mut wtr = csv::Writer::from_writer(vec![]);
    wtr.write_record([
        "day_of_week",
        "period",
        "start_time",
        "end_time",
        "is_break",
        "label",
    ])
    .unwrap();
    for m in items {
        wtr.write_record([
            m.day_of_week.to_string(),
            m.period.to_string(),
            m.start_time.format("%H:%M").to_string(),
            m.end_time.format("%H:%M").to_string(),
            (if m.is_break { "true" } else { "false" }).to_string(),
            m.label.unwrap_or_default(),
        ])
        .unwrap();
    }
    Ok(wtr.into_inner().unwrap())
}

#[allow(unused_imports)]
#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveTime;

    fn fake_existing(day: i16, period: i16) -> time_slots::Model {
        time_slots::Model {
            id: Uuid::new_v4(),
            school_id: Uuid::new_v4(),
            day_of_week: day,
            period,
            start_time: NaiveTime::from_hms_opt(8, 0, 0).unwrap(),
            end_time: NaiveTime::from_hms_opt(8, 45, 0).unwrap(),
            is_break: false,
            label: None,
            created_at: Utc::now().into(),
            updated_at: Utc::now().into(),
        }
    }

    #[test]
    fn parse_minimum_columns() {
        let csv = b"day_of_week,period,start_time,end_time\n1,1,08:00,08:45\n";
        let (rows, warnings) = parse(csv).unwrap();
        assert!(warnings.is_empty());
        assert_eq!(rows.len(), 1);
        let parsed = rows[0].1.as_ref().unwrap();
        assert_eq!(parsed.day_of_week, 1);
        assert_eq!(parsed.period, 1);
        assert_eq!(parsed.start_time, "08:00");
        assert_eq!(parsed.end_time, "08:45");
        assert!(!parsed.is_break);
        assert!(parsed.label.is_none());
    }

    #[test]
    fn parse_missing_required_column() {
        let csv = b"day_of_week,period,start_time\n1,1,08:00\n";
        let err = parse(csv).unwrap_err();
        assert!(matches!(err, CsvFileError::MissingColumn(s) if s == "end_time"));
    }

    #[test]
    fn parse_row_with_invalid_day_of_week() {
        let csv = b"day_of_week,period,start_time,end_time\n8,1,08:00,08:45\n";
        let (rows, _) = parse(csv).unwrap();
        let errs = rows[0].1.as_ref().unwrap_err();
        assert!(errs.iter().any(|m| m.contains("day_of_week")));
    }

    #[test]
    fn parse_row_with_invalid_time() {
        let csv = b"day_of_week,period,start_time,end_time\n1,1,badtime,08:45\n";
        let (rows, _) = parse(csv).unwrap();
        let errs = rows[0].1.as_ref().unwrap_err();
        assert!(errs.iter().any(|m| m.contains("HH:MM")));
    }

    #[test]
    fn natural_key_format() {
        let row = TimeslotRow {
            day_of_week: 3,
            period: 5,
            start_time: "10:00".into(),
            end_time: "10:45".into(),
            is_break: false,
            label: None,
        };
        assert_eq!(row.natural_key(), "3-5");
    }

    #[test]
    fn diff_row_create_when_no_existing() {
        let parsed = TimeslotRow {
            day_of_week: 1,
            period: 1,
            start_time: "08:00".into(),
            end_time: "08:45".into(),
            is_break: false,
            label: None,
        };
        let row = diff_row(2, &parsed, None);
        assert_eq!(row.action, RowAction::Create);
        assert_eq!(row.natural_key, "1-1");
    }

    #[test]
    fn diff_row_unchanged_when_identical() {
        let existing = fake_existing(1, 1); // start=08:00, end=08:45
        let parsed = TimeslotRow {
            day_of_week: 1,
            period: 1,
            start_time: "08:00".into(),
            end_time: "08:45".into(),
            is_break: false,
            label: None,
        };
        let row = diff_row(2, &parsed, Some(&existing));
        assert_eq!(row.action, RowAction::Unchanged);
    }

    #[test]
    fn diff_row_update_when_time_differs() {
        let existing = fake_existing(1, 1); // end=08:45
        let parsed = TimeslotRow {
            day_of_week: 1,
            period: 1,
            start_time: "08:00".into(),
            end_time: "09:00".into(),
            is_break: false,
            label: None,
        };
        let row = diff_row(2, &parsed, Some(&existing));
        assert_eq!(row.action, RowAction::Update);
        assert!(row.diff.unwrap().get("end_time").is_some());
    }
}
