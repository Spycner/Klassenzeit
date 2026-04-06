use axum::http::{header, HeaderName, StatusCode};
use klassenzeit_backend::app::App;
use klassenzeit_backend::keycloak::claims::AuthClaims;
use klassenzeit_backend::keycloak::middleware::AuthState;
use klassenzeit_backend::models::{app_users, school_memberships, schools};
use loco_rs::testing::prelude::*;
use sea_orm::ActiveModelTrait;
use serial_test::serial;

use crate::helpers::jwt::{TestKeyPair, TEST_CLIENT_ID, TEST_ISSUER};

fn valid_claims(sub: &str, email: &str) -> AuthClaims {
    AuthClaims {
        sub: sub.to_string(),
        email: email.to_string(),
        preferred_username: Some("Test User".to_string()),
        exp: (chrono::Utc::now().timestamp() + 300) as usize,
        iss: TEST_ISSUER.to_string(),
        aud: serde_json::json!(TEST_CLIENT_ID),
    }
}

async fn setup_admin_school(
    ctx: &loco_rs::app::AppContext,
    kp: &TestKeyPair,
    prefix: &str,
) -> (schools::Model, String) {
    let user = app_users::ActiveModel::new(
        format!("kc-{prefix}"),
        format!("{prefix}@example.com"),
        "Test Admin".into(),
    );
    let user = user.insert(&ctx.db).await.unwrap();

    let school =
        schools::ActiveModel::new(format!("{prefix}-school"), format!("{prefix}-school-slug"));
    let school = school.insert(&ctx.db).await.unwrap();

    let m = school_memberships::ActiveModel::new(user.id, school.id, "admin".into());
    m.insert(&ctx.db).await.unwrap();

    let claims = valid_claims(&format!("kc-{prefix}"), &format!("{prefix}@example.com"));
    let token = kp.create_token(&claims);
    (school, token)
}

fn url(school_id: uuid::Uuid) -> String {
    format!("/api/schools/{school_id}/load-example")
}

#[tokio::test]
#[serial]
async fn admin_loads_example_into_empty_school_returns_204() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "ld-empty").await;

        let resp = server
            .post(&url(school.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .await;

        resp.assert_status(StatusCode::NO_CONTENT);

        use klassenzeit_backend::models::_entities::{
            curriculum_entries, school_classes, subjects, teachers, terms, time_slots,
        };
        use sea_orm::{ColumnTrait, EntityTrait, PaginatorTrait, QueryFilter};

        assert!(terms::Entity::find().count(&ctx.db).await.unwrap() > 0);
        assert!(
            teachers::Entity::find()
                .filter(teachers::Column::SchoolId.eq(school.id))
                .count(&ctx.db)
                .await
                .unwrap()
                > 0
        );
        assert!(
            subjects::Entity::find()
                .filter(subjects::Column::SchoolId.eq(school.id))
                .count(&ctx.db)
                .await
                .unwrap()
                > 0
        );
        assert!(
            school_classes::Entity::find()
                .filter(school_classes::Column::SchoolId.eq(school.id))
                .count(&ctx.db)
                .await
                .unwrap()
                > 0
        );
        assert!(
            time_slots::Entity::find()
                .filter(time_slots::Column::SchoolId.eq(school.id))
                .count(&ctx.db)
                .await
                .unwrap()
                > 0
        );
        assert!(
            curriculum_entries::Entity::find()
                .filter(curriculum_entries::Column::SchoolId.eq(school.id))
                .count(&ctx.db)
                .await
                .unwrap()
                > 0
        );
    })
    .await;
}
