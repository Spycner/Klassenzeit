use klassenzeit_backend::keycloak::claims::{validate_token, AuthClaims};
use klassenzeit_backend::keycloak::jwks::JwksClient;

use crate::helpers::jwt::{TestKeyPair, TEST_CLIENT_ID, TEST_ISSUER};

fn test_claims(exp_offset: i64) -> AuthClaims {
    let exp = (chrono::Utc::now().timestamp() + exp_offset) as usize;
    AuthClaims {
        sub: "kc-123".to_string(),
        email: "test@example.com".to_string(),
        preferred_username: Some("Test User".to_string()),
        exp,
        iss: TEST_ISSUER.to_string(),
        aud: serde_json::json!(TEST_CLIENT_ID),
    }
}

#[tokio::test]
async fn valid_token_returns_claims() {
    let kp = TestKeyPair::generate();
    let token = kp.create_token(&test_claims(300));
    let jwks = JwksClient::with_keys(kp.jwk_set);

    let claims = validate_token(&token, &jwks, TEST_ISSUER, TEST_CLIENT_ID)
        .await
        .unwrap();

    assert_eq!(claims.sub, "kc-123");
    assert_eq!(claims.email, "test@example.com");
    assert_eq!(claims.display_name(), "Test User");
}

#[tokio::test]
async fn expired_token_is_rejected() {
    let kp = TestKeyPair::generate();
    let token = kp.create_token(&test_claims(-300));
    let jwks = JwksClient::with_keys(kp.jwk_set);

    let result = validate_token(&token, &jwks, TEST_ISSUER, TEST_CLIENT_ID).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn wrong_issuer_is_rejected() {
    let kp = TestKeyPair::generate();
    let token = kp.create_token(&test_claims(300));
    let jwks = JwksClient::with_keys(kp.jwk_set);

    let result = validate_token(
        &token,
        &jwks,
        "http://wrong-issuer/realms/x",
        TEST_CLIENT_ID,
    )
    .await;
    assert!(result.is_err());
}

#[tokio::test]
async fn wrong_audience_is_rejected() {
    let kp = TestKeyPair::generate();
    let token = kp.create_token(&test_claims(300));
    let jwks = JwksClient::with_keys(kp.jwk_set);

    let result = validate_token(&token, &jwks, TEST_ISSUER, "wrong-client").await;
    assert!(result.is_err());
}

#[tokio::test]
async fn missing_preferred_username_falls_back_to_email() {
    let kp = TestKeyPair::generate();
    let mut claims = test_claims(300);
    claims.preferred_username = None;
    let token = kp.create_token(&claims);
    let jwks = JwksClient::with_keys(kp.jwk_set);

    let result = validate_token(&token, &jwks, TEST_ISSUER, TEST_CLIENT_ID)
        .await
        .unwrap();
    assert_eq!(result.display_name(), "test@example.com");
}
