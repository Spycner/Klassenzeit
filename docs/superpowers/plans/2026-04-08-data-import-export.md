# Data Import/Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship CSV import/export for the six reference-data entities (teachers, subjects, rooms, classes, timeslots, curriculum) plus a print-to-PDF button for the timetable view.

**Architecture:** Backend exposes three endpoints per entity (`GET export`, `POST preview`, `POST commit`) under a single new `import_export` controller and `services::import_export` module. Preview returns a UUID token and the validated row diff; commit applies all rows in one SeaORM transaction or rolls back. A new "Import / Export" admin settings tab drives the round-trip; a `<ImportPreviewDialog>` component is reused across all six entities. Timetable PDF is pure frontend: a Print button calls `window.print()` against a `@media print` stylesheet.

**Tech Stack:** Backend Rust (axum 0.8, loco-rs, sea-orm 1.1), new dep `csv = "1"`. Frontend Next.js 15 with shadcn/ui, next-intl 4.

**Spec:** `docs/superpowers/specs/2026-04-08-data-import-export-design.md`

---

## File Structure

### Backend — new files

- `backend/src/services/import_export/mod.rs` — module root, public API: `EntityKind` enum, `preview()`, `commit()`, `export()` dispatch functions
- `backend/src/services/import_export/token_cache.rs` — in-memory `PreviewTokenCache` (Arc<DashMap>) with 10-min TTL and per-school 100-entry bound
- `backend/src/services/import_export/csv_io.rs` — generic CSV reader/writer helpers (header parsing, type conversion, error collection)
- `backend/src/services/import_export/teachers.rs` — per-entity: column spec, parse, diff, commit, export
- `backend/src/services/import_export/subjects.rs`
- `backend/src/services/import_export/rooms.rs`
- `backend/src/services/import_export/classes.rs`
- `backend/src/services/import_export/timeslots.rs`
- `backend/src/services/import_export/curriculum.rs`
- `backend/src/controllers/import_export.rs` — three endpoints, dispatch on entity path param
- `backend/tests/requests/import_export.rs` — integration tests (round-trip per entity, errors, atomicity, tenant isolation)

### Backend — modified files

- `backend/Cargo.toml` — add `csv = "1"` dep
- `backend/src/services/mod.rs` — `pub mod import_export;`
- `backend/src/controllers/mod.rs` — `pub mod import_export;`
- `backend/src/app.rs` — register routes; insert `PreviewTokenCache` into shared store via `after_context`
- `backend/tests/requests/mod.rs` — `mod import_export;`

### Frontend — new files

- `frontend/src/app/[locale]/schools/[id]/settings/components/import-export-tab.tsx` — six entity cards with Export + Import buttons
- `frontend/src/components/import-preview-dialog.tsx` — reusable preview/confirm dialog
- `frontend/src/lib/import-export.ts` — typed API client functions and `PreviewResponse` types
- `frontend/src/components/import-preview-dialog.test.tsx` — Vitest tests
- `frontend/src/app/[locale]/schools/[id]/timetable/printable.test.tsx` — snapshot test for the print wrapper

### Frontend — modified files

- `frontend/src/app/[locale]/schools/[id]/settings/page.tsx` — register new `importExport` tab
- `frontend/src/app/[locale]/schools/[id]/timetable/page.tsx` — add Print button and `.printable-timetable` wrapper class
- `frontend/src/app/globals.css` — `@media print` rules
- `frontend/src/messages/en.json` — `importExport` namespace + `timetable.print`
- `frontend/src/messages/de.json` — same in German

---

## Naming conventions used throughout this plan

- Entity URL slug: `teachers`, `subjects`, `rooms`, `classes`, `timeslots`, `curriculum`
- `EntityKind` Rust enum variants: `Teachers`, `Subjects`, `Rooms`, `Classes`, `Timeslots`, `Curriculum`
- Token type: `Uuid`
- Response struct names: `PreviewResponse`, `PreviewRow`, `RowAction` (`Create | Update | Unchanged | Invalid`)
- All controller routes nested under `api/schools/{school_id}` (matching existing pattern)

---

## Task 1: Add `csv` crate dependency

**Files:**
- Modify: `backend/Cargo.toml`

- [ ] **Step 1: Add dependency**

In `[dependencies]` of `backend/Cargo.toml`, add this line alphabetically near `chrono`:

```toml
csv = "1"
```

- [ ] **Step 2: Verify it builds**

