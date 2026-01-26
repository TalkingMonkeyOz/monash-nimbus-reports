use serde::{Deserialize, Serialize};

/// Session credentials (from successful authentication)
/// Supports both credential-based and App Token auth modes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Credentials {
    pub base_url: String,
    pub auth_mode: String, // "credential" or "apptoken"
    // Credential-based auth
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_id: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth_token: Option<String>,
    // App Token auth
    #[serde(skip_serializing_if = "Option::is_none")]
    pub app_token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
}

/// Login credentials (username/password for storage)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoginCredentials {
    pub username: String,
    pub password: String,
}

/// App Token credentials (app_token/username for storage)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppTokenCredentials {
    pub app_token: String,
    pub username: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpResponse {
    pub status: u16,
    pub body: String,
    pub headers: std::collections::HashMap<String, String>,
}
