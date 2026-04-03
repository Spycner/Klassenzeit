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
            if let Some(jwk) = keys
                .keys
                .iter()
                .find(|k| k.common.key_id.as_deref() == Some(kid))
            {
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
