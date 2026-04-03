use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::json;

#[derive(Debug)]
pub enum AuthError {
    MissingAuthHeader,
    InvalidToken(String),
    JwksUnavailable,
    MissingSchoolId,
    InvalidSchoolId,
    NotAMember,
}

impl IntoResponse for AuthError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            Self::MissingAuthHeader => (
                StatusCode::UNAUTHORIZED,
                "missing or invalid authorization header",
            ),
            Self::InvalidToken(ref _e) => (StatusCode::UNAUTHORIZED, "invalid token"),
            Self::JwksUnavailable => (
                StatusCode::BAD_GATEWAY,
                "authentication service unavailable",
            ),
            Self::MissingSchoolId => (StatusCode::BAD_REQUEST, "missing X-School-Id header"),
            Self::InvalidSchoolId => (StatusCode::BAD_REQUEST, "invalid school ID format"),
            Self::NotAMember => (StatusCode::FORBIDDEN, "not a member of this school"),
        };

        let body = axum::Json(json!({ "error": message }));
        (status, body).into_response()
    }
}
