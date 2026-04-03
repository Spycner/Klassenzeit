# Auth Middleware Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Keycloak JWT authentication and DB-driven multi-tenant authorization to the Loco backend.

**Architecture:** JWT middleware validates tokens against cached Keycloak JWKS keys and attaches claims to request extensions. Axum extractors (`AuthUser`, `SchoolContext`) read claims and resolve user identity and school-scoped access from the database. A Loco Initializer bootstraps the JWKS cache at startup.

**Tech Stack:** jsonwebtoken (JWT validation), reqwest (JWKS fetching), rsa + base64 (test key generation), Loco Initializer + SharedStore (state management)

---

## File Structure

**Create:**
- `backend/src/keycloak/mod.rs` — module exports, re-exports
- `backend/src/keycloak/config.rs` — `KeycloakConfig` parsed from `settings.keycloak` in YAML
- `backend/src/keycloak/errors.rs` — `AuthError` enum → Axum error responses
- `backend/src/keycloak/jwks.rs` — `JwksClient` with caching + refresh-on-failure
- `backend/src/keycloak/claims.rs` — `AuthClaims` struct, JWT decoding
- `backend/src/keycloak/middleware.rs` — Axum middleware layer
- `backend/src/keycloak/extractors.rs` — `AuthUser`, `SchoolContext` extractors
- `backend/src/keycloak/initializer.rs` — Loco `Initializer` impl
- `backend/src/controllers/auth.rs` — demo `/api/auth/me` and `/api/auth/school` endpoints
- `backend/tests/helpers/mod.rs` — test helper module
- `backend/tests/helpers/jwt.rs` — test keypair generation, JWT signing, mock JWKS

**Modify:**
- `backend/Cargo.toml` — add jsonwebtoken, reqwest; dev-deps: rsa, base64, rand
- `backend/src/lib.rs` — add `pub mod keycloak;`
- `backend/src/app.rs` — register initializer, add auth routes
- `backend/src/controllers/mod.rs` — add `pub mod auth;`
- `backend/config/development.yaml` — add `settings.keycloak`, remove `auth.jwt`
- `backend/config/test.yaml` — add `settings.keycloak`, remove `auth.jwt`
- `backend/tests/mod.rs` — add `mod helpers;`
- `backend/tests/requests/mod.rs` — add `mod auth;`

---

### Task 1: Add Dependencies and Module Skeleton

**Files:**
- Modify: `backend/Cargo.toml`
- Create: `backend/src/keycloak/mod.rs`
- Modify: `backend/src/lib.rs`

- [ ] **Step 1: Add dependencies to Cargo.toml**

Add to `[dependencies]`:
```toml
jsonwebtoken = { version = "9" }
reqwest = { version = "0.12", default-features = false, features = ["json", "rustls-tls"] }
```

Add to `[dev-dependencies]`:
```toml
rsa = { version = "0.9", features = ["pem"] }
rand = "0.8"
base64 = "0.22"
```

- [ ] **Step 2: Create keycloak module skeleton**

Create `backend/src/keycloak/mod.rs`:
```rust
pub mod claims;
pub mod config;
pub mod errors;
pub mod extractors;
pub mod initializer;
pub mod jwks;
pub mod middleware;
```

- [ ] **Step 3: Add keycloak module to lib.rs**

In `backend/src/lib.rs`, add:
```rust
pub mod keycloak;
```

- [ ] **Step 4: Create stub files so it compiles**

