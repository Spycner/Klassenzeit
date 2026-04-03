use axum::extract::Path;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use loco_rs::prelude::*;
use sea_orm::ActiveModelTrait;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::keycloak::errors::AuthError;
use crate::keycloak::extractors::SchoolContext;
use crate::models::{app_users, school_memberships};

const VALID_ROLES: &[&str] = &["admin", "teacher", "viewer"];

#[derive(Debug, Serialize)]
struct MemberResponse {
    user_id: String,
    email: String,
    display_name: String,
    role: String,
    is_active: bool,
    joined_at: String,
}

impl MemberResponse {
    fn from_membership_and_user(
        membership: &school_memberships::Model,
        user: &app_users::Model,
    ) -> Self {
        Self {
            user_id: user.id.to_string(),
            email: user.email.clone(),
            display_name: user.display_name.clone(),
            role: membership.role.clone(),
            is_active: membership.is_active,
            joined_at: membership.created_at.to_rfc3339(),
        }
    }
}

#[derive(Debug, Deserialize)]
struct AddMemberRequest {
    email: String,
    role: String,
}

#[derive(Debug, Deserialize)]
struct UpdateMemberRoleRequest {
    role: String,
}

/// GET /api/schools/:id/members — List all active members
async fn list(State(ctx): State<AppContext>, school_ctx: SchoolContext) -> Result<Response> {
    let members =
        school_memberships::Model::find_members_for_school(&ctx.db, school_ctx.school.id).await?;

    let resp: Vec<MemberResponse> = members
        .iter()
        .filter_map(|(membership, user)| {
            user.as_ref()
                .map(|u| MemberResponse::from_membership_and_user(membership, u))
        })
        .collect();

    format::json(resp)
}

/// POST /api/schools/:id/members — Add member by email (admin only)
async fn add(
    State(ctx): State<AppContext>,
    school_ctx: SchoolContext,
    Json(body): Json<AddMemberRequest>,
) -> impl IntoResponse {
    if school_ctx.role != "admin" {
        return AuthError::Forbidden("admin role required".into()).into_response();
    }

    if !VALID_ROLES.contains(&body.role.as_str()) {
        return (
            StatusCode::BAD_REQUEST,
            axum::Json(serde_json::json!({ "error": format!("invalid role: {}", body.role) })),
        )
            .into_response();
    }

    // Look up user by email
    let target_user = match app_users::Model::find_by_email(&ctx.db, &body.email).await {
        Ok(Some(u)) => u,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                axum::Json(serde_json::json!({ "error": "user not found" })),
            )
                .into_response();
        }
        Err(e) => return Error::wrap(e).into_response(),
    };

    // Check if already a member
    match school_memberships::Model::find_active_membership(
        &ctx.db,
        target_user.id,
        school_ctx.school.id,
    )
    .await
    {
        Ok(Some(_)) => {
            return (
                StatusCode::CONFLICT,
                axum::Json(serde_json::json!({ "error": "user is already a member" })),
            )
                .into_response();
        }
        Ok(None) => {}
        Err(e) => return Error::wrap(e).into_response(),
    }

    // Create membership
    let membership = school_memberships::ActiveModel::new(
        target_user.id,
        school_ctx.school.id,
        body.role.clone(),
    );
    let membership = match membership.insert(&ctx.db).await {
        Ok(m) => m,
        Err(e) => return Error::wrap(e).into_response(),
    };

    let resp = MemberResponse::from_membership_and_user(&membership, &target_user);
    (StatusCode::CREATED, axum::Json(resp)).into_response()
}

/// PUT /api/schools/:id/members/:user_id — Change member role (admin only)
async fn update_role(
    State(ctx): State<AppContext>,
    Path((_school_id, user_id)): Path<(Uuid, Uuid)>,
    school_ctx: SchoolContext,
    Json(body): Json<UpdateMemberRoleRequest>,
) -> impl IntoResponse {
    if school_ctx.role != "admin" {
        return AuthError::Forbidden("admin role required".into()).into_response();
    }

    if !VALID_ROLES.contains(&body.role.as_str()) {
        return (
            StatusCode::BAD_REQUEST,
            axum::Json(serde_json::json!({ "error": format!("invalid role: {}", body.role) })),
        )
            .into_response();
    }

    // Find the membership to update
    let membership = match school_memberships::Model::find_active_membership(
        &ctx.db,
        user_id,
        school_ctx.school.id,
    )
    .await
    {
        Ok(Some(m)) => m,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                axum::Json(serde_json::json!({ "error": "member not found" })),
            )
                .into_response();
        }
        Err(e) => return Error::wrap(e).into_response(),
    };

    // If demoting an admin, check they're not the last one
    if membership.role == "admin" && body.role != "admin" {
        match school_memberships::Model::count_admins(&ctx.db, school_ctx.school.id).await {
            Ok(count) if count <= 1 => {
                return AuthError::Forbidden("cannot demote the last admin".into()).into_response();
            }
            Err(e) => return Error::wrap(e).into_response(),
            _ => {}
        }
    }

    // Look up the user for the response
    let target_user = match app_users::Entity::find_by_id(user_id).one(&ctx.db).await {
        Ok(Some(u)) => u,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                axum::Json(serde_json::json!({ "error": "user not found" })),
            )
                .into_response();
        }
        Err(e) => return Error::wrap(e).into_response(),
    };

    let mut active: school_memberships::ActiveModel = membership.into();
    active.role = sea_orm::ActiveValue::Set(body.role);
    active.updated_at = sea_orm::ActiveValue::Set(chrono::Utc::now().into());

    let updated = match active.update(&ctx.db).await {
        Ok(m) => m,
        Err(e) => return Error::wrap(e).into_response(),
    };

    let resp = MemberResponse::from_membership_and_user(&updated, &target_user);
    axum::Json(resp).into_response()
}

/// DELETE /api/schools/:id/members/:user_id — Remove member (admin only, soft-delete)
async fn remove(
    State(ctx): State<AppContext>,
    Path((_school_id, user_id)): Path<(Uuid, Uuid)>,
    school_ctx: SchoolContext,
) -> impl IntoResponse {
    if school_ctx.role != "admin" {
        return AuthError::Forbidden("admin role required".into()).into_response();
    }

    // Find the membership
    let membership = match school_memberships::Model::find_active_membership(
        &ctx.db,
        user_id,
        school_ctx.school.id,
    )
    .await
    {
        Ok(Some(m)) => m,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                axum::Json(serde_json::json!({ "error": "member not found" })),
            )
                .into_response();
        }
        Err(e) => return Error::wrap(e).into_response(),
    };

    // If removing an admin, check they're not the last one
    if membership.role == "admin" {
        match school_memberships::Model::count_admins(&ctx.db, school_ctx.school.id).await {
            Ok(count) if count <= 1 => {
                return AuthError::Forbidden("cannot remove the last admin".into()).into_response();
            }
            Err(e) => return Error::wrap(e).into_response(),
            _ => {}
        }
    }

    // Soft-delete
    let mut active: school_memberships::ActiveModel = membership.into();
    active.is_active = sea_orm::ActiveValue::Set(false);
    active.updated_at = sea_orm::ActiveValue::Set(chrono::Utc::now().into());

    if let Err(e) = active.update(&ctx.db).await {
        return Error::wrap(e).into_response();
    }

    StatusCode::NO_CONTENT.into_response()
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/schools/{id}/members")
        .add("/", get(list).post(add))
        .add("/{user_id}", put(update_role).delete(remove))
}
