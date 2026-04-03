use loco_rs::prelude::*;
use serde_json::json;

use crate::keycloak::extractors::{AuthUser, SchoolContext};

/// GET /api/auth/me - Returns the authenticated user's info
async fn me(auth: AuthUser) -> Result<Response> {
    format::json(json!({
        "id": auth.user.id,
        "email": auth.user.email,
        "display_name": auth.user.display_name,
        "keycloak_id": auth.user.keycloak_id,
    }))
}

/// GET /api/auth/school - Returns the user's school context
async fn school(ctx: SchoolContext) -> Result<Response> {
    format::json(json!({
        "user_id": ctx.user.id,
        "school_id": ctx.school.id,
        "school_name": ctx.school.name,
        "role": ctx.role,
    }))
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/auth")
        .add("/me", get(me))
        .add("/school", get(school))
}