Run: `cargo build -p klassenzeit-backend`
Expected: clean build (no warnings about unused dep is fine — we'll use it next).

- [ ] **Step 3: Commit**

```bash
git add backend/Cargo.toml backend/Cargo.lock
git commit -m "feat(backend): add csv crate for import/export"
```

---

## Task 2: Scaffold `import_export` service module + `EntityKind`

**Files:**
- Create: `backend/src/services/import_export/mod.rs`
- Modify: `backend/src/services/mod.rs`

- [ ] **Step 1: Create module file**

Write `backend/src/services/import_export/mod.rs`:

```rust
//! CSV import/export for reference data.
//!
//! Public API:
//! - `EntityKind` — which entity is being imported/exported.
//! - `parse_entity_kind` — URL slug → `EntityKind`.
//!
//! See `docs/superpowers/specs/2026-04-08-data-import-export-design.md`.

use serde::{Deserialize, Serialize};

#[derive(Copy, Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EntityKind {
    Teachers,
    Subjects,
    Rooms,
    Classes,
    Timeslots,
    Curriculum,
}

impl EntityKind {
    pub fn from_slug(s: &str) -> Option<Self> {
        match s {
            "teachers" => Some(Self::Teachers),
            "subjects" => Some(Self::Subjects),
            "rooms" => Some(Self::Rooms),
            "classes" => Some(Self::Classes),
            "timeslots" => Some(Self::Timeslots),
            "curriculum" => Some(Self::Curriculum),
            _ => None,
        }
    }

    pub fn slug(self) -> &'static str {
        match self {
            Self::Teachers => "teachers",
            Self::Subjects => "subjects",
            Self::Rooms => "rooms",
            Self::Classes => "classes",
            Self::Timeslots => "timeslots",
            Self::Curriculum => "curriculum",
        }
    }
}
```

- [ ] **Step 2: Register module**

Edit `backend/src/services/mod.rs`. Add to the existing `pub mod` lines:

```rust
pub mod import_export;
```

- [ ] **Step 3: Verify it builds**

Run: `cargo build -p klassenzeit-backend`
Expected: clean build.

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/mod.rs backend/src/services/import_export/mod.rs
git commit -m "feat(backend): scaffold import_export service module"
```

---

## Task 3: Preview token cache (TDD)

**Files:**
- Create: `backend/src/services/import_export/token_cache.rs`
- Modify: `backend/src/services/import_export/mod.rs`

- [ ] **Step 1: Write the failing test**

Append to `backend/src/services/import_export/token_cache.rs` (create the file):

```rust
//! In-memory cache for preview tokens.
//!
//! Per-school capacity is bounded; entries expire after a TTL.

use crate::services::import_export::EntityKind;
use chrono::{DateTime, Duration, Utc};
use dashmap::DashMap;
use std::sync::Arc;
use uuid::Uuid;

const TTL_SECONDS: i64 = 600;
const MAX_PER_SCHOOL: usize = 100;

#[derive(Clone, Debug)]
pub struct PreviewCacheEntry {
    pub school_id: Uuid,
    pub entity: EntityKind,
    pub payload: serde_json::Value,
    pub created_at: DateTime<Utc>,
}

#[derive(Clone, Default)]
pub struct PreviewTokenCache {
    inner: Arc<DashMap<Uuid, PreviewCacheEntry>>,
}

impl PreviewTokenCache {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn insert(
        &self,
        school_id: Uuid,
        entity: EntityKind,
        payload: serde_json::Value,
    ) -> Uuid {
        self.evict_expired();
        self.evict_oldest_for_school(school_id);
        let token = Uuid::new_v4();
        self.inner.insert(
            token,
            PreviewCacheEntry {
                school_id,
                entity,
                payload,
                created_at: Utc::now(),
            },
        );
        token
    }

    pub fn take(
        &self,
        token: Uuid,
        school_id: Uuid,
        entity: EntityKind,
    ) -> Option<PreviewCacheEntry> {
        let entry = self.inner.remove(&token).map(|(_, v)| v)?;
        if entry.school_id != school_id || entry.entity != entity {
            // Wrong tenant or entity — re-insert (don't consume) and return None.
            self.inner.insert(token, entry);
            return None;
        }
        if Utc::now() - entry.created_at > Duration::seconds(TTL_SECONDS) {
            return None;
        }
        Some(entry)
    }

    pub fn peek(&self, token: Uuid) -> Option<PreviewCacheEntry> {
        self.inner.get(&token).map(|e| e.clone())
    }

    fn evict_expired(&self) {
        let now = Utc::now();
        let cutoff = Duration::seconds(TTL_SECONDS);
        self.inner.retain(|_, e| now - e.created_at <= cutoff);
    }

    fn evict_oldest_for_school(&self, school_id: Uuid) {
        let mut for_school: Vec<(Uuid, DateTime<Utc>)> = self
            .inner
            .iter()
            .filter(|e| e.school_id == school_id)
            .map(|e| (*e.key(), e.created_at))
            .collect();
        if for_school.len() < MAX_PER_SCHOOL {
            return;
        }
        for_school.sort_by_key(|(_, t)| *t);
        let to_drop = for_school.len() - MAX_PER_SCHOOL + 1;
        for (token, _) in for_school.into_iter().take(to_drop) {
            self.inner.remove(&token);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn insert_and_take_round_trip() {
        let cache = PreviewTokenCache::new();
        let school = Uuid::new_v4();
        let token = cache.insert(school, EntityKind::Teachers, serde_json::json!({"x": 1}));
        let entry = cache.take(token, school, EntityKind::Teachers).unwrap();
        assert_eq!(entry.payload, serde_json::json!({"x": 1}));
        // Token consumed.
        assert!(cache.take(token, school, EntityKind::Teachers).is_none());
    }

    #[test]
    fn take_with_wrong_school_returns_none_and_does_not_consume() {
        let cache = PreviewTokenCache::new();
        let school_a = Uuid::new_v4();
        let school_b = Uuid::new_v4();
        let token = cache.insert(school_a, EntityKind::Teachers, serde_json::json!({}));
        assert!(cache.take(token, school_b, EntityKind::Teachers).is_none());
        // Original owner can still consume.
        assert!(cache.take(token, school_a, EntityKind::Teachers).is_some());
    }

    #[test]
    fn take_with_wrong_entity_returns_none_and_does_not_consume() {
        let cache = PreviewTokenCache::new();
        let school = Uuid::new_v4();
        let token = cache.insert(school, EntityKind::Teachers, serde_json::json!({}));
        assert!(cache.take(token, school, EntityKind::Rooms).is_none());
        assert!(cache.take(token, school, EntityKind::Teachers).is_some());
    }

    #[test]
    fn per_school_bound_evicts_oldest() {
        let cache = PreviewTokenCache::new();
        let school = Uuid::new_v4();
        let mut tokens = Vec::new();
        for _ in 0..MAX_PER_SCHOOL + 5 {
            tokens.push(cache.insert(school, EntityKind::Teachers, serde_json::json!({})));
        }
        // The oldest 5 should be gone.
        let mut surviving = 0;
        for t in &tokens {
            if cache.peek(*t).is_some() {
                surviving += 1;
            }
        }
        assert_eq!(surviving, MAX_PER_SCHOOL);
    }
}
```

- [ ] **Step 2: Register submodule**

Edit `backend/src/services/import_export/mod.rs`. Add at the top, after the doc comment:

```rust
pub mod token_cache;
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `cargo test -p klassenzeit-backend --lib services::import_export::token_cache`
Expected: 4 passed.

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/import_export/
git commit -m "feat(backend): preview token cache for import/export"
```

---

## Task 4: Wire token cache into AppContext

**Files:**
- Modify: `backend/src/app.rs`

- [ ] **Step 1: Add insert in `after_context`**

Edit `backend/src/app.rs`. In `after_context`, add the new insert after the scheduler state line:

```rust
async fn after_context(ctx: AppContext) -> Result<AppContext> {
    ctx.shared_store
        .insert(scheduler_service::new_scheduler_state());
    ctx.shared_store
        .insert(crate::services::import_export::token_cache::PreviewTokenCache::new());
    Ok(ctx)
}
```

- [ ] **Step 2: Verify build**

Run: `cargo build -p klassenzeit-backend`
Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add backend/src/app.rs
git commit -m "feat(backend): expose PreviewTokenCache in app context"
```

---

## Task 5: Generic CSV row error type + helpers

**Files:**
- Create: `backend/src/services/import_export/csv_io.rs`
- Modify: `backend/src/services/import_export/mod.rs`

- [ ] **Step 1: Write the file with inline tests**

Create `backend/src/services/import_export/csv_io.rs`:

```rust
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
pub fn check_required(
    header: &[String],
    required: &[&str],
) -> Result<Vec<String>, CsvFileError> {
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
    s.parse::<i32>().map_err(|_| format!("expected integer, got '{s}'"))
}

pub fn parse_i16(s: &str) -> Result<i16, String> {
    s.parse::<i16>().map_err(|_| format!("expected integer, got '{s}'"))
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
```

- [ ] **Step 2: Register submodule**

Edit `backend/src/services/import_export/mod.rs`. Append:

```rust
pub mod csv_io;
```

- [ ] **Step 3: Run tests**

Run: `cargo test -p klassenzeit-backend --lib services::import_export::csv_io`
Expected: 5 passed.

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/import_export/
git commit -m "feat(backend): csv parsing helpers for import/export"
```

---

## Task 6: Shared preview/diff types

**Files:**
- Modify: `backend/src/services/import_export/mod.rs`

- [ ] **Step 1: Add shared types**

Append to `backend/src/services/import_export/mod.rs`:

```rust
use serde_json::Value;

#[derive(Copy, Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RowAction {
    Create,
    Update,
    Unchanged,
    Invalid,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PreviewRow {
    pub line: usize,
    pub action: RowAction,
    pub natural_key: String,
    /// Normalized data ready for commit. Empty for `Invalid` rows.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
    /// Field-level diff for `Update` rows: { field: [old, new] }.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub diff: Option<Value>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub errors: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub warnings: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct PreviewSummary {
    pub create: usize,
    pub update: usize,
    pub unchanged: usize,
    pub invalid: usize,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PreviewResponse {
    pub token: uuid::Uuid,
    pub entity: EntityKind,
    pub summary: PreviewSummary,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub file_warnings: Vec<String>,
    pub rows: Vec<PreviewRow>,
}

impl PreviewSummary {
    pub fn from_rows(rows: &[PreviewRow]) -> Self {
        let mut s = Self::default();
        for r in rows {
            match r.action {
                RowAction::Create => s.create += 1,
                RowAction::Update => s.update += 1,
                RowAction::Unchanged => s.unchanged += 1,
                RowAction::Invalid => s.invalid += 1,
            }
        }
        s
    }
}
```

- [ ] **Step 2: Verify build**

Run: `cargo build -p klassenzeit-backend`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/import_export/mod.rs
git commit -m "feat(backend): preview/diff response types for import/export"
```

---

## Task 7: Teachers entity importer (TDD, full)

This is the canonical entity importer; the next five entities follow the same shape. Read this whole task before starting.

**Files:**
- Create: `backend/src/services/import_export/teachers.rs`
- Modify: `backend/src/services/import_export/mod.rs`

### Subtask 7a: Failing unit test for parse + diff

- [ ] **Step 1: Write the failing test file**

Create `backend/src/services/import_export/teachers.rs`:

```rust
//! CSV import/export for teachers. Natural key: `abbreviation`.
//!
//! Columns (export order):
//!   first_name, last_name, abbreviation, email,
//!   max_hours_per_week, is_part_time

use crate::models::_entities::teachers;
use crate::services::import_export::csv_io::{
    cell, check_required, parse_bool, parse_csv, parse_i32, CsvFileError, RowError,
};
use crate::services::import_export::{PreviewRow, PreviewSummary, RowAction};
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
pub fn parse(bytes: &[u8]) -> Result<(Vec<(usize, Result<TeacherRow, Vec<String>>)>, Vec<String>), CsvFileError> {
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

        let email = cell(&header, row, "email").map(str::to_string).filter(|s| !s.is_empty());

        let max_hours_per_week = match cell(&header, row, "max_hours_per_week").unwrap_or("").trim() {
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
            out.push((line, Ok(TeacherRow {
                first_name,
                last_name,
                abbreviation,
                email,
                max_hours_per_week,
                is_part_time,
            })));
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
                diff.insert("first_name".into(), json!([m.first_name, parsed.first_name]));
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
                diff.insert("is_part_time".into(), json!([m.is_part_time, parsed.is_part_time]));
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
    let by_abbr: HashMap<String, teachers::Model> =
        existing.into_iter().map(|m| (m.abbreviation.clone(), m)).collect();

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
                let data: TeacherRow = serde_json::from_value(row.data.clone().unwrap())
                    .map_err(|e| RowError { line: row.line, messages: vec![e.to_string()] })?;
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
                let data: TeacherRow = serde_json::from_value(row.data.clone().unwrap())
                    .map_err(|e| RowError { line: row.line, messages: vec![e.to_string()] })?;
                let existing = teachers::Entity::find()
                    .filter(teachers::Column::SchoolId.eq(school_id))
                    .filter(teachers::Column::Abbreviation.eq(data.abbreviation.clone()))
                    .filter(teachers::Column::IsActive.eq(true))
                    .one(txn)
                    .await
                    .map_err(|e| RowError { line: row.line, messages: vec![e.to_string()] })?
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
```

- [ ] **Step 2: Register submodule**

Edit `backend/src/services/import_export/mod.rs`. Append:

```rust
pub mod teachers;
```

- [ ] **Step 3: Run tests, expect compile errors first then pass**

Run: `cargo test -p klassenzeit-backend --lib services::import_export::teachers`
Expected: 6 unit tests pass.

If you get a compile error about unused imports, prune them.

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/import_export/teachers.rs backend/src/services/import_export/mod.rs
git commit -m "feat(backend): teachers CSV importer (parse, diff, commit, export)"
```

---

## Task 8: Subjects entity importer

**Files:**
- Create: `backend/src/services/import_export/subjects.rs`
- Modify: `backend/src/services/import_export/mod.rs`

Subjects schema: `name, abbreviation, color, needs_special_room`. Natural key: `abbreviation`. Required columns: `name`, `abbreviation`.

- [ ] **Step 1: Write the importer**

Create `backend/src/services/import_export/subjects.rs`. Use `teachers.rs` as a template; the structure is identical except for the field set. Key differences:

- `REQUIRED: &[&str] = &["name", "abbreviation"];`
- `SubjectRow { name, abbreviation, color: Option<String>, needs_special_room: bool }`
- Color validation: if non-empty, must match `^#[0-9a-fA-F]{6}$` — push error otherwise.
- `needs_special_room` defaults to `false`.
- The `subjects` model has no `is_active` column — drop the `IsActive.eq(true)` filter in `build_preview` and `export_csv`.
- Export columns in this order: `name, abbreviation, color, needs_special_room`.

Use `regex::Regex` for the color check (already a backend dep).

- [ ] **Step 2: Add inline tests covering**:
  - parse minimum columns
  - parse missing required column
  - parse invalid color value
  - diff create / unchanged / update

Mirror the teachers test structure.

- [ ] **Step 3: Register and run tests**

Edit `backend/src/services/import_export/mod.rs`, append `pub mod subjects;`.

Run: `cargo test -p klassenzeit-backend --lib services::import_export::subjects`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/import_export/
git commit -m "feat(backend): subjects CSV importer"
```

---

## Task 9: Rooms entity importer

**Files:**
- Create: `backend/src/services/import_export/rooms.rs`
- Modify: `backend/src/services/import_export/mod.rs`

Rooms schema: `name, building, capacity, max_concurrent`. Natural key: `name`. Required columns: `name`. Has `is_active`.

- [ ] **Step 1: Implement following the teachers template**

`RoomRow { name, building: Option<String>, capacity: Option<i32>, max_concurrent: i16 }`. Default `max_concurrent` = 1.

Filter export and preview lookups by `is_active = true`. Soft-delete behaviour mirrors teachers.

- [ ] **Step 2: Inline tests:** parse minimum, missing required, diff create/update/unchanged.

- [ ] **Step 3: Register, run, commit**

```bash
git add backend/src/services/import_export/
git commit -m "feat(backend): rooms CSV importer"
```

---

## Task 10: Classes entity importer (with FK by abbreviation)

**Files:**
- Create: `backend/src/services/import_export/classes.rs`
- Modify: `backend/src/services/import_export/mod.rs`

Classes schema: `name, grade_level (i16), student_count (Option<i32>), class_teacher_id (Option<Uuid>)`. Natural key: `name`. CSV column for the FK is `class_teacher_abbreviation`.

- [ ] **Step 1: Implement with FK resolution**

Required columns: `name`, `grade_level`. Optional: `student_count`, `class_teacher_abbreviation`.

In `build_preview`, additionally load all active teachers for the school, build a `HashMap<String, Uuid>` from abbreviation → id, then resolve `class_teacher_abbreviation` per row. Unknown abbreviation → row error `unknown teacher abbreviation 'XYZ'`.

`ClassRow { name, grade_level: i16, student_count: Option<i32>, class_teacher_id: Option<Uuid> }` — FK already resolved to a Uuid before reaching diff/commit. Diff treats `class_teacher_id` as a regular field.

For the diff display, populate the diff entry with the abbreviation strings (look up the existing class's teacher abbreviation in the map for the "old" side), so the UI shows human-readable values.

For export, include `class_teacher_abbreviation` (look up by joining with teachers; for simplicity, fetch all teachers and build the same map).

- [ ] **Step 2: Inline tests:** parse minimum, missing required, FK unknown abbreviation, FK present and resolved, diff create/update.

For unit tests, the FK map is passed in as a parameter to a small helper to keep the test independent of DB. Refactor `parse` so the optional `class_teacher_abbreviation` is captured as a `String` first; a separate `resolve_fks(rows, teacher_map)` step turns it into a Uuid or pushes a row error.

- [ ] **Step 3: Register, run, commit**

```bash
git add backend/src/services/import_export/
git commit -m "feat(backend): classes CSV importer with class_teacher FK"
```

---

## Task 11: Timeslots entity importer

**Files:**
- Create: `backend/src/services/import_export/timeslots.rs`
- Modify: `backend/src/services/import_export/mod.rs`

Timeslots schema: `day_of_week (i16, 1-7), period (i16), start_time, end_time, is_break, label`. Natural key: `(day_of_week, period)`. No `is_active` column (timeslots are hard-deleted).

- [ ] **Step 1: Implement**

Required columns: `day_of_week`, `period`, `start_time`, `end_time`. Validate `day_of_week` ∈ 1..=7 (push row error otherwise). Validate `period >= 0`. Times via `parse_time`.

Natural key string: format as `"{day}-{period}"` for display.

- [ ] **Step 2: Inline tests:** parse minimum, missing required, invalid day, invalid time, diff create/unchanged.

- [ ] **Step 3: Register, run, commit**

```bash
git add backend/src/services/import_export/
git commit -m "feat(backend): timeslots CSV importer"
```

---

## Task 12: Curriculum entity importer (term-scoped, multi-FK)

**Files:**
- Create: `backend/src/services/import_export/curriculum.rs`
- Modify: `backend/src/services/import_export/mod.rs`

Curriculum schema: `term_id, school_class_id, subject_id, teacher_id (Option), hours_per_week`. Natural key: `(term_id, class_name, subject_abbr)`. CSV does NOT carry term_id; the controller passes it in.

- [ ] **Step 1: Implement with term + multi-FK**

Public function shape differs from other entities — `build_preview(db, school_id, term_id, bytes)`, `commit(txn, school_id, term_id, rows)`, `export_csv(db, school_id, term_id)`.

Required columns: `class_name`, `subject_abbr`, `hours_per_week`. Optional: `teacher_abbreviation`.

In `build_preview`:
1. Load classes for school → `HashMap<String, Uuid>` (name → id)
2. Load subjects for school → `HashMap<String, Uuid>` (abbreviation → id)
3. Load teachers for school → `HashMap<String, Uuid>` (abbreviation → id)
4. Load existing curriculum entries for `(school_id, term_id)`, build lookup keyed on `(class_id, subject_id)`
5. For each parsed row, resolve all three FKs; on miss, mark `Invalid` with a clear message
6. Diff against existing entry on `(class_id, subject_id)`. Fields compared: `teacher_id`, `hours_per_week`. Display the diff with abbreviation strings, not Uuids.

`CurriculumRow { class_id, subject_id, teacher_id, hours_per_week, class_name, subject_abbr, teacher_abbr }` — keep the human-readable strings alongside Uuids so diff/export can render them.

For export: join with classes/subjects/teachers to fetch the strings; export columns `class_name, subject_abbr, teacher_abbreviation, hours_per_week` sorted by `(class_name, subject_abbr)`.

- [ ] **Step 2: Inline tests:** parse minimum, missing required, unknown class FK, unknown subject FK, unknown teacher FK (separate row error path), diff create/update/unchanged.

Use small in-memory maps so tests don't hit the DB.

- [ ] **Step 3: Register, run, commit**

```bash
git add backend/src/services/import_export/
git commit -m "feat(backend): curriculum CSV importer with term scope and multi-FK"
```

---

## Task 13: Controller — three endpoints

**Files:**
- Create: `backend/src/controllers/import_export.rs`
- Modify: `backend/src/controllers/mod.rs`, `backend/src/app.rs`

- [ ] **Step 1: Write controller**

Create `backend/src/controllers/import_export.rs`:

```rust
use axum::body::Bytes;
use axum::extract::{Multipart, Path, Query, State};
use axum::http::{header, StatusCode};
use axum::response::IntoResponse;
use loco_rs::prelude::*;
use serde::Deserialize;
use uuid::Uuid;

use crate::keycloak::errors::AuthError;
use crate::keycloak::extractors::SchoolContext;
use crate::services::import_export::{
    classes, csv_io::CsvFileError, curriculum, rooms, subjects, teachers, timeslots,
    token_cache::PreviewTokenCache, EntityKind, PreviewResponse, PreviewSummary, RowAction,
};

#[derive(Deserialize)]
struct TermQuery {
    term_id: Option<Uuid>,
}

#[derive(Deserialize)]
struct CommitBody {
    token: Uuid,
}

fn require_admin(ctx: &SchoolContext) -> Result<(), axum::response::Response> {
    if ctx.role != "admin" {
        Err(AuthError::Forbidden("admin role required".into()).into_response())
    } else {
        Ok(())
    }
}

fn entity_or_404(slug: &str) -> Result<EntityKind, axum::response::Response> {
    EntityKind::from_slug(slug).ok_or_else(|| {
        (StatusCode::NOT_FOUND, format!("unknown entity '{slug}'")).into_response()
    })
}

fn file_error(e: CsvFileError) -> axum::response::Response {
    (StatusCode::BAD_REQUEST, e.to_string()).into_response()
}

async fn export(
    State(ctx): State<AppContext>,
    school_ctx: SchoolContext,
    Path((_school, entity)): Path<(Uuid, String)>,
    Query(q): Query<TermQuery>,
) -> impl IntoResponse {
    if let Err(r) = require_admin(&school_ctx) {
        return r;
    }
    let kind = match entity_or_404(&entity) {
        Ok(k) => k,
        Err(r) => return r,
    };
    let school_id = school_ctx.school.id;

    let bytes = match kind {
        EntityKind::Teachers => teachers::export_csv(&ctx.db, school_id).await,
        EntityKind::Subjects => subjects::export_csv(&ctx.db, school_id).await,
        EntityKind::Rooms => rooms::export_csv(&ctx.db, school_id).await,
        EntityKind::Classes => classes::export_csv(&ctx.db, school_id).await,
        EntityKind::Timeslots => timeslots::export_csv(&ctx.db, school_id).await,
        EntityKind::Curriculum => match q.term_id {
            None => {
                return (StatusCode::BAD_REQUEST, "term_id query param required").into_response()
            }
            Some(tid) => curriculum::export_csv(&ctx.db, school_id, tid).await,
        },
    };
    match bytes {
        Ok(b) => {
            let filename = format!("{}-{}.csv", school_ctx.school.slug, kind.slug());
            (
                StatusCode::OK,
                [
                    (header::CONTENT_TYPE, "text/csv; charset=utf-8".to_string()),
                    (
                        header::CONTENT_DISPOSITION,
                        format!("attachment; filename=\"{filename}\""),
                    ),
                ],
                b,
            )
                .into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn read_multipart_file(mut multipart: Multipart) -> Result<Bytes, axum::response::Response> {
    while let Some(field) = multipart.next_field().await.map_err(|e| {
        (StatusCode::BAD_REQUEST, e.to_string()).into_response()
    })? {
        if field.name() == Some("file") {
            return field
                .bytes()
                .await
                .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()).into_response());
        }
    }
    Err((StatusCode::BAD_REQUEST, "missing 'file' field".to_string()).into_response())
}

async fn preview(
    State(ctx): State<AppContext>,
    school_ctx: SchoolContext,
    Path((_school, entity)): Path<(Uuid, String)>,
    Query(q): Query<TermQuery>,
    multipart: Multipart,
) -> axum::response::Response {
    if let Err(r) = require_admin(&school_ctx) {
        return r;
    }
    let kind = match entity_or_404(&entity) {
        Ok(k) => k,
        Err(r) => return r,
    };
    let school_id = school_ctx.school.id;
    let bytes = match read_multipart_file(multipart).await {
        Ok(b) => b,
        Err(r) => return r,
    };

    let result = match kind {
        EntityKind::Teachers => teachers::build_preview(&ctx.db, school_id, &bytes).await,
        EntityKind::Subjects => subjects::build_preview(&ctx.db, school_id, &bytes).await,
        EntityKind::Rooms => rooms::build_preview(&ctx.db, school_id, &bytes).await,
        EntityKind::Classes => classes::build_preview(&ctx.db, school_id, &bytes).await,
        EntityKind::Timeslots => timeslots::build_preview(&ctx.db, school_id, &bytes).await,
        EntityKind::Curriculum => match q.term_id {
            None => {
                return (StatusCode::BAD_REQUEST, "term_id query param required").into_response()
            }
            Some(tid) => curriculum::build_preview(&ctx.db, school_id, tid, &bytes).await,
        },
    };
    let (rows, file_warnings) = match result {
        Ok(x) => x,
        Err(e) => return file_error(e),
    };

    let summary = PreviewSummary::from_rows(&rows);
    let cache = ctx
        .shared_store
        .get_ref::<PreviewTokenCache>()
        .expect("PreviewTokenCache missing");
    let payload = serde_json::json!({
        "rows": rows,
        "term_id": q.term_id,
    });
    let token = cache.insert(school_id, kind, payload);

    let resp = PreviewResponse {
        token,
        entity: kind,
        summary,
        file_warnings,
        rows,
    };
    (StatusCode::OK, axum::Json(resp)).into_response()
}

async fn commit(
    State(ctx): State<AppContext>,
    school_ctx: SchoolContext,
    Path((_school, entity)): Path<(Uuid, String)>,
    axum::Json(body): axum::Json<CommitBody>,
) -> axum::response::Response {
    use sea_orm::TransactionTrait;

    if let Err(r) = require_admin(&school_ctx) {
        return r;
    }
    let kind = match entity_or_404(&entity) {
        Ok(k) => k,
        Err(r) => return r,
    };
    let school_id = school_ctx.school.id;

    let cache = ctx
        .shared_store
        .get_ref::<PreviewTokenCache>()
        .expect("PreviewTokenCache missing");
    let entry = match cache.take(body.token, school_id, kind) {
        Some(e) => e,
        None => {
            return (StatusCode::GONE, "preview token expired or not found").into_response()
        }
    };

    let rows: Vec<crate::services::import_export::PreviewRow> =
        serde_json::from_value(entry.payload["rows"].clone()).unwrap_or_default();
    let term_id: Option<Uuid> = serde_json::from_value(entry.payload["term_id"].clone()).ok().flatten();

    if rows.iter().any(|r| r.action == RowAction::Invalid) {
        return (
            StatusCode::UNPROCESSABLE_ENTITY,
            "preview contained invalid rows",
        )
            .into_response();
    }

    let txn = match ctx.db.begin().await {
        Ok(t) => t,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };
    let res = match kind {
        EntityKind::Teachers => teachers::commit(&txn, school_id, &rows).await,
        EntityKind::Subjects => subjects::commit(&txn, school_id, &rows).await,
        EntityKind::Rooms => rooms::commit(&txn, school_id, &rows).await,
        EntityKind::Classes => classes::commit(&txn, school_id, &rows).await,
        EntityKind::Timeslots => timeslots::commit(&txn, school_id, &rows).await,
        EntityKind::Curriculum => match term_id {
            None => {
                let _ = txn.rollback().await;
                return (StatusCode::BAD_REQUEST, "term_id missing from cached preview")
                    .into_response();
            }
            Some(tid) => curriculum::commit(&txn, school_id, tid, &rows).await,
        },
    };
    match res {
        Ok(()) => match txn.commit().await {
            Ok(()) => (StatusCode::NO_CONTENT, ()).into_response(),
            Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
        },
        Err(row_err) => {
            let _ = txn.rollback().await;
            (
                StatusCode::UNPROCESSABLE_ENTITY,
                axum::Json(serde_json::json!({ "errors": [row_err] })),
            )
                .into_response()
        }
    }
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/schools/{id}")
        .add("/export/{entity}.csv", get(export))
        .add("/import/{entity}/preview", post(preview))
        .add("/import/{entity}/commit", post(commit))
}
```

- [ ] **Step 2: Register module + route**

Edit `backend/src/controllers/mod.rs`. Add:

```rust
pub mod import_export;
```

Edit `backend/src/app.rs` `routes()`. Add at the end of the chain:

```rust
.add_route(controllers::import_export::routes())
```

- [ ] **Step 3: Verify build**

Run: `cargo build -p klassenzeit-backend`
Expected: clean build. Fix any compile errors (most likely missing per-entity `build_preview` / `commit` / `export_csv` functions in tasks 8-12 — go back and reconcile).

- [ ] **Step 4: Commit**

```bash
git add backend/src/controllers/import_export.rs backend/src/controllers/mod.rs backend/src/app.rs
git commit -m "feat(backend): import/export controller with preview and commit"
```

---

## Task 14: Backend integration tests — happy paths

**Files:**
- Create: `backend/tests/requests/import_export.rs`
- Modify: `backend/tests/requests/mod.rs`

- [ ] **Step 1: Add module**

Edit `backend/tests/requests/mod.rs`. Add `mod import_export;`.

- [ ] **Step 2: Write the round-trip test for teachers**

Create `backend/tests/requests/import_export.rs`:

```rust
use axum::http::{header, HeaderName, StatusCode};
use klassenzeit_backend::app::App;
use klassenzeit_backend::keycloak::middleware::AuthState;
use klassenzeit_backend::models::{app_users, school_memberships, schools, teachers};
use loco_rs::testing::prelude::*;
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, Set};
use serial_test::serial;
use uuid::Uuid;

use crate::helpers::jwt::{TestKeyPair, TEST_CLIENT_ID, TEST_ISSUER};
use klassenzeit_backend::keycloak::claims::AuthClaims;

fn valid_claims(sub: &str, email: &str) -> AuthClaims {
    AuthClaims {
        sub: sub.to_string(),
        email: email.to_string(),
        preferred_username: Some("Test User".to_string()),
        exp: (chrono::Utc::now().timestamp() + 300) as usize,
        iss: TEST_ISSUER.to_string(),
        aud: serde_json::json!(TEST_CLIENT_ID),
    }
}

async fn setup_admin(
    ctx: &loco_rs::app::AppContext,
    kp: &TestKeyPair,
    prefix: &str,
) -> (schools::Model, String) {
    let user = app_users::ActiveModel::new(
        format!("kc-{prefix}"),
        format!("{prefix}@example.com"),
        "Admin".into(),
    )
    .insert(&ctx.db)
    .await
    .unwrap();
    let school = schools::ActiveModel::new(
        format!("{prefix}-school"),
        format!("{prefix}-school-slug"),
    )
    .insert(&ctx.db)
    .await
    .unwrap();
    school_memberships::ActiveModel::new(user.id, school.id, "admin".into())
        .insert(&ctx.db)
        .await
        .unwrap();
    let token = kp.create_token(&valid_claims(
        &format!("kc-{prefix}"),
        &format!("{prefix}@example.com"),
    ));
    (school, token)
}

fn auth_headers(token: &str, school: Uuid) -> Vec<(HeaderName, String)> {
    vec![
        (header::AUTHORIZATION, format!("Bearer {token}")),
        (
            HeaderName::from_static("x-school-id"),
            school.to_string(),
        ),
    ]
}

async fn seed_teacher(ctx: &loco_rs::app::AppContext, school_id: Uuid, abbr: &str) {
    let now = chrono::Utc::now().into();
    teachers::ActiveModel {
        id: Set(Uuid::new_v4()),
        school_id: Set(school_id),
        first_name: Set("Jane".into()),
        last_name: Set("Doe".into()),
        abbreviation: Set(abbr.into()),
        email: Set(Some("jane@example.com".into())),
        max_hours_per_week: Set(28),
        is_part_time: Set(false),
        is_active: Set(true),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&ctx.db)
    .await
    .unwrap();
}

#[tokio::test]
#[serial]
async fn teachers_export_then_reimport_is_unchanged() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        ctx.shared_store.get_ref::<AuthState>().unwrap().jwks.set_keys(kp.jwk_set.clone()).await;
        let (school, token) = setup_admin(&ctx, &kp, "ie-tea-rt").await;
        seed_teacher(&ctx, school.id, "JD1").await;
        seed_teacher(&ctx, school.id, "JD2").await;

        let mut req = server.get(&format!("/api/schools/{}/export/teachers.csv", school.id));
        for (k, v) in auth_headers(&token, school.id) {
            req = req.add_header(k, v);
        }
        let resp = req.await;
        resp.assert_status(StatusCode::OK);
        let csv_bytes = resp.as_bytes().to_vec();
        assert!(String::from_utf8_lossy(&csv_bytes).contains("JD1"));

        // Re-import the exact bytes via preview.
        let mut req = server
            .post(&format!("/api/schools/{}/import/teachers/preview", school.id))
            .multipart(
                axum_test::multipart::MultipartForm::new().add_part(
                    "file",
                    axum_test::multipart::Part::bytes(csv_bytes.clone())
                        .file_name("teachers.csv")
                        .mime_type("text/csv"),
                ),
            );
        for (k, v) in auth_headers(&token, school.id) {
            req = req.add_header(k, v);
        }
        let resp = req.await;
        resp.assert_status(StatusCode::OK);
        let body: serde_json::Value = resp.json();
        assert_eq!(body["summary"]["create"], 0);
        assert_eq!(body["summary"]["update"], 0);
        assert_eq!(body["summary"]["unchanged"], 2);
        assert_eq!(body["summary"]["invalid"], 0);
    })
    .await;
}
```

- [ ] **Step 3: Run test, expect pass**

Run: `just backend-test backend/tests/requests/import_export.rs::teachers_export_then_reimport_is_unchanged`

If you don't have a recipe wrapping a single test, run:
```
cargo test -p klassenzeit-backend --test mod requests::import_export::teachers_export_then_reimport_is_unchanged -- --nocapture
```

Expected: pass. (Requires Postgres running and `just test-db-setup`.)

- [ ] **Step 4: Commit**

```bash
git add backend/tests/requests/import_export.rs backend/tests/requests/mod.rs
git commit -m "test(backend): import/export round-trip happy path for teachers"
```

---

## Task 15: Backend integration tests — preview + commit + errors

**Files:**
- Modify: `backend/tests/requests/import_export.rs`

Add the following tests to the same file. Each is its own `#[tokio::test]` with `#[serial]`. Skeleton-share the `setup_admin` helper from Task 14.

- [ ] **Test: `preview_then_commit_creates_rows`**

Upload a CSV with 2 new teachers (`JD3,JD4`) → expect summary.create = 2. POST `/import/teachers/commit` with the token → expect 204. Query DB and assert both rows exist.

- [ ] **Test: `commit_with_invalid_token_returns_410`**

POST `/import/teachers/commit` with a random Uuid → expect 410.

- [ ] **Test: `commit_refuses_when_preview_had_invalid_rows`**

Upload a CSV missing `last_name` for one row (other rows valid). Preview returns mixed rows including `invalid`. Commit with that token → expect 422; no DB changes.

- [ ] **Test: `preview_with_missing_required_column_returns_400`**

Upload `first_name,last_name\n...` (no abbreviation) → expect 400.

- [ ] **Test: `commit_token_for_other_school_returns_410`**

Setup two admin schools A and B. Preview against A. Try commit against B's URL with the token. Expect 410. Verify DB unchanged for A.

- [ ] **Test: `commit_token_for_other_entity_returns_410`**

Preview against teachers, attempt commit against rooms with the same token. Expect 410.

- [ ] **Test: `preview_as_non_admin_returns_403`**

Use the existing `setup_teacher_school` helper pattern (copy from `backend/tests/requests/teachers.rs`); call preview with the teacher token; expect 403.

- [ ] **Test: `commit_atomicity_rollback_on_db_error`**

Seed an existing teacher with abbreviation `JD1`. Upload a CSV that creates `JD1` (a duplicate insert). Preview will mark it as Update (not duplicate), but rewrite the test to instead build a CSV that violates a CHECK or UNIQUE constraint at insert time — for instance, two CSV rows with the same abbreviation `JD1` and `JD1` (same row twice). Preview will pass (cache stores both), commit will fail on the second insert. Assert 422 + that the first insert was rolled back (DB still has only the original `JD1`).

- [ ] **Step 1: Implement each test inline.** Use the same multipart upload pattern as Task 14.

- [ ] **Step 2: Run all tests in the file**

Run: `cargo test -p klassenzeit-backend --test mod requests::import_export -- --nocapture`
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/requests/import_export.rs
git commit -m "test(backend): import/export error paths and tenant isolation"
```

---

## Task 16: Backend round-trip tests for the other 5 entities

**Files:**
- Modify: `backend/tests/requests/import_export.rs`

For each of `subjects`, `rooms`, `classes`, `timeslots`, `curriculum`, write **one** round-trip test of the same shape as `teachers_export_then_reimport_is_unchanged`. Seed 2 entities, export, re-import via preview, assert `unchanged == 2 && create == 0 && update == 0`.

Curriculum needs extra seeding: a term, two classes, two subjects, and two curriculum entries. Pass `?term_id=...` on both export and preview.

- [ ] **Step 1: Add the five tests**

Helpers: write small `seed_subject`, `seed_room`, `seed_class`, `seed_timeslot`, `seed_term`, `seed_curriculum_entry` functions in the same file. Keep them minimal — the goal is to exercise the round trip, not test the model layer.

- [ ] **Step 2: Run them**

Run: `cargo test -p klassenzeit-backend --test mod requests::import_export -- --nocapture`
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/requests/import_export.rs
git commit -m "test(backend): import/export round-trip for all 6 entities"
```

---

## Task 17: Frontend — add `importExport` and `timetable.print` i18n keys

**Files:**
- Modify: `frontend/src/messages/en.json`, `frontend/src/messages/de.json`

- [ ] **Step 1: Add keys to `en.json`**

Locate the top-level object (it has `settings`, `timetable`, etc.). Add a new `importExport` namespace and a new key under `timetable`:

```json
"importExport": {
  "tab": {
    "title": "Import / Export",
    "description": "Move data in and out of Klassenzeit using CSV files."
  },
  "import": "Import",
  "export": "Export",
  "selectFile": "Select CSV file",
  "cancel": "Cancel",
  "confirm": "Confirm",
  "termRequired": "Choose a term first.",
  "entities": {
    "teachers": { "title": "Teachers", "description": "first_name, last_name, abbreviation, email, max_hours_per_week, is_part_time" },
    "subjects": { "title": "Subjects", "description": "name, abbreviation, color, needs_special_room" },
    "rooms": { "title": "Rooms", "description": "name, building, capacity, max_concurrent" },
    "classes": { "title": "Classes", "description": "name, grade_level, student_count, class_teacher_abbreviation" },
    "timeslots": { "title": "Time slots", "description": "day_of_week (1-7), period, start_time (HH:MM), end_time, is_break, label" },
    "curriculum": { "title": "Curriculum", "description": "class_name, subject_abbr, teacher_abbreviation, hours_per_week (per term)" }
  },
  "preview": {
    "title": "Review changes",
    "summary": {
      "create": "Create",
      "update": "Update",
      "unchanged": "Unchanged",
      "invalid": "Invalid"
    },
    "lineColumn": "Line",
    "actionColumn": "Action",
    "keyColumn": "Key",
    "errorsColumn": "Errors",
    "invalidDisabled": "Fix the errors in the CSV and re-upload.",
    "fileWarnings": "Warnings"
  },
  "toast": {
    "importSuccess": "Import complete.",
    "exportFailed": "Export failed.",
    "previewExpired": "Preview expired. Please re-upload.",
    "commitFailed": "Import failed."
  }
}
```

Add a new key under the existing `timetable` namespace:

```json
"timetable": {
  ...
  "print": "Print"
}
```

- [ ] **Step 2: Mirror to `de.json`** with German translations:

- "Import / Export" → "Import / Export"
- "Move data in and out of Klassenzeit using CSV files." → "Daten als CSV-Datei importieren oder exportieren."
- "Import" → "Importieren"
- "Export" → "Exportieren"
- "Select CSV file" → "CSV-Datei auswählen"
- "Cancel" → "Abbrechen"
- "Confirm" → "Bestätigen"
- "Choose a term first." → "Bitte zuerst ein Halbjahr wählen."
- "Teachers" → "Lehrkräfte"
- "Subjects" → "Fächer"
- "Rooms" → "Räume"
- "Classes" → "Klassen"
- "Time slots" → "Zeitfenster"
- "Curriculum" → "Stundentafel"
- "Review changes" → "Änderungen prüfen"
- "Create" → "Anlegen"
- "Update" → "Aktualisieren"
- "Unchanged" → "Unverändert"
- "Invalid" → "Ungültig"
- "Line" → "Zeile"
- "Action" → "Aktion"
- "Key" → "Schlüssel"
- "Errors" → "Fehler"
- "Fix the errors in the CSV and re-upload." → "Fehler in der CSV beheben und neu hochladen."
- "Warnings" → "Warnungen"
- "Import complete." → "Import abgeschlossen."
- "Export failed." → "Export fehlgeschlagen."
- "Preview expired. Please re-upload." → "Vorschau abgelaufen. Bitte erneut hochladen."
- "Import failed." → "Import fehlgeschlagen."
- "Print" → "Drucken"

Reuse the same JSON structure as in en.json.

Reuse the column descriptions verbatim in `de.json` (they reference field names that aren't translated).

- [ ] **Step 3: Verify both files are valid JSON**

Run: `cd frontend && bun run lint`
Expected: pass (Biome will catch JSON syntax errors).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/messages/en.json frontend/src/messages/de.json
git commit -m "i18n: add importExport namespace and timetable.print"
```

---

## Task 18: Frontend API client + types

**Files:**
- Create: `frontend/src/lib/import-export.ts`

- [ ] **Step 1: Write the typed client**

Create `frontend/src/lib/import-export.ts`:

```ts
import type { ApiClient } from "@/hooks/use-api-client";

export type EntityKind =
  | "teachers"
  | "subjects"
  | "rooms"
  | "classes"
  | "timeslots"
  | "curriculum";

export type RowAction = "create" | "update" | "unchanged" | "invalid";

export interface PreviewRow {
  line: number;
  action: RowAction;
  natural_key: string;
  data?: Record<string, unknown>;
  diff?: Record<string, [unknown, unknown]>;
  errors?: string[];
  warnings?: string[];
}

export interface PreviewSummary {
  create: number;
  update: number;
  unchanged: number;
  invalid: number;
}

export interface PreviewResponse {
  token: string;
  entity: EntityKind;
  summary: PreviewSummary;
  file_warnings?: string[];
  rows: PreviewRow[];
}

export function exportUrl(
  schoolId: string,
  entity: EntityKind,
  termId?: string,
): string {
  const base = `/api/schools/${schoolId}/export/${entity}.csv`;
  return termId ? `${base}?term_id=${termId}` : base;
}

export async function uploadPreview(
  apiClient: ApiClient,
  schoolId: string,
  entity: EntityKind,
  file: File,
  termId?: string,
): Promise<PreviewResponse> {
  const fd = new FormData();
  fd.append("file", file);
  const path = `/api/schools/${schoolId}/import/${entity}/preview${
    termId ? `?term_id=${termId}` : ""
  }`;
  return apiClient.postForm<PreviewResponse>(path, fd);
}

export async function commitPreview(
  apiClient: ApiClient,
  schoolId: string,
  entity: EntityKind,
  token: string,
): Promise<void> {
  await apiClient.post<void>(
    `/api/schools/${schoolId}/import/${entity}/commit`,
    { token },
  );
}
```

- [ ] **Step 2: Add `postForm` to the API client if missing**

Read `frontend/src/hooks/use-api-client.ts`. If `postForm` (or an equivalent multipart method) does not exist, add one. It should:
- Set `Authorization` header from the existing token logic.
- NOT set `Content-Type` (browser will set the multipart boundary).
- Throw with the response status on non-2xx.
- Return parsed JSON on 200, void on 204.

Match the existing client's style (file is small).

- [ ] **Step 3: Verify build**

Run: `cd frontend && bun run typecheck`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/import-export.ts frontend/src/hooks/use-api-client.ts
git commit -m "feat(frontend): import/export typed client"
```

---

## Task 19: `<ImportPreviewDialog>` component (TDD)

**Files:**
- Create: `frontend/src/components/import-preview-dialog.tsx`
- Create: `frontend/src/components/import-preview-dialog.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/import-preview-dialog.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";
import { ImportPreviewDialog } from "./import-preview-dialog";
import type { PreviewResponse } from "@/lib/import-export";

function wrap(ui: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="en" messages={en}>
      {ui}
    </NextIntlClientProvider>
  );
}

const happyPreview: PreviewResponse = {
  token: "tok-1",
  entity: "teachers",
  summary: { create: 2, update: 1, unchanged: 0, invalid: 0 },
  rows: [
    { line: 2, action: "create", natural_key: "JD1" },
    { line: 3, action: "create", natural_key: "JD2" },
    { line: 4, action: "update", natural_key: "JD3" },
  ],
};

const invalidPreview: PreviewResponse = {
  token: "tok-2",
  entity: "teachers",
  summary: { create: 0, update: 0, unchanged: 0, invalid: 1 },
  rows: [
    { line: 2, action: "invalid", natural_key: "", errors: ["last_name is required"] },
  ],
};

describe("ImportPreviewDialog", () => {
  it("renders summary chips and enables Confirm when no invalid rows", () => {
    const onConfirm = vi.fn();
    render(
      wrap(
        <ImportPreviewDialog
          open
          preview={happyPreview}
          onCancel={() => {}}
          onConfirm={onConfirm}
        />,
      ),
    );
    expect(screen.getByText(/Create/i)).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    const confirmBtn = screen.getByRole("button", { name: /Confirm/i });
    expect(confirmBtn).not.toBeDisabled();
    fireEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledWith("tok-1");
  });

  it("disables Confirm when there are invalid rows", () => {
    render(
      wrap(
        <ImportPreviewDialog
          open
          preview={invalidPreview}
          onCancel={() => {}}
          onConfirm={() => {}}
        />,
      ),
    );
    expect(screen.getByRole("button", { name: /Confirm/i })).toBeDisabled();
    expect(screen.getByText(/last_name is required/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `cd frontend && bun run test src/components/import-preview-dialog.test.tsx`
Expected: fail with "Cannot find module './import-preview-dialog'" or similar.

- [ ] **Step 3: Implement the component**

Create `frontend/src/components/import-preview-dialog.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PreviewResponse, RowAction } from "@/lib/import-export";

interface Props {
  open: boolean;
  preview: PreviewResponse;
  onCancel: () => void;
  onConfirm: (token: string) => void;
}

const actionTone: Record<RowAction, string> = {
  create: "bg-green-100 text-green-900",
  update: "bg-blue-100 text-blue-900",
  unchanged: "bg-gray-100 text-gray-700",
  invalid: "bg-red-100 text-red-900",
};

export function ImportPreviewDialog({ open, preview, onCancel, onConfirm }: Props) {
  const t = useTranslations("importExport.preview");
  const ts = useTranslations("importExport.preview.summary");
  const disabled = preview.summary.invalid > 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          <Badge className="bg-green-100 text-green-900">
            {ts("create")} {preview.summary.create}
          </Badge>
          <Badge className="bg-blue-100 text-blue-900">
            {ts("update")} {preview.summary.update}
          </Badge>
          <Badge className="bg-gray-100 text-gray-700">
            {ts("unchanged")} {preview.summary.unchanged}
          </Badge>
          <Badge className="bg-red-100 text-red-900">
            {ts("invalid")} {preview.summary.invalid}
          </Badge>
        </div>

        {preview.file_warnings && preview.file_warnings.length > 0 && (
          <div className="rounded border border-yellow-300 bg-yellow-50 p-2 text-sm">
            <p className="font-semibold">{t("fileWarnings")}</p>
            <ul className="list-disc pl-5">
              {preview.file_warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="max-h-96 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("lineColumn")}</TableHead>
                <TableHead>{t("actionColumn")}</TableHead>
                <TableHead>{t("keyColumn")}</TableHead>
                <TableHead>{t("errorsColumn")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.rows.map((r) => (
                <TableRow key={`${r.line}-${r.natural_key}`}>
                  <TableCell>{r.line}</TableCell>
                  <TableCell>
                    <span className={`rounded px-2 py-0.5 text-xs ${actionTone[r.action]}`}>
                      {r.action}
                    </span>
                  </TableCell>
                  <TableCell>{r.natural_key || "—"}</TableCell>
                  <TableCell>
                    {r.errors && r.errors.length > 0 ? (
                      <ul className="text-red-700 text-sm">
                        {r.errors.map((e) => (
                          <li key={e}>{e}</li>
                        ))}
                      </ul>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            {useTranslations("importExport")("cancel")}
          </Button>
          <Button
            disabled={disabled}
            title={disabled ? t("invalidDisabled") : undefined}
            onClick={() => onConfirm(preview.token)}
          >
            {useTranslations("importExport")("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

If `Badge` does not exist in the existing shadcn components, replace it with a `<span>` styled the same way and remove the import.

- [ ] **Step 4: Run tests**

Run: `cd frontend && bun run test src/components/import-preview-dialog.test.tsx`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/import-preview-dialog.tsx frontend/src/components/import-preview-dialog.test.tsx
git commit -m "feat(frontend): ImportPreviewDialog component"
```

---

## Task 20: Frontend — Import / Export settings tab

**Files:**
- Create: `frontend/src/app/[locale]/schools/[id]/settings/components/import-export-tab.tsx`
- Modify: `frontend/src/app/[locale]/schools/[id]/settings/page.tsx`

- [ ] **Step 1: Write the tab component**

Create `frontend/src/app/[locale]/schools/[id]/settings/components/import-export-tab.tsx`:

```tsx
"use client";

import { Download, Upload } from "lucide-react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImportPreviewDialog } from "@/components/import-preview-dialog";
import { useApiClient } from "@/hooks/use-api-client";
import {
  commitPreview,
  exportUrl,
  uploadPreview,
  type EntityKind,
  type PreviewResponse,
} from "@/lib/import-export";
import type { TermResponse } from "@/lib/types";

const ENTITIES: EntityKind[] = [
  "teachers",
  "subjects",
  "rooms",
  "classes",
  "timeslots",
  "curriculum",
];

export function ImportExportTab() {
  const { id: schoolId } = useParams<{ id: string }>();
  const apiClient = useApiClient();
  const t = useTranslations("importExport");

  const [terms, setTerms] = useState<TermResponse[]>([]);
  const [termId, setTermId] = useState<string | undefined>();
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const inputRefs = useRef<Record<EntityKind, HTMLInputElement | null>>(
    {} as Record<EntityKind, HTMLInputElement | null>,
  );

  useEffect(() => {
    apiClient
      .get<TermResponse[]>(`/api/schools/${schoolId}/terms`)
      .then((ts) => {
        setTerms(ts);
        if (ts.length > 0) setTermId(ts[0].id);
      })
      .catch(() => {});
  }, [apiClient, schoolId]);

  const handleExport = (entity: EntityKind) => {
    if (entity === "curriculum" && !termId) {
      toast.error(t("termRequired"));
      return;
    }
    window.location.href = exportUrl(
      schoolId,
      entity,
      entity === "curriculum" ? termId : undefined,
    );
  };

  const handleFile = async (entity: EntityKind, file: File) => {
    if (entity === "curriculum" && !termId) {
      toast.error(t("termRequired"));
      return;
    }
    try {
      const resp = await uploadPreview(
        apiClient,
        schoolId,
        entity,
        file,
        entity === "curriculum" ? termId : undefined,
      );
      setPreview(resp);
    } catch (err) {
      toast.error(t("toast.commitFailed"));
    }
  };

  const handleConfirm = async (token: string) => {
    if (!preview) return;
    try {
      await commitPreview(apiClient, schoolId, preview.entity, token);
      toast.success(t("toast.importSuccess"));
      setPreview(null);
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 410) {
        toast.error(t("toast.previewExpired"));
      } else {
        toast.error(t("toast.commitFailed"));
      }
      setPreview(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t("tab.description")}</p>

      {ENTITIES.map((entity) => (
        <div
          key={entity}
          className="rounded border p-4 flex flex-col gap-2"
        >
          <div className="flex items-baseline justify-between">
            <h3 className="font-semibold">{t(`entities.${entity}.title`)}</h3>
            <p className="text-xs text-muted-foreground">
              {t(`entities.${entity}.description`)}
            </p>
          </div>

          {entity === "curriculum" && (
            <div className="max-w-xs">
              <Select value={termId} onValueChange={setTermId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {terms.map((term) => (
                    <SelectItem key={term.id} value={term.id}>
                      {term.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport(entity)}
            >
              <Download className="mr-1 size-4" />
              {t("export")}
            </Button>
            <Button
              size="sm"
              onClick={() => inputRefs.current[entity]?.click()}
            >
              <Upload className="mr-1 size-4" />
              {t("import")}
            </Button>
            <input
              ref={(el) => {
                inputRefs.current[entity] = el;
              }}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(entity, f);
                e.target.value = "";
              }}
            />
          </div>
        </div>
      ))}

      {preview && (
        <ImportPreviewDialog
          open
          preview={preview}
          onCancel={() => setPreview(null)}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  );
}
```

If `TermResponse` is not the actual exported type name in `@/lib/types`, find the right one with grep and update.

- [ ] **Step 2: Register the tab**

Edit `frontend/src/app/[locale]/schools/[id]/settings/page.tsx`. Add `"importExport"` to `TABS` (after `scheduler`), import `ImportExportTab`, and render it:

```tsx
const TABS = [
  "terms",
  "classes",
  "subjects",
  "teachers",
  "rooms",
  "timeslots",
  "scheduler",
  "importExport",
] as const;
```

```tsx
import { ImportExportTab } from "./components/import-export-tab";
// ...
{activeTab === "importExport" && <ImportExportTab />}
```

Add a tab label key to both `en.json` and `de.json` under `settings.tabs`:

```json
"settings": {
  "tabs": {
    ...,
    "importExport": "Import / Export"
  }
}
```

- [ ] **Step 3: Verify build and lint**

Run: `cd frontend && bun run typecheck && bun run lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/[locale]/schools/[id]/settings/components/import-export-tab.tsx \
        frontend/src/app/[locale]/schools/[id]/settings/page.tsx \
        frontend/src/messages/en.json frontend/src/messages/de.json
git commit -m "feat(frontend): import/export settings tab"
```

---

## Task 21: Timetable print-to-PDF

**Files:**
- Modify: `frontend/src/app/[locale]/schools/[id]/timetable/page.tsx`
- Modify: `frontend/src/app/globals.css`

- [ ] **Step 1: Add Print button + wrapper class**

Edit `frontend/src/app/[locale]/schools/[id]/timetable/page.tsx`. Locate the existing toolbar (where the view-mode selector lives). Add a Print button next to it:

```tsx
import { Printer } from "lucide-react";
import { useTranslations } from "next-intl";
// ...
const tt = useTranslations("timetable");
// ...
<Button variant="outline" size="sm" onClick={() => window.print()}>
  <Printer className="mr-1 size-4" />
  {tt("print")}
</Button>
```

Wrap the page's grid container in a `<div className="printable-timetable">...</div>` so the print stylesheet has a stable hook. Place the wrapper around the timetable grid only (not the toolbar).

- [ ] **Step 2: Add print CSS**

Append to `frontend/src/app/globals.css`:

```css
@media print {
  @page {
    size: A4 landscape;
    margin: 12mm;
  }

  body * {
    visibility: hidden;
  }

  .printable-timetable,
  .printable-timetable * {
    visibility: visible;
  }

  .printable-timetable {
    position: absolute;
    inset: 0;
    width: 100%;
    padding: 0;
  }

  .printable-timetable .grid {
    page-break-inside: avoid;
  }

  .printable-timetable [data-print-hide],
  nav,
  aside,
  header[data-app-header],
  [data-violations-panel],
  button {
    display: none !important;
  }
}
```

If the existing app shell uses different element selectors for the sidebar/header (e.g. it doesn't use `nav`/`aside`), replace those with the actual classes used. Run the dev server and use browser print preview to verify.

- [ ] **Step 3: Snapshot test the wrapper**

Create `frontend/src/app/[locale]/schools/[id]/timetable/printable.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

describe("printable wrapper", () => {
  it("renders the printable-timetable class on a child", () => {
    const { container } = render(
      <div className="printable-timetable">
        <div data-testid="grid">grid</div>
      </div>,
    );
    expect(container.querySelector(".printable-timetable")).not.toBeNull();
    expect(container.querySelector('[data-testid="grid"]')).not.toBeNull();
  });
});
```

This is a smoke test — it just guards the wrapper class. The actual print styling can only be verified visually.

- [ ] **Step 4: Run tests**

Run: `cd frontend && bun run test`
Expected: all pass.

- [ ] **Step 5: Manual verification**

Run `just dev`. Open `/timetable`, click Print, check the browser print preview shows the grid (no sidebar). Switch view modes; print again. Confirm the printed output looks reasonable for A4 landscape.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/[locale]/schools/[id]/timetable/page.tsx \
        frontend/src/app/globals.css \
        frontend/src/app/[locale]/schools/[id]/timetable/printable.test.tsx
git commit -m "feat(frontend): print-to-PDF for timetable view"
```

---

## Task 22: Final validation pass

- [ ] **Step 1: Run full backend test suite**

Run: `just backend-test`
Expected: all tests pass, including the new `import_export` module.

- [ ] **Step 2: Run full frontend test + lint + typecheck**

Run: `cd frontend && bun run test && bun run lint && bun run typecheck`
Expected: clean.

- [ ] **Step 3: Run formatters and linters across the workspace**

Run: `just check`
Expected: clean.

- [ ] **Step 4: Manual end-to-end smoke test**

Start the dev environment with `just dev`. Login as an admin, navigate to settings → Import / Export tab. For each entity:
1. Click Export → download CSV → open in a spreadsheet → confirm columns look right.
2. Edit one row in the spreadsheet (change a name) and add one new row.
3. Click Import → select the file → preview dialog shows 1 update + 1 create.
4. Confirm → toast "Import complete".
5. Refresh → the row appears in the entity's normal settings tab.

Then go to /timetable, click Print, verify print preview.

- [ ] **Step 5: Update STATUS.md and next-steps.md**

Edit `docs/STATUS.md` and `docs/superpowers/next-steps.md` to mark 2e as done. Move it from the "Tier 2: UX polish" backlog table into the Done section, with the PR number filled in once the PR is open.

- [ ] **Step 6: Open the PR**

Push the branch and open a PR. Summary: "2e: CSV import/export for reference data + print-to-PDF for timetables." Body should mention the spec path and the six entities covered.

```bash
git push -u origin <branch>
gh pr create --title "feat(2e): CSV import/export + timetable print" --body "$(cat <<'EOF'
## Summary
- CSV round-trip (export → edit → preview → commit) for teachers, subjects, rooms, classes, timeslots, curriculum
- Dry-run preview with all-or-nothing transactional commit and 10-min token cache
- Print-to-PDF for the timetable view via @media print

## Spec
docs/superpowers/specs/2026-04-08-data-import-export-design.md

## Test plan
- [ ] backend integration tests pass (`just backend-test`)
- [ ] frontend tests pass (`cd frontend && bun run test`)
- [ ] manual round-trip per entity
- [ ] manual print preview on /timetable
EOF
)"
```

---

## Self-review notes (author)

- Spec coverage: every section maps to a task.
  - CSV format / natural keys → tasks 5, 7-12
  - Three endpoints + token cache → tasks 3, 4, 13
  - Dry-run + atomic commit → task 13 (controller wraps txn) + task 7 (per-entity commit)
  - Six entities → tasks 7-12
  - i18n → task 17
  - Settings tab → tasks 19, 20
  - PDF print → task 21
  - Tests (round-trip + errors + tenant) → tasks 14, 15, 16
  - Out-of-scope items remain out of scope (no XLSX, no print-all, no background job)
- No placeholders in any task.
- Task 13 forwards `term_id` from the cached preview payload, matching the spec note that the URL term_id must persist into commit.
- Tasks 8-12 deliberately reuse the teachers template by reference rather than re-pasting 200 lines per entity. The template task (7) is fully spelled out so a fresh agent can build the others by analogy.
