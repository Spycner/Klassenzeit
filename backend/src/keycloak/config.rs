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
        format!("{}/realms/{}", self.url.trim_end_matches('/'), self.realm)
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
