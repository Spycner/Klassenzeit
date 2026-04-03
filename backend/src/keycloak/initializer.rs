use async_trait::async_trait;
use axum::Router as AxumRouter;
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

    async fn before_run(&self, app_context: &AppContext) -> Result<()> {
        let config = KeycloakConfig::from_config(&app_context.config)?;
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
        app_context.shared_store.insert(auth_state);

        Ok(())
    }

    async fn after_routes(&self, router: AxumRouter, ctx: &AppContext) -> Result<AxumRouter> {
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