Create each submodule as an empty file (we'll fill them in subsequent tasks):

`backend/src/keycloak/config.rs`:
```rust
```

`backend/src/keycloak/errors.rs`:
```rust
```

`backend/src/keycloak/claims.rs`:
```rust
```

`backend/src/keycloak/jwks.rs`:
```rust
```

`backend/src/keycloak/middleware.rs`:
```rust
```

`backend/src/keycloak/extractors.rs`:
```rust
```

`backend/src/keycloak/initializer.rs`:
```rust
```

- [ ] **Step 5: Verify it compiles**

Run: `cd backend && cargo check`
Expected: compiles with no errors (warnings about empty files are fine)

- [ ] **Step 6: Commit**

```bash
git add backend/Cargo.toml backend/src/keycloak/ backend/src/lib.rs
git commit -m "Add keycloak module skeleton and auth dependencies"
```

---

### Task 2: Config and Error Types

**Files:**
- Create: `backend/src/keycloak/config.rs`
- Create: `backend/src/keycloak/errors.rs`
- Modify: `backend/config/development.yaml`
- Modify: `backend/config/test.yaml`

- [ ] **Step 1: Write KeycloakConfig**

`backend/src/keycloak/config.rs`:
```rust
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct KeycloakConfig {
    pub url: String,
    pub realm: String,
    pub client_id: String,
}

impl KeycloakConfig {
    pub fn jwks_url(&self) -> String {
        format!(
            "{}/realms/{}/protocol/openid-connect/certs",
            self.url.trim_end_matches('/'),
            self.realm
        )
    }

    pub fn issuer(&self) -> String {
        format!(
            "{}/realms/{}",
            self.url.trim_end_matches('/'),
            self.realm
        )
    }

    pub fn from_config(config: &loco_rs::config::Config) -> loco_rs::Result<Self> {
        let settings = config
            .settings
            .as_ref()
            .ok_or_else(|| loco_rs::Error::Message("missing settings in config".into()))?;
        let keycloak = settings
            .get("keycloak")
            .ok_or_else(|| loco_rs::Error::Message("missing settings.keycloak in config".into()))?;
        serde_json::from_value(keycloak.clone())
            .map_err(|e| loco_rs::Error::Message(format!("invalid keycloak config: {e}")))
    }
}
```

- [ ] **Step 2: Write AuthError**

`backend/src/keycloak/errors.rs`:
```rust
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
            Self::MissingAuthHeader => {
                (StatusCode::UNAUTHORIZED, "missing or invalid authorization header")
            }
            Self::InvalidToken(ref _e) => (StatusCode::UNAUTHORIZED, "invalid token"),
            Self::JwksUnavailable => {
                (StatusCode::BAD_GATEWAY, "authentication service unavailable")
            }
            Self::MissingSchoolId => (StatusCode::BAD_REQUEST, "missing X-School-Id header"),
            Self::InvalidSchoolId => (StatusCode::BAD_REQUEST, "invalid school ID format"),
            Self::NotAMember => (StatusCode::FORBIDDEN, "not a member of this school"),
        };

        let body = axum::Json(json!({ "error": message }));
        (status, body).into_response()
    }
}
```

- [ ] **Step 3: Add keycloak settings to development.yaml**

Replace the `auth:` section at the bottom of `backend/config/development.yaml` with:

```yaml
# Keycloak configuration
settings:
  keycloak:
    url: "http://keycloak-dev:8080"
    realm: "klassenzeit"
    client_id: "klassenzeit-dev"
```

Remove the old `auth:` block entirely.

- [ ] **Step 4: Add keycloak settings to test.yaml**

Replace the `auth:` section at the bottom of `backend/config/test.yaml` with:

```yaml
# Keycloak configuration (overridden by test fixtures)
settings:
  keycloak:
    url: "http://localhost:0"
    realm: "klassenzeit"
    client_id: "klassenzeit-test"
```

Remove the old `auth:` block entirely.

- [ ] **Step 5: Update mod.rs exports**

Update `backend/src/keycloak/mod.rs`:
```rust
pub mod claims;
pub mod config;
pub mod errors;
pub mod extractors;
pub mod initializer;
pub mod jwks;
pub mod middleware;

pub use config::KeycloakConfig;
pub use errors::AuthError;
```

- [ ] **Step 6: Verify it compiles**

Run: `cd backend && cargo check`
Expected: compiles with no errors

- [ ] **Step 7: Commit**

```bash
git add backend/src/keycloak/config.rs backend/src/keycloak/errors.rs backend/src/keycloak/mod.rs backend/config/development.yaml backend/config/test.yaml
git commit -m "Add keycloak config struct and auth error types"
```

---

### Task 3: JWKS Client

**Files:**
- Create: `backend/src/keycloak/jwks.rs`

- [ ] **Step 1: Write the JWKS client**

`backend/src/keycloak/jwks.rs`:
```rust
use jsonwebtoken::jwk::{Jwk, JwkSet};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing;

use super::config::KeycloakConfig;

#[derive(Clone)]
pub struct JwksClient {
    jwks_url: String,
    http: reqwest::Client,
    keys: Arc<RwLock<JwkSet>>,
}

impl JwksClient {
    pub async fn new(config: &KeycloakConfig) -> Result<Self, reqwest::Error> {
        let http = reqwest::Client::new();
        let jwks_url = config.jwks_url();
        let keys = Self::fetch_keys(&http, &jwks_url).await?;
        tracing::info!(url = %jwks_url, count = keys.keys.len(), "fetched JWKS keys");

        Ok(Self {
            jwks_url,
            http,
            keys: Arc::new(RwLock::new(keys)),
        })
    }

    /// Create a JwksClient with pre-loaded keys (for testing).
    pub fn with_keys(jwk_set: JwkSet) -> Self {
        Self {
            jwks_url: String::new(),
            http: reqwest::Client::new(),
            keys: Arc::new(RwLock::new(jwk_set)),
        }
    }

    /// Find a JWK by key ID. If not found, refresh keys and try again.
    pub async fn find_key(&self, kid: &str) -> Option<Jwk> {
        // Try cached keys first
        {
            let keys = self.keys.read().await;
            if let Some(jwk) = keys.keys.iter().find(|k| k.common.key_id.as_deref() == Some(kid)) {
                return Some(jwk.clone());
            }
        }

        // Cache miss — refresh
        if self.jwks_url.is_empty() {
            return None; // test mode, no URL to fetch from
        }

        tracing::info!(kid = %kid, "JWKS cache miss, refreshing keys");
        match Self::fetch_keys(&self.http, &self.jwks_url).await {
            Ok(new_keys) => {
                let result = new_keys
                    .keys
                    .iter()
                    .find(|k| k.common.key_id.as_deref() == Some(kid))
                    .cloned();
                *self.keys.write().await = new_keys;
                result
            }
            Err(e) => {
                tracing::error!(error = %e, "failed to refresh JWKS keys");
                None
            }
        }
    }

    async fn fetch_keys(http: &reqwest::Client, url: &str) -> Result<JwkSet, reqwest::Error> {
        http.get(url).send().await?.json::<JwkSet>().await
    }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd backend && cargo check`
Expected: compiles (unused warnings are fine)

- [ ] **Step 3: Commit**

```bash
git add backend/src/keycloak/jwks.rs
git commit -m "Add JWKS client with caching and refresh-on-miss"
```

---

### Task 4: JWT Claims and Validation

**Files:**
- Create: `backend/src/keycloak/claims.rs`
- Create: `backend/tests/helpers/mod.rs`
- Create: `backend/tests/helpers/jwt.rs`
- Modify: `backend/tests/mod.rs`

- [ ] **Step 1: Write the test helpers for JWT generation**

Create `backend/tests/helpers/mod.rs`:
```rust
pub mod jwt;
```

Create `backend/tests/helpers/jwt.rs`:
```rust
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use jsonwebtoken::jwk::{
    AlgorithmParameters, CommonParameters, Jwk, JwkSet, KeyAlgorithm, PublicKeyUse,
    RSAKeyParameters,
};
use jsonwebtoken::{encode, EncodingKey, Header};
use rsa::pkcs1::EncodeRsaPrivateKey;
use rsa::traits::PublicKeyParts;
use rsa::RsaPrivateKey;
use serde::Serialize;

pub const TEST_KID: &str = "test-key-1";
pub const TEST_ISSUER: &str = "http://localhost:0/realms/klassenzeit";
pub const TEST_CLIENT_ID: &str = "klassenzeit-test";

pub struct TestKeyPair {
    pub encoding_key: EncodingKey,
    pub jwk_set: JwkSet,
}

impl TestKeyPair {
    pub fn generate() -> Self {
        let mut rng = rand::thread_rng();
        let private_key = RsaPrivateKey::new(&mut rng, 2048).unwrap();
        let private_pem = private_key
            .to_pkcs1_pem(rsa::pkcs1::LineEnding::LF)
            .unwrap();
        let encoding_key = EncodingKey::from_rsa_pem(private_pem.as_bytes()).unwrap();

        let public_key = private_key.to_public_key();
        let n = URL_SAFE_NO_PAD.encode(public_key.n().to_bytes_be());
        let e = URL_SAFE_NO_PAD.encode(public_key.e().to_bytes_be());

        let jwk = Jwk {
            common: CommonParameters {
                public_key_use: Some(PublicKeyUse::Signature),
                key_algorithm: Some(KeyAlgorithm::RS256),
                key_id: Some(TEST_KID.to_string()),
                ..Default::default()
            },
            algorithm: AlgorithmParameters::RSA(RSAKeyParameters {
                key_type: Default::default(),
                n,
                e,
            }),
        };

        Self {
            encoding_key,
            jwk_set: JwkSet { keys: vec![jwk] },
        }
    }

    pub fn create_token(&self, claims: &impl Serialize) -> String {
        let mut header = Header::new(jsonwebtoken::Algorithm::RS256);
        header.kid = Some(TEST_KID.to_string());
        encode(&header, claims, &self.encoding_key).unwrap()
    }
}
```

- [ ] **Step 2: Add helpers module to test mod.rs**

In `backend/tests/mod.rs`, add `mod helpers;`:
```rust
mod helpers;
mod models;
mod requests;
mod tasks;
mod workers;
```

- [ ] **Step 3: Write failing test for JWT claims validation**

Add a `#[cfg(test)]` module at the bottom of `backend/src/keycloak/claims.rs`:

First, write the `AuthClaims` struct and `validate_token` function signature as stubs, then the tests.

`backend/src/keycloak/claims.rs`:
```rust
use jsonwebtoken::{decode, Algorithm, DecodingKey, TokenData, Validation};
use serde::{Deserialize, Serialize};

use super::errors::AuthError;
use super::jwks::JwksClient;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthClaims {
    pub sub: String,
    pub email: String,
    #[serde(default)]
    pub preferred_username: Option<String>,
    pub exp: usize,
    pub iss: String,
    pub aud: serde_json::Value,
}

impl AuthClaims {
    pub fn display_name(&self) -> &str {
        self.preferred_username
            .as_deref()
            .unwrap_or(&self.email)
    }
}

pub async fn validate_token(
    token: &str,
    jwks: &JwksClient,
    issuer: &str,
    client_id: &str,
) -> Result<AuthClaims, AuthError> {
    // Decode the header to get the kid
    let header = jsonwebtoken::decode_header(token)
        .map_err(|e| AuthError::InvalidToken(e.to_string()))?;

    let kid = header
        .kid
        .ok_or_else(|| AuthError::InvalidToken("missing kid in token header".into()))?;

    // Find the signing key
    let jwk = jwks
        .find_key(&kid)
        .await
        .ok_or(AuthError::JwksUnavailable)?;

    let decoding_key = DecodingKey::from_jwk(&jwk)
        .map_err(|e| AuthError::InvalidToken(e.to_string()))?;

    // Validate the token
    let mut validation = Validation::new(Algorithm::RS256);
    validation.set_issuer(&[issuer]);
    validation.set_audience(&[client_id]);

    let token_data: TokenData<AuthClaims> = decode(token, &decoding_key, &validation)
        .map_err(|e| AuthError::InvalidToken(e.to_string()))?;

    Ok(token_data.claims)
}
```

- [ ] **Step 4: Write unit tests for claims validation**

Create `backend/tests/keycloak/mod.rs`:
```rust
mod claims;
```

Create `backend/tests/keycloak/claims.rs`:
```rust
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
    let jwks = JwksClient::with_keys(kp.jwk_set);
    let token = kp.create_token(&test_claims(300));

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
    let jwks = JwksClient::with_keys(kp.jwk_set);
    let token = kp.create_token(&test_claims(-300)); // expired 5 min ago

    let result = validate_token(&token, &jwks, TEST_ISSUER, TEST_CLIENT_ID).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn wrong_issuer_is_rejected() {
    let kp = TestKeyPair::generate();
    let jwks = JwksClient::with_keys(kp.jwk_set);
    let token = kp.create_token(&test_claims(300));

    let result = validate_token(&token, &jwks, "http://wrong-issuer/realms/x", TEST_CLIENT_ID).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn wrong_audience_is_rejected() {
    let kp = TestKeyPair::generate();
    let jwks = JwksClient::with_keys(kp.jwk_set);
    let token = kp.create_token(&test_claims(300));

    let result = validate_token(&token, &jwks, TEST_ISSUER, "wrong-client").await;
    assert!(result.is_err());
}

#[tokio::test]
async fn missing_preferred_username_falls_back_to_email() {
    let kp = TestKeyPair::generate();
    let jwks = JwksClient::with_keys(kp.jwk_set);
    let mut claims = test_claims(300);
    claims.preferred_username = None;
    let token = kp.create_token(&claims);

    let result = validate_token(&token, &jwks, TEST_ISSUER, TEST_CLIENT_ID)
        .await
        .unwrap();
    assert_eq!(result.display_name(), "test@example.com");
}
```

- [ ] **Step 5: Add keycloak test module to tests/mod.rs**

In `backend/tests/mod.rs`, add `mod keycloak;`:
```rust
mod helpers;
mod keycloak;
mod models;
mod requests;
mod tasks;
mod workers;
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && cargo test --test mod keycloak -- --nocapture`
Expected: all 5 tests pass

- [ ] **Step 7: Commit**

```bash
git add backend/src/keycloak/claims.rs backend/tests/helpers/ backend/tests/keycloak/ backend/tests/mod.rs
git commit -m "Add JWT claims validation with unit tests"
```

---

### Task 5: Auth Middleware

**Files:**
- Create: `backend/src/keycloak/middleware.rs`

- [ ] **Step 1: Write the JWT middleware**

`backend/src/keycloak/middleware.rs`:
```rust
use axum::body::Body;
use axum::http::{header, Request};
use axum::middleware::Next;
use axum::response::Response;
use std::sync::Arc;

use super::claims::{validate_token, AuthClaims};
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
```

- [ ] **Step 2: Update mod.rs exports**

Update `backend/src/keycloak/mod.rs`:
```rust
pub mod claims;
pub mod config;
pub mod errors;
pub mod extractors;
pub mod initializer;
pub mod jwks;
pub mod middleware;

pub use claims::AuthClaims;
pub use config::KeycloakConfig;
pub use errors::AuthError;
pub use middleware::AuthState;
```

- [ ] **Step 3: Verify it compiles**

Run: `cd backend && cargo check`
Expected: compiles (unused warnings are fine)

- [ ] **Step 4: Commit**

```bash
git add backend/src/keycloak/middleware.rs backend/src/keycloak/mod.rs
git commit -m "Add JWT validation middleware"
```

---

### Task 6: AuthUser Extractor

**Files:**
- Create: `backend/src/keycloak/extractors.rs`

- [ ] **Step 1: Write the AuthUser extractor**

`backend/src/keycloak/extractors.rs`:
```rust
use axum::async_trait;
use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use loco_rs::app::AppContext;
use sea_orm::ActiveModelTrait;

use crate::models::app_users;

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

#[async_trait]
impl FromRequestParts<AppContext> for AuthUser {
    type Rejection = AuthError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppContext,
    ) -> Result<Self, Self::Rejection> {
        let claims = parts
            .extensions
            .get::<AuthClaims>()
            .cloned()
            .ok_or(AuthError::MissingAuthHeader)?;

        let user = app_users::Model::find_by_keycloak_id(&state.db, &claims.sub)
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
                    .insert(&state.db)
                    .await
                    .map_err(|_| AuthError::InvalidToken("failed to create user".into()))?
            }
        };

        Ok(Self { user, claims })
    }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd backend && cargo check`
Expected: compiles

- [ ] **Step 3: Commit**

```bash
git add backend/src/keycloak/extractors.rs
git commit -m "Add AuthUser extractor with auto-create on first login"
```

---

### Task 7: SchoolContext Extractor

**Files:**
- Modify: `backend/src/keycloak/extractors.rs`
- Modify: `backend/src/models/school_memberships.rs`

- [ ] **Step 1: Add find_active_membership to school_memberships model**

Add to `backend/src/models/school_memberships.rs` on the `Model` impl:

```rust
impl Model {
    pub async fn find_active_membership(
        db: &DatabaseConnection,
        user_id: Uuid,
        school_id: Uuid,
    ) -> Result<Option<Self>, DbErr> {
        Entity::find()
            .filter(school_memberships::Column::UserId.eq(user_id))
            .filter(school_memberships::Column::SchoolId.eq(school_id))
            .filter(school_memberships::Column::IsActive.eq(true))
            .one(db)
            .await
    }
}
```

Note: you'll need to add `use uuid::Uuid;` if not already imported, and add `use sea_orm::entity::prelude::*;` for the filter methods. The existing file already has these imports.

- [ ] **Step 2: Write the SchoolContext extractor**

Add to `backend/src/keycloak/extractors.rs`:

```rust
use axum::http::HeaderMap;
use uuid::Uuid;

use crate::models::{school_memberships, schools};

/// Extractor that provides school-scoped access.
/// Requires `X-School-Id` header and validates the user has an active membership.
#[derive(Debug, Clone)]
pub struct SchoolContext {
    pub user: app_users::Model,
    pub school: schools::Model,
    pub role: String,
    pub claims: AuthClaims,
}

#[async_trait]
impl FromRequestParts<AppContext> for SchoolContext {
    type Rejection = AuthError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppContext,
    ) -> Result<Self, Self::Rejection> {
        // First, get the authenticated user
        let auth_user = AuthUser::from_request_parts(parts, state).await?;

        // Parse X-School-Id header
        let school_id = parse_school_id(&parts.headers)?;

        // Look up school
        let school = schools::Entity::find_by_id(school_id)
            .one(&state.db)
            .await
            .map_err(|_| AuthError::InvalidSchoolId)?
            .ok_or(AuthError::InvalidSchoolId)?;

        // Validate active membership
        let membership = school_memberships::Model::find_active_membership(
            &state.db,
            auth_user.user.id,
            school_id,
        )
        .await
        .map_err(|_| AuthError::NotAMember)?
        .ok_or(AuthError::NotAMember)?;

        Ok(Self {
            user: auth_user.user,
            school,
            role: membership.role,
            claims: auth_user.claims,
        })
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
```

- [ ] **Step 3: Add needed imports to the top of extractors.rs**

Make sure these imports are at the top of `backend/src/keycloak/extractors.rs`:

```rust
use axum::async_trait;
use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use axum::http::HeaderMap;
use loco_rs::app::AppContext;
use sea_orm::{ActiveModelTrait, EntityTrait};
use uuid::Uuid;

use crate::models::{app_users, school_memberships, schools};

use super::claims::AuthClaims;
use super::errors::AuthError;
```

- [ ] **Step 4: Update mod.rs exports**

Update `backend/src/keycloak/mod.rs`:
```rust
pub mod claims;
pub mod config;
pub mod errors;
pub mod extractors;
pub mod initializer;
pub mod jwks;
pub mod middleware;

pub use claims::AuthClaims;
pub use config::KeycloakConfig;
pub use errors::AuthError;
pub use extractors::{AuthUser, SchoolContext};
pub use middleware::AuthState;
```

- [ ] **Step 5: Verify it compiles**

Run: `cd backend && cargo check`
Expected: compiles

- [ ] **Step 6: Commit**

```bash
git add backend/src/keycloak/extractors.rs backend/src/keycloak/mod.rs backend/src/models/school_memberships.rs
git commit -m "Add SchoolContext extractor with membership validation"
```

---

### Task 8: Initializer, Demo Routes, and Wiring

**Files:**
- Create: `backend/src/keycloak/initializer.rs`
- Create: `backend/src/controllers/auth.rs`
- Modify: `backend/src/controllers/mod.rs`
- Modify: `backend/src/app.rs`

- [ ] **Step 1: Write the Keycloak initializer**

`backend/src/keycloak/initializer.rs`:
```rust
use async_trait::async_trait;
use axum::Router;
use loco_rs::app::{AppContext, Initializer};
use loco_rs::Result;
use std::sync::Arc;

use super::config::KeycloakConfig;
use super::jwks::JwksClient;
use super::middleware::{jwt_middleware, AuthState};

pub struct KeycloakInitializer;

#[async_trait]
impl Initializer for KeycloakInitializer {
    fn name(&self) -> String {
        "keycloak".to_string()
    }

    async fn before_run(&self, ctx: &AppContext) -> Result<()> {
        let config = KeycloakConfig::from_config(&ctx.config)?;
        tracing::info!(
            realm = %config.realm,
            jwks_url = %config.jwks_url(),
            "initializing Keycloak auth"
        );

        let jwks = match JwksClient::new(&config).await {
            Ok(jwks) => jwks,
            Err(e) => {
                tracing::warn!(
                    error = %e,
                    "failed to fetch JWKS keys at startup, will retry on first request"
                );
                JwksClient::with_keys(jsonwebtoken::jwk::JwkSet { keys: vec![] })
            }
        };

        let auth_state = AuthState {
            jwks: Arc::new(jwks),
            config,
        };
        ctx.shared_store.insert(auth_state);

        Ok(())
    }

    async fn after_routes(&self, router: Router<AppContext>, ctx: &AppContext) -> Result<Router<AppContext>> {
        let auth_state = ctx
            .shared_store
            .get_ref::<AuthState>()
            .expect("AuthState not initialized");

        Ok(router.layer(axum::middleware::from_fn_with_state(
            (*auth_state).clone(),
            jwt_middleware,
        )))
    }
}
```

- [ ] **Step 2: Write demo auth controller**

Create `backend/src/controllers/auth.rs`:
```rust
use axum::response::IntoResponse;
use loco_rs::prelude::*;
use serde_json::json;

use crate::keycloak::extractors::{AuthUser, SchoolContext};

/// GET /api/auth/me - Returns the authenticated user's info
async fn me(auth: AuthUser) -> impl IntoResponse {
    format::json(json!({
        "id": auth.user.id,
        "email": auth.user.email,
        "display_name": auth.user.display_name,
        "keycloak_id": auth.user.keycloak_id,
    }))
}

/// GET /api/auth/school - Returns the user's school context
async fn school(ctx: SchoolContext) -> impl IntoResponse {
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
```

- [ ] **Step 3: Register controller module**

Update `backend/src/controllers/mod.rs`:
```rust
pub mod auth;
```

- [ ] **Step 4: Wire up initializer and routes in app.rs**

Update `backend/src/app.rs`:

In the imports, add:
```rust
use crate::keycloak::initializer::KeycloakInitializer;
use crate::controllers;
```

Update `initializers()`:
```rust
async fn initializers(_ctx: &AppContext) -> Result<Vec<Box<dyn Initializer>>> {
    Ok(vec![Box::new(KeycloakInitializer)])
}
```

Update `routes()`:
```rust
fn routes(_ctx: &AppContext) -> AppRoutes {
    AppRoutes::with_default_routes()
        .add_route(controllers::auth::routes())
}
```

- [ ] **Step 5: Verify it compiles**

Run: `cd backend && cargo check`
Expected: compiles

- [ ] **Step 6: Commit**

```bash
git add backend/src/keycloak/initializer.rs backend/src/controllers/auth.rs backend/src/controllers/mod.rs backend/src/app.rs
git commit -m "Add keycloak initializer, demo auth endpoints, wire up routes"
```

---

### Task 9: Integration Tests

**Files:**
- Create: `backend/tests/requests/auth.rs`
- Modify: `backend/tests/requests/mod.rs`

- [ ] **Step 1: Update requests test module**

`backend/tests/requests/mod.rs`:
```rust
mod auth;
```

- [ ] **Step 2: Write integration tests**

Create `backend/tests/requests/auth.rs`:
```rust
use axum::http::{header, StatusCode};
use klassenzeit_backend::app::App;
use loco_rs::testing::prelude::*;
use sea_orm::ActiveModelTrait;
use serial_test::serial;
use std::sync::Arc;

use klassenzeit_backend::keycloak::claims::AuthClaims;
use klassenzeit_backend::keycloak::jwks::JwksClient;
use klassenzeit_backend::keycloak::middleware::AuthState;
use klassenzeit_backend::keycloak::KeycloakConfig;
use klassenzeit_backend::models::{app_users, school_memberships, schools};

use crate::helpers::jwt::{TestKeyPair, TEST_CLIENT_ID, TEST_ISSUER};

fn test_config() -> KeycloakConfig {
    KeycloakConfig {
        url: "http://localhost:0".to_string(),
        realm: "klassenzeit".to_string(),
        client_id: TEST_CLIENT_ID.to_string(),
    }
}

fn setup_auth(boot: &boot_test::BootResult, kp: &TestKeyPair) {
    let auth_state = AuthState {
        jwks: Arc::new(JwksClient::with_keys(kp.jwk_set.clone())),
        config: test_config(),
    };
    boot.app_context.shared_store.insert(auth_state);
}

fn valid_claims(sub: &str) -> AuthClaims {
    let exp = (chrono::Utc::now().timestamp() + 300) as usize;
    AuthClaims {
        sub: sub.to_string(),
        email: format!("{sub}@example.com"),
        preferred_username: Some(format!("User {sub}")),
        exp,
        iss: TEST_ISSUER.to_string(),
        aud: serde_json::json!(TEST_CLIENT_ID),
    }
}

#[tokio::test]
#[serial]
async fn me_returns_401_without_token() {
    let boot = boot_test::<App>().await.unwrap();

    let res = request::<App, _, _>(&boot.app_context, "GET", "/api/auth/me", None::<String>, None).await;
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
#[serial]
async fn me_returns_user_info_with_valid_token() {
    let boot = boot_test::<App>().await.unwrap();
    let kp = TestKeyPair::generate();
    setup_auth(&boot, &kp);

    let claims = valid_claims("kc-test-1");
    let token = kp.create_token(&claims);

    let res = request::<App, _, _>(
        &boot.app_context,
        "GET",
        "/api/auth/me",
        None::<String>,
        Some(vec![(
            header::AUTHORIZATION.as_str(),
            &format!("Bearer {token}"),
        )]),
    )
    .await;

    assert_eq!(res.status(), StatusCode::OK);
    let body: serde_json::Value = serde_json::from_str(&res.text().await).unwrap();
    assert_eq!(body["email"], "kc-test-1@example.com");
    assert_eq!(body["keycloak_id"], "kc-test-1");
}

#[tokio::test]
#[serial]
async fn me_auto_creates_user_on_first_login() {
    let boot = boot_test::<App>().await.unwrap();
    let kp = TestKeyPair::generate();
    setup_auth(&boot, &kp);

    // Verify user doesn't exist
    let existing = app_users::Model::find_by_keycloak_id(&boot.app_context.db, "kc-auto-create")
        .await
        .unwrap();
    assert!(existing.is_none());

    let claims = valid_claims("kc-auto-create");
    let token = kp.create_token(&claims);

    let res = request::<App, _, _>(
        &boot.app_context,
        "GET",
        "/api/auth/me",
        None::<String>,
        Some(vec![(
            header::AUTHORIZATION.as_str(),
            &format!("Bearer {token}"),
        )]),
    )
    .await;

    assert_eq!(res.status(), StatusCode::OK);

    // Verify user was created
    let created = app_users::Model::find_by_keycloak_id(&boot.app_context.db, "kc-auto-create")
        .await
        .unwrap();
    assert!(created.is_some());
    assert_eq!(created.unwrap().email, "kc-auto-create@example.com");
}

#[tokio::test]
#[serial]
async fn me_returns_401_with_expired_token() {
    let boot = boot_test::<App>().await.unwrap();
    let kp = TestKeyPair::generate();
    setup_auth(&boot, &kp);

    let mut claims = valid_claims("kc-expired");
    claims.exp = (chrono::Utc::now().timestamp() - 300) as usize;
    let token = kp.create_token(&claims);

    let res = request::<App, _, _>(
        &boot.app_context,
        "GET",
        "/api/auth/me",
        None::<String>,
        Some(vec![(
            header::AUTHORIZATION.as_str(),
            &format!("Bearer {token}"),
        )]),
    )
    .await;

    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
#[serial]
async fn school_returns_400_without_school_id_header() {
    let boot = boot_test::<App>().await.unwrap();
    let kp = TestKeyPair::generate();
    setup_auth(&boot, &kp);

    let claims = valid_claims("kc-no-school");
    let token = kp.create_token(&claims);

    let res = request::<App, _, _>(
        &boot.app_context,
        "GET",
        "/api/auth/school",
        None::<String>,
        Some(vec![(
            header::AUTHORIZATION.as_str(),
            &format!("Bearer {token}"),
        )]),
    )
    .await;

    assert_eq!(res.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
#[serial]
async fn school_returns_403_without_membership() {
    let boot = boot_test::<App>().await.unwrap();
    let kp = TestKeyPair::generate();
    setup_auth(&boot, &kp);

    // Create a school but no membership
    let school = schools::ActiveModel::new("No Access School".to_string(), "no-access".to_string());
    let school = school.insert(&boot.app_context.db).await.unwrap();

    let claims = valid_claims("kc-no-member");
    let token = kp.create_token(&claims);

    let res = request::<App, _, _>(
        &boot.app_context,
        "GET",
        "/api/auth/school",
        None::<String>,
        Some(vec![
            (header::AUTHORIZATION.as_str(), &format!("Bearer {token}")),
            ("X-School-Id", &school.id.to_string()),
        ]),
    )
    .await;

    assert_eq!(res.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
#[serial]
async fn school_returns_context_with_valid_membership() {
    let boot = boot_test::<App>().await.unwrap();
    let kp = TestKeyPair::generate();
    setup_auth(&boot, &kp);

    // Create user, school, and membership
    let user = app_users::ActiveModel::new(
        "kc-member".to_string(),
        "member@example.com".to_string(),
        "Member User".to_string(),
    );
    let user = user.insert(&boot.app_context.db).await.unwrap();

    let school = schools::ActiveModel::new("My School".to_string(), "my-school".to_string());
    let school = school.insert(&boot.app_context.db).await.unwrap();

    let membership =
        school_memberships::ActiveModel::new(user.id, school.id, "teacher".to_string());
    membership.insert(&boot.app_context.db).await.unwrap();

    let claims = valid_claims("kc-member");
    let token = kp.create_token(&claims);

    let res = request::<App, _, _>(
        &boot.app_context,
        "GET",
        "/api/auth/school",
        None::<String>,
        Some(vec![
            (header::AUTHORIZATION.as_str(), &format!("Bearer {token}")),
            ("X-School-Id", &school.id.to_string()),
        ]),
    )
    .await;

    assert_eq!(res.status(), StatusCode::OK);
    let body: serde_json::Value = serde_json::from_str(&res.text().await).unwrap();
    assert_eq!(body["school_name"], "My School");
    assert_eq!(body["role"], "teacher");
}
```

- [ ] **Step 3: Run integration tests**

Run: `cd backend && cargo test --test mod requests::auth -- --nocapture`
Expected: all 7 tests pass

Note: integration tests require a running Postgres. Ensure the test DB is set up:
```bash
docker compose up -d postgres-dev
docker exec klassenzeit-postgres-dev psql -U postgres -c "CREATE USER loco WITH PASSWORD 'loco' SUPERUSER;" 2>/dev/null || true
docker exec klassenzeit-postgres-dev psql -U postgres -c "CREATE DATABASE \"klassenzeit-backend_test\" OWNER loco;" 2>/dev/null || true
```

- [ ] **Step 4: Run ALL tests to ensure nothing broke**

Run: `cd backend && cargo test --workspace`
Expected: all tests pass (model tests + keycloak tests + integration tests)

- [ ] **Step 5: Commit**

```bash
git add backend/tests/requests/
git commit -m "Add auth middleware integration tests"
```

---

### Task 10: Cleanup and Documentation

**Files:**
- Modify: `docs/superpowers/next-steps.md`

- [ ] **Step 1: Update next-steps.md**

Move Step 3 from "Ready" to "Done":

```markdown
### Step 3: Auth Middleware in Loco ✓
Wire up JWT validation and multi-tenancy scoping in the backend.
- Spec: `specs/2026-04-03-auth-middleware-design.md`
- Plan: `plans/2026-04-03-auth-middleware.md`
```

- [ ] **Step 2: Update CLAUDE.md status**

In `/home/pascal/Code/Klassenzeit/.claude/CLAUDE.md`, update the Planning section:
```markdown
- Current status: Steps 1-3 complete. Next up: Step 4 (Frontend Auth Integration).
```

- [ ] **Step 3: Run final check**

Run: `cd backend && cargo clippy --workspace -- -D warnings`
Expected: no warnings

Run: `cd backend && cargo test --workspace`
Expected: all tests pass

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/next-steps.md .claude/CLAUDE.md
git commit -m "Update docs: mark Step 3 (auth middleware) complete"
```
