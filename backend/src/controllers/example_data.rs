use axum::extract::Path;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use loco_rs::prelude::*;
use sea_orm::{ColumnTrait, EntityTrait, PaginatorTrait, QueryFilter, TransactionTrait};
use uuid::Uuid;

use crate::keycloak::extractors::SchoolContext;
use crate::models::_entities::{
    curriculum_entries, rooms, school_classes, school_years, subjects, teachers, time_slots,
};
use crate::services::example_data::load_example_school_data;

fn require_admin(school_ctx: &SchoolContext) -> Result<(), (StatusCode, String)> {
    if school_ctx.role != "admin" {
        return Err((StatusCode::FORBIDDEN, "Admin access required".to_string()));
    }
    Ok(())
}

async fn school_has_any_data(
    db: &impl sea_orm::ConnectionTrait,
    school_id: Uuid,
) -> Result<bool, sea_orm::DbErr> {
    if school_years::Entity::find()
        .filter(school_years::Column::SchoolId.eq(school_id))
        .count(db)
        .await?
        > 0
    {
        return Ok(true);
    }
    if teachers::Entity::find()
        .filter(teachers::Column::SchoolId.eq(school_id))
        .count(db)
        .await?
        > 0
    {
        return Ok(true);
    }
    if subjects::Entity::find()
        .filter(subjects::Column::SchoolId.eq(school_id))
        .count(db)
        .await?
        > 0
    {
        return Ok(true);
    }
    if rooms::Entity::find()
        .filter(rooms::Column::SchoolId.eq(school_id))
        .count(db)
        .await?
        > 0
    {
        return Ok(true);
    }
    if school_classes::Entity::find()
        .filter(school_classes::Column::SchoolId.eq(school_id))
        .count(db)
        .await?
        > 0
    {
        return Ok(true);
    }
    if time_slots::Entity::find()
        .filter(time_slots::Column::SchoolId.eq(school_id))
        .count(db)
        .await?
        > 0
    {
        return Ok(true);
    }
    if curriculum_entries::Entity::find()
        .filter(curriculum_entries::Column::SchoolId.eq(school_id))
        .count(db)
        .await?
        > 0
    {
        return Ok(true);
    }
    Ok(false)
}

/// POST /api/schools/{school_id}/load-example
async fn load_example(
    State(ctx): State<AppContext>,
    Path(_school_id): Path<Uuid>,
    school_ctx: SchoolContext,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    require_admin(&school_ctx)?;
    let school_id = school_ctx.school.id;

    if school_has_any_data(&ctx.db, school_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    {
        return Err((
            StatusCode::CONFLICT,
            "School already has data — example loader skipped".to_string(),
        ));
    }

    let txn = ctx
        .db
        .begin()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if let Err(e) = load_example_school_data(&txn, school_id).await {
        let _ = txn.rollback().await;
        return Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string()));
    }

    txn.commit()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(StatusCode::NO_CONTENT)
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/schools/{school_id}")
        .add("/load-example", post(load_example))
}
