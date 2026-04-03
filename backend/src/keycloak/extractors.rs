use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use axum::http::HeaderMap;
use loco_rs::app::AppContext;
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter};
use uuid::Uuid;

use crate::models::{app_users, school_memberships, schools};

use super::claims::AuthClaims;
use super::errors::AuthError;

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

            let user = app_users::Model::find_by_keycloak_id(&db, &claims.sub)
                .await
                .map_err(|_| AuthError::InvalidToken("database error".into()))?;

            let user = match user {
                Some(u) => u,
                None => {
                    // Auto-create on first login
                    let new_user = app_users::ActiveModel::new(
                        claims.sub.clone(),
                        claims.email.clone(),
                        claims.display_name().to_string(),
                    );
                    new_user
                        .insert(&db)
                        .await
                        .map_err(|_| AuthError::InvalidToken("failed to create user".into()))?
                }
            };

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
        let db = state.db.clone();

        // We need to drive AuthUser extraction manually to avoid borrowing `parts` across await
        let claims = parts.extensions.get::<AuthClaims>().cloned();
        let db2 = db.clone();

        async move {
            // Replicate AuthUser logic inline to avoid re-borrowing parts
            let claims = claims.ok_or(AuthError::MissingAuthHeader)?;

            let user_opt = app_users::Model::find_by_keycloak_id(&db2, &claims.sub)
                .await
                .map_err(|_| AuthError::InvalidToken("database error".into()))?;

            let user = match user_opt {
                Some(u) => u,
                None => {
                    let new_user = app_users::ActiveModel::new(
                        claims.sub.clone(),
                        claims.email.clone(),
                        claims.display_name().to_string(),
                    );
                    new_user
                        .insert(&db2)
                        .await
                        .map_err(|_| AuthError::InvalidToken("failed to create user".into()))?
                }
            };

            let school_id = school_id_result?;

            let school = schools::Entity::find()
                .filter(schools::schools::Column::Id.eq(school_id))
                .one(&db)
                .await
                .map_err(|_| AuthError::InvalidSchoolId)?
                .ok_or(AuthError::InvalidSchoolId)?;

            let membership =
                school_memberships::Model::find_active_membership(&db, user.id, school_id)
                    .await
                    .map_err(|_| AuthError::NotAMember)?
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
