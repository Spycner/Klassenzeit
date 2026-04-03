use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use axum::http::HeaderMap;
use loco_rs::app::AppContext;
use sea_orm::{ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter};
use uuid::Uuid;

use crate::models::{app_users, school_memberships, schools};

use super::claims::AuthClaims;
use super::errors::AuthError;

/// Look up or auto-create an app_user from JWT claims.
/// Handles the race condition where two concurrent requests try to create the same user.
async fn resolve_user(
    db: &DatabaseConnection,
    claims: &AuthClaims,
) -> Result<app_users::Model, AuthError> {
    if let Some(user) = app_users::Model::find_by_keycloak_id(db, &claims.sub)
        .await
        .map_err(|e| AuthError::Internal(e.to_string()))?
    {
        return Ok(user);
    }

    // Auto-create on first login
    let new_user = app_users::ActiveModel::new(
        claims.sub.clone(),
        claims.email.clone(),
        claims.display_name().to_string(),
    );

    match new_user.insert(db).await {
        Ok(user) => Ok(user),
        Err(_) => {
            // Likely a unique constraint violation from a concurrent insert — re-fetch
            app_users::Model::find_by_keycloak_id(db, &claims.sub)
                .await
                .map_err(|e| AuthError::Internal(e.to_string()))?
                .ok_or_else(|| AuthError::Internal("user creation failed".into()))
        }
    }
}

/// Extractor that provides the authenticated user.
/// Reads AuthClaims from request extensions (set by JWT middleware).
/// Auto-creates the user in the database on first login.
#[derive(Debug, Clone)]
pub struct AuthUser {
    pub user: app_users::Model,
    pub claims: AuthClaims,
}

impl FromRequestParts<AppContext> for AuthUser {
    type Rejection = AuthError;

    fn from_request_parts(
        parts: &mut Parts,
        state: &AppContext,
    ) -> impl std::future::Future<Output = Result<Self, Self::Rejection>> + Send {
        let claims = parts.extensions.get::<AuthClaims>().cloned();
        let db = state.db.clone();

        async move {
            let claims = claims.ok_or(AuthError::MissingAuthHeader)?;
            let user = resolve_user(&db, &claims).await?;
            Ok(Self { user, claims })
        }
    }
}

/// Extractor that provides school-scoped access.
/// Requires `X-School-Id` header and validates the user has an active membership.
#[derive(Debug, Clone)]
pub struct SchoolContext {
    pub user: app_users::Model,
    pub school: schools::Model,
    pub role: String,
    pub claims: AuthClaims,
}

impl FromRequestParts<AppContext> for SchoolContext {
    type Rejection = AuthError;

    fn from_request_parts(
        parts: &mut Parts,
        state: &AppContext,
    ) -> impl std::future::Future<Output = Result<Self, Self::Rejection>> + Send {
        let school_id_result = parse_school_id(&parts.headers);
        let claims = parts.extensions.get::<AuthClaims>().cloned();
        let db = state.db.clone();

        async move {
            let claims = claims.ok_or(AuthError::MissingAuthHeader)?;
            let user = resolve_user(&db, &claims).await?;
            let school_id = school_id_result?;

            let school = schools::Entity::find()
                .filter(schools::schools::Column::Id.eq(school_id))
                .one(&db)
                .await
                .map_err(|e| AuthError::Internal(e.to_string()))?
                .ok_or(AuthError::InvalidSchoolId)?;

            let membership =
                school_memberships::Model::find_active_membership(&db, user.id, school_id)
                    .await
                    .map_err(|e| AuthError::Internal(e.to_string()))?
                    .ok_or(AuthError::NotAMember)?;

            Ok(Self {
                user,
                school,
                role: membership.role,
                claims,
            })
        }
    }
}

fn parse_school_id(headers: &HeaderMap) -> Result<Uuid, AuthError> {
    let header_value = headers
        .get("X-School-Id")
        .ok_or(AuthError::MissingSchoolId)?;

    let id_str = header_value
        .to_str()
        .map_err(|_| AuthError::InvalidSchoolId)?;

    Uuid::parse_str(id_str).map_err(|_| AuthError::InvalidSchoolId)
}
