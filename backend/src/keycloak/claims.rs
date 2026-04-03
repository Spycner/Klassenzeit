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
        self.preferred_username.as_deref().unwrap_or(&self.email)
    }
}

pub async fn validate_token(
    token: &str,
    jwks: &JwksClient,
    issuer: &str,
    client_id: &str,
) -> Result<AuthClaims, AuthError> {
    let header =
        jsonwebtoken::decode_header(token).map_err(|e| AuthError::InvalidToken(e.to_string()))?;

    let kid = header
        .kid
        .ok_or_else(|| AuthError::InvalidToken("missing kid in token header".into()))?;

    let jwk = jwks
        .find_key(&kid)
        .await
        .ok_or(AuthError::JwksUnavailable)?;

    let decoding_key =
        DecodingKey::from_jwk(&jwk).map_err(|e| AuthError::InvalidToken(e.to_string()))?;

    let mut validation = Validation::new(Algorithm::RS256);
    validation.set_issuer(&[issuer]);
    validation.set_audience(&[client_id]);

    let token_data: TokenData<AuthClaims> = decode(token, &decoding_key, &validation)
        .map_err(|e| AuthError::InvalidToken(e.to_string()))?;

    Ok(token_data.claims)
}
