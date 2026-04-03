use axum::extract::Path;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use loco_rs::prelude::*;
use sea_orm::{ActiveModelTrait, TransactionTrait};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::keycloak::errors::AuthError;
use crate::keycloak::extractors::{AuthUser, SchoolContext};
use crate::models::{school_memberships, schools};

#[derive(Debug, Deserialize)]
struct CreateSchoolRequest {
    name: String,
}

#[derive(Debug, Deserialize)]
struct UpdateSchoolRequest {
    name: Option<String>,
}

#[derive(Debug, Serialize)]
struct SchoolResponse {
    id: String,
    name: String,
    slug: String,
    role: String,
    created_at: String,
}

impl SchoolResponse {
    fn from_model(school: &schools::Model, role: &str) -> Self {
        Self {
            id: school.id.to_string(),
            name: school.name.clone(),
            slug: school.slug.clone(),
            role: role.to_string(),
            created_at: school.created_at.to_rfc3339(),
        }
    }
}

/// Generate a unique slug, appending -2, -3, etc. on collision.
async fn unique_slug(db: &sea_orm::DatabaseConnection, name: &str) -> Result<String> {
    let base = schools::generate_slug(name);
    if schools::Model::find_by_slug(db, &base).await?.is_none() {
        return Ok(base);
    }
    let mut counter = 2;
    loop {
        let candidate = format!("{base}-{counter}");
        if schools::Model::find_by_slug(db, &candidate)
            .await?
            .is_none()
        {
            return Ok(candidate);
        }
        counter += 1;
    }
}

/// POST /api/schools — Create a school (any authenticated user)
async fn create(
    State(ctx): State<AppContext>,
    auth: AuthUser,
    Json(body): Json<CreateSchoolRequest>,
) -> impl IntoResponse {
    let slug = match unique_slug(&ctx.db, &body.name).await {
        Ok(s) => s,
        Err(e) => return e.into_response(),
    };

    let txn = match ctx.db.begin().await {
        Ok(t) => t,
        Err(e) => return Error::wrap(e).into_response(),
    };

    let school = schools::ActiveModel::new(body.name, slug);
    let school = match school.insert(&txn).await {
        Ok(s) => s,
        Err(e) => return Error::wrap(e).into_response(),
    };

    let membership = school_memberships::ActiveModel::new(auth.user.id, school.id, "admin".into());
    if let Err(e) = membership.insert(&txn).await {
        return Error::wrap(e).into_response();
    }

    if let Err(e) = txn.commit().await {
        return Error::wrap(e).into_response();
    }

    let resp = SchoolResponse::from_model(&school, "admin");
    (StatusCode::CREATED, Json(resp)).into_response()
}

/// GET /api/schools — List schools the user belongs to
async fn list(State(ctx): State<AppContext>, auth: AuthUser) -> Result<Response> {
    let schools_with_roles = schools::Model::find_schools_for_user(&ctx.db, auth.user.id).await?;

    let resp: Vec<SchoolResponse> = schools_with_roles
        .iter()
        .map(|(school, role)| SchoolResponse::from_model(school, role))
        .collect();

    format::json(resp)
}

/// GET /api/schools/:id — Get school details
async fn get_one(_path: Path<Uuid>, school_ctx: SchoolContext) -> Result<Response> {
    let resp = SchoolResponse::from_model(&school_ctx.school, &school_ctx.role);
    format::json(resp)
}

/// PUT /api/schools/:id — Update school (admin only)
async fn update(
    State(ctx): State<AppContext>,
    _path: Path<Uuid>,
    school_ctx: SchoolContext,
    Json(body): Json<UpdateSchoolRequest>,
) -> impl IntoResponse {
    if school_ctx.role != "admin" {
        return AuthError::Forbidden("admin role required".into()).into_response();
    }

    let mut school: schools::ActiveModel = school_ctx.school.into();

    if let Some(name) = body.name {
        let slug = match unique_slug(&ctx.db, &name).await {
            Ok(s) => s,
            Err(e) => return e.into_response(),
        };
        school.name = sea_orm::ActiveValue::Set(name);
        school.slug = sea_orm::ActiveValue::Set(slug);
    }

    school.updated_at = sea_orm::ActiveValue::Set(chrono::Utc::now().into());

    let updated = match school.update(&ctx.db).await {
        Ok(s) => s,
        Err(e) => return Error::wrap(e).into_response(),
    };

    let resp = SchoolResponse::from_model(&updated, &school_ctx.role);
    Json(resp).into_response()
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/schools")
        .add("/", get(list).post(create))
        .add("/{id}", get(get_one).put(update))
}
