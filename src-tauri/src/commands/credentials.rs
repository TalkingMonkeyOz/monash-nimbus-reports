use keyring::Entry;
use serde_json;

use crate::types::{Credentials, LoginCredentials, AppTokenCredentials};

const SERVICE_NAME: &str = "monash-nimbus-reports";

fn get_entry(profile_name: &str) -> Result<Entry, String> {
    let key = format!("profile:{}", profile_name);
    Entry::new(SERVICE_NAME, &key)
        .map_err(|e| format!("Failed to create keyring entry: {}", e))
}

fn get_login_entry(profile_name: &str) -> Result<Entry, String> {
    let key = format!("login:{}", profile_name);
    Entry::new(SERVICE_NAME, &key)
        .map_err(|e| format!("Failed to create keyring entry: {}", e))
}

fn get_apptoken_entry(profile_name: &str) -> Result<Entry, String> {
    let key = format!("apptoken:{}", profile_name);
    Entry::new(SERVICE_NAME, &key)
        .map_err(|e| format!("Failed to create keyring entry: {}", e))
}

#[tauri::command]
pub async fn save_credentials(profile_name: String, credentials: Credentials) -> Result<(), String> {
    let entry = get_entry(&profile_name)?;

    let credentials_json = serde_json::to_string(&credentials)
        .map_err(|e| format!("Failed to serialize credentials: {}", e))?;

    entry.set_password(&credentials_json)
        .map_err(|e| format!("Failed to save credentials to keyring: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn load_credentials(profile_name: String) -> Result<Credentials, String> {
    let entry = get_entry(&profile_name)?;

    let credentials_json = entry.get_password()
        .map_err(|e| format!("Failed to load credentials from keyring: {}", e))?;

    let credentials: Credentials = serde_json::from_str(&credentials_json)
        .map_err(|e| format!("Failed to deserialize credentials: {}", e))?;

    Ok(credentials)
}

#[tauri::command]
pub async fn delete_credentials(profile_name: String) -> Result<(), String> {
    let entry = get_entry(&profile_name)?;

    entry.delete_credential()
        .map_err(|e| format!("Failed to delete credentials from keyring: {}", e))?;

    Ok(())
}

// Login credentials (username/password) - separate from session tokens

#[tauri::command]
pub async fn save_login_credentials(profile_name: String, credentials: LoginCredentials) -> Result<(), String> {
    let entry = get_login_entry(&profile_name)?;

    let credentials_json = serde_json::to_string(&credentials)
        .map_err(|e| format!("Failed to serialize login credentials: {}", e))?;

    entry.set_password(&credentials_json)
        .map_err(|e| format!("Failed to save login credentials to keyring: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn load_login_credentials(profile_name: String) -> Result<LoginCredentials, String> {
    let entry = get_login_entry(&profile_name)?;

    let credentials_json = entry.get_password()
        .map_err(|e| format!("Failed to load login credentials from keyring: {}", e))?;

    let credentials: LoginCredentials = serde_json::from_str(&credentials_json)
        .map_err(|e| format!("Failed to deserialize login credentials: {}", e))?;

    Ok(credentials)
}

#[tauri::command]
pub async fn delete_login_credentials(profile_name: String) -> Result<(), String> {
    let entry = get_login_entry(&profile_name)?;

    entry.delete_credential()
        .map_err(|e| format!("Failed to delete login credentials from keyring: {}", e))?;

    Ok(())
}

// App Token credentials (app_token/username) - for App Token auth mode

#[tauri::command]
pub async fn save_apptoken_credentials(profile_name: String, credentials: AppTokenCredentials) -> Result<(), String> {
    let entry = get_apptoken_entry(&profile_name)?;

    let credentials_json = serde_json::to_string(&credentials)
        .map_err(|e| format!("Failed to serialize app token credentials: {}", e))?;

    entry.set_password(&credentials_json)
        .map_err(|e| format!("Failed to save app token credentials to keyring: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn load_apptoken_credentials(profile_name: String) -> Result<AppTokenCredentials, String> {
    let entry = get_apptoken_entry(&profile_name)?;

    let credentials_json = entry.get_password()
        .map_err(|e| format!("Failed to load app token credentials from keyring: {}", e))?;

    let credentials: AppTokenCredentials = serde_json::from_str(&credentials_json)
        .map_err(|e| format!("Failed to deserialize app token credentials: {}", e))?;

    Ok(credentials)
}

#[tauri::command]
pub async fn delete_apptoken_credentials(profile_name: String) -> Result<(), String> {
    let entry = get_apptoken_entry(&profile_name)?;

    entry.delete_credential()
        .map_err(|e| format!("Failed to delete app token credentials from keyring: {}", e))?;

    Ok(())
}
