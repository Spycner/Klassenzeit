//! Generic CSV parsing helpers shared across entity importers.

use serde::{Deserialize, Serialize};

/// Errors collected per row during preview parsing/validation.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct RowError {
    pub line: usize,
    pub messages: Vec<String>,
}

/// File-level error returned as 400 before per-row validation.
#[derive(Debug, thiserror::Error)]
pub enum CsvFileError {
    #[error("could not parse CSV: {0}")]
    Parse(String),
    #[error("missing required column: {0}")]
    MissingColumn(String),
    #[error("empty file")]
    Empty,
}

/// Parse a CSV byte buffer into header + data rows.
/// Returns the header as a Vec<String> and each subsequent row as Vec<String>.
pub fn parse_csv(bytes: &[u8]) -> Result<(Vec<String>, Vec<Vec<String>>), CsvFileError> {
    let mut rdr = csv::ReaderBuilder::new()
        .has_headers(true)
        .flexible(true)
        .from_reader(bytes);

    let header: Vec<String> = rdr
        .headers()
        .map_err(|e| CsvFileError::Parse(e.to_string()))?
        .iter()
        .map(|h| h.trim().to_string())
        .collect();

    if header.is_empty() {
        return Err(CsvFileError::Empty);
    }

    let mut rows = Vec::new();
    for rec in rdr.records() {
        let rec = rec.map_err(|e| CsvFileError::Parse(e.to_string()))?;
        rows.push(rec.iter().map(|f| f.trim().to_string()).collect());
    }
    Ok((header, rows))
}

/// Verify the header contains every required column. Unknown columns are
/// reported as warnings, not errors.
pub fn check_required(header: &[String], required: &[&str]) -> Result<Vec<String>, CsvFileError> {
    for r in required {
        if !header.iter().any(|h| h == r) {
            return Err(CsvFileError::MissingColumn((*r).to_string()));
        }
    }
    let known: std::collections::HashSet<&str> = required.iter().copied().collect();
    let warnings = header
        .iter()
        .filter(|h| !known.contains(h.as_str()) && !is_known_optional(h))
        .map(|h| format!("ignored unknown column '{h}'"))
        .collect();
    Ok(warnings)
}

/// Optional columns that are recognized per-entity but not required.
/// Each entity importer extends this via its own column spec; for now we
/// hard-code the union of optional columns to keep the helper simple.
fn is_known_optional(h: &str) -> bool {
    matches!(
        h,
        "email"
            | "max_hours_per_week"
            | "is_part_time"
            | "color"
            | "needs_special_room"
            | "building"
            | "capacity"
            | "max_concurrent"
            | "student_count"
            | "class_teacher_abbreviation"
            | "label"
            | "is_break"
            | "teacher_abbreviation"
    )
}

/// Look up a column value by header name.
pub fn cell<'a>(header: &[String], row: &'a [String], name: &str) -> Option<&'a str> {
    header
        .iter()
        .position(|h| h == name)
        .and_then(|i| row.get(i))
        .map(|s| s.as_str())
}

pub fn parse_bool(s: &str) -> Result<bool, String> {
    match s.to_ascii_lowercase().as_str() {
        "true" | "1" | "yes" => Ok(true),
        "false" | "0" | "no" | "" => Ok(false),
        other => Err(format!("expected boolean, got '{other}'")),
    }
}

pub fn parse_i32(s: &str) -> Result<i32, String> {
    s.parse::<i32>()
        .map_err(|_| format!("expected integer, got '{s}'"))
}

pub fn parse_i16(s: &str) -> Result<i16, String> {
    s.parse::<i16>()
        .map_err(|_| format!("expected integer, got '{s}'"))
}

pub fn parse_time(s: &str) -> Result<chrono::NaiveTime, String> {
    chrono::NaiveTime::parse_from_str(s, "%H:%M")
        .map_err(|_| format!("expected HH:MM time, got '{s}'"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_csv_basic() {
        let csv = b"a,b,c\n1,2,3\n4,5,6\n";
        let (header, rows) = parse_csv(csv).unwrap();
        assert_eq!(header, vec!["a", "b", "c"]);
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0], vec!["1", "2", "3"]);
    }

    #[test]
    fn check_required_passes_when_all_present() {
        let header = vec!["a".into(), "b".into(), "c".into()];
        let warnings = check_required(&header, &["a", "b"]).unwrap();
        // 'c' is not in is_known_optional → warned about.
        assert_eq!(warnings, vec!["ignored unknown column 'c'"]);
    }

    #[test]
    fn check_required_fails_when_missing() {
        let header = vec!["a".into()];
        let err = check_required(&header, &["a", "b"]).unwrap_err();
        assert!(matches!(err, CsvFileError::MissingColumn(s) if s == "b"));
    }

    #[test]
    fn parse_bool_accepts_common_forms() {
        assert!(parse_bool("true").unwrap());
        assert!(parse_bool("True").unwrap());
        assert!(!parse_bool("false").unwrap());
        assert!(!parse_bool("").unwrap());
        assert!(parse_bool("xyz").is_err());
    }

    #[test]
    fn parse_time_hhmm() {
        let t = parse_time("08:30").unwrap();
        assert_eq!(t.format("%H:%M").to_string(), "08:30");
        assert!(parse_time("8:30 PM").is_err());
    }
}
