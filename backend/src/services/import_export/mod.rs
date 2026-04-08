//! CSV import/export for reference data.
//!
//! Public API:
//! - `EntityKind` — which entity is being imported/exported.
//! - `parse_entity_kind` — URL slug → `EntityKind`.
//!
//! See `docs/superpowers/specs/2026-04-08-data-import-export-design.md`.

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
