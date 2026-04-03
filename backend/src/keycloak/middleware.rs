use axum::body::Body;
use axum::http::{header, Request};
use axum::middleware::Next;
use axum::response::Response;
use std::sync::Arc;

use super::claims::validate_token;
use super::config::KeycloakConfig;
use super::errors::AuthError;
use super::jwks::JwksClient;

#[derive(Clone)]
pub struct AuthState {
    pub jwks: Arc<JwksClient>,
    pub config: KeycloakConfig,
}

/// Middleware that validates JWT tokens and attaches AuthClaims to request extensions.
/// If no Authorization header is present, the request passes through without claims.
/// Extractors downstream enforce that claims exist for protected routes.
pub async fn jwt_middleware(
    axum::extract::State(auth): axum::extract::State<AuthState>,
    mut req: Request<Body>,
    next: Next,
) -> Result<Response, AuthError> {
    if let Some(auth_header) = req.headers().get(header::AUTHORIZATION) {
        let auth_str = auth_header
            .to_str()
            .map_err(|_| AuthError::MissingAuthHeader)?;

        let token = auth_str
            .strip_prefix("Bearer ")
            .ok_or(AuthError::MissingAuthHeader)?;

        let claims = validate_token(
            token,
            &auth.jwks,
            &auth.config.issuer(),
            &auth.config.client_id,
        )
        .await?;

        req.extensions_mut().insert(claims);
    }

    Ok(next.run(req).await)
}
