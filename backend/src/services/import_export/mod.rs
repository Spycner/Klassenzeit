//! CSV import/export for reference data.
//!
//! Public API:
//! - `EntityKind` — which entity is being imported/exported.
//! - `parse_entity_kind` — URL slug → `EntityKind`.
//!
//! See `docs/superpowers/specs/2026-04-08-data-import-export-design.md`.

pub mod csv_io;
pub mod teachers;
pub mod token_cache;

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
