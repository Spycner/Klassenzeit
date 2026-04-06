use klassenzeit_scheduler::planning::ConstraintWeights;
use sea_orm::{ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, Set};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::models::_entities::school_scheduler_settings;

// ---------------------------------------------------------------------------
// DTO
// ---------------------------------------------------------------------------

fn default_one() -> i64 {
    1
}
fn default_two() -> i64 {
    2
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ConstraintWeightsDto {
    #[serde(default = "default_one")]
    pub w_preferred_slot: i64,
    #[serde(default = "default_one")]
    pub w_teacher_gap: i64,
    #[serde(default = "default_two")]
    pub w_subject_distribution: i64,
    #[serde(default = "default_one")]
    pub w_class_teacher_first_period: i64,

    #[serde(default)]
    pub soften_teacher_availability: Option<i64>,
    #[serde(default)]
    pub soften_teacher_max_hours: Option<i64>,
    #[serde(default)]
    pub soften_teacher_qualification: Option<i64>,
    #[serde(default)]
    pub soften_room_suitability: Option<i64>,
    #[serde(default)]
    pub soften_room_capacity: Option<i64>,
    #[serde(default)]
    pub soften_class_availability: Option<i64>,
}

impl Default for ConstraintWeightsDto {
    fn default() -> Self {
        Self {
            w_preferred_slot: 1,
            w_teacher_gap: 1,
            w_subject_distribution: 2,
            w_class_teacher_first_period: 1,
            soften_teacher_availability: None,
            soften_teacher_max_hours: None,
            soften_teacher_qualification: None,
            soften_room_suitability: None,
            soften_room_capacity: None,
            soften_class_availability: None,
        }
    }
}

impl From<ConstraintWeightsDto> for ConstraintWeights {
    fn from(dto: ConstraintWeightsDto) -> Self {
        Self {
            w_preferred_slot: dto.w_preferred_slot,
            w_teacher_gap: dto.w_teacher_gap,
            w_subject_distribution: dto.w_subject_distribution,
            w_class_teacher_first_period: dto.w_class_teacher_first_period,
            soften_teacher_availability: dto.soften_teacher_availability,
            soften_teacher_max_hours: dto.soften_teacher_max_hours,
            soften_teacher_qualification: dto.soften_teacher_qualification,
            soften_room_suitability: dto.soften_room_suitability,
            soften_room_capacity: dto.soften_room_capacity,
            soften_class_availability: dto.soften_class_availability,
        }
    }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

#[derive(Debug, thiserror::Error)]
pub enum ValidationError {
    #[error("{field} must be between {min} and {max}, got {value}")]
    OutOfRange {
        field: &'static str,
        min: i64,
        max: i64,
        value: i64,
    },
}

pub fn validate(dto: &ConstraintWeightsDto) -> Result<(), ValidationError> {
    fn check_soft(field: &'static str, v: i64) -> Result<(), ValidationError> {
        if !(0..=100).contains(&v) {
            return Err(ValidationError::OutOfRange {
                field,
                min: 0,
                max: 100,
                value: v,
            });
        }
        Ok(())
    }
    fn check_soften(field: &'static str, v: Option<i64>) -> Result<(), ValidationError> {
        if let Some(p) = v {
            if !(1..=100_000).contains(&p) {
                return Err(ValidationError::OutOfRange {
                    field,
                    min: 1,
                    max: 100_000,
                    value: p,
                });
            }
        }
        Ok(())
    }
    check_soft("w_preferred_slot", dto.w_preferred_slot)?;
    check_soft("w_teacher_gap", dto.w_teacher_gap)?;
    check_soft("w_subject_distribution", dto.w_subject_distribution)?;
    check_soft(
        "w_class_teacher_first_period",
        dto.w_class_teacher_first_period,
    )?;
    check_soften(
        "soften_teacher_availability",
        dto.soften_teacher_availability,
    )?;
    check_soften("soften_teacher_max_hours", dto.soften_teacher_max_hours)?;
    check_soften(
        "soften_teacher_qualification",
        dto.soften_teacher_qualification,
    )?;
    check_soften("soften_room_suitability", dto.soften_room_suitability)?;
    check_soften("soften_room_capacity", dto.soften_room_capacity)?;
    check_soften("soften_class_availability", dto.soften_class_availability)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// DB access
// ---------------------------------------------------------------------------

pub async fn load(
    db: &DatabaseConnection,
    school_id: Uuid,
) -> Result<ConstraintWeightsDto, sea_orm::DbErr> {
    let row = school_scheduler_settings::Entity::find()
        .filter(school_scheduler_settings::Column::SchoolId.eq(school_id))
        .one(db)
        .await?;
    match row {
        Some(r) => {
            let dto: ConstraintWeightsDto = serde_json::from_value(r.weights).unwrap_or_default();
            Ok(dto)
        }
        None => Ok(ConstraintWeightsDto::default()),
    }
}

pub async fn upsert(
    db: &DatabaseConnection,
    school_id: Uuid,
    dto: &ConstraintWeightsDto,
) -> Result<(), sea_orm::DbErr> {
    let now = chrono::Utc::now().into();
    let json = serde_json::to_value(dto)
        .map_err(|e| sea_orm::DbErr::Custom(format!("serialize weights: {e}")))?;

    let existing = school_scheduler_settings::Entity::find()
        .filter(school_scheduler_settings::Column::SchoolId.eq(school_id))
        .one(db)
        .await?;

    match existing {
        Some(m) => {
            let mut am: school_scheduler_settings::ActiveModel = m.into();
            am.weights = Set(json);
            am.updated_at = Set(now);
            am.update(db).await?;
        }
        None => {
            let am = school_scheduler_settings::ActiveModel {
                school_id: Set(school_id),
                weights: Set(json),
                created_at: Set(now),
                updated_at: Set(now),
            };
            am.insert(db).await?;
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_dto_matches_scheduler_defaults() {
        let dto = ConstraintWeightsDto::default();
        let weights: ConstraintWeights = dto.into();
        assert_eq!(weights, ConstraintWeights::default());
    }

    #[test]
    fn validate_rejects_negative_soft_weight() {
        let dto = ConstraintWeightsDto {
            w_teacher_gap: -1,
            ..ConstraintWeightsDto::default()
        };
        assert!(matches!(
            validate(&dto),
            Err(ValidationError::OutOfRange { .. })
        ));
    }

    #[test]
    fn validate_rejects_zero_soften_penalty() {
        let dto = ConstraintWeightsDto {
            soften_teacher_max_hours: Some(0),
            ..ConstraintWeightsDto::default()
        };
        assert!(matches!(
            validate(&dto),
            Err(ValidationError::OutOfRange { .. })
        ));
    }

    #[test]
    fn serde_missing_fields_uses_defaults() {
        let json = serde_json::json!({});
        let dto: ConstraintWeightsDto = serde_json::from_value(json).unwrap();
        assert_eq!(dto, ConstraintWeightsDto::default());
    }
}
