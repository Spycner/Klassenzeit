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

#[allow(clippy::result_large_err)]
fn require_admin(ctx: &SchoolContext) -> Result<(), axum::response::Response> {
    if ctx.role != "admin" {
        Err(AuthError::Forbidden("admin role required".into()).into_response())
    } else {
        Ok(())
    }
}

#[allow(clippy::result_large_err)]
fn entity_or_404(slug: &str) -> Result<EntityKind, axum::response::Response> {
    EntityKind::from_slug(slug)
        .ok_or_else(|| (StatusCode::NOT_FOUND, format!("unknown entity '{slug}'")).into_response())
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
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()).into_response())?
    {
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
        None => return (StatusCode::GONE, "preview token expired or not found").into_response(),
    };

    let rows: Vec<crate::services::import_export::PreviewRow> =
        serde_json::from_value(entry.payload["rows"].clone()).unwrap_or_default();
    let term_id: Option<Uuid> = serde_json::from_value(entry.payload["term_id"].clone())
        .ok()
        .flatten();

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
                return (
                    StatusCode::BAD_REQUEST,
                    "term_id missing from cached preview",
                )
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
