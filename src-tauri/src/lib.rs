mod commands;
mod types;

use commands::credentials::{
    save_credentials, load_credentials, delete_credentials,
    save_login_credentials, load_login_credentials, delete_login_credentials
};
use commands::http::{
    execute_odata_query, execute_rest_get, execute_rest_post
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            // Credential management (session tokens)
            save_credentials,
            load_credentials,
            delete_credentials,
            // Login credentials (username/password)
            save_login_credentials,
            load_login_credentials,
            delete_login_credentials,
            // HTTP client (read-only operations)
            execute_odata_query,
            execute_rest_get,
            execute_rest_post,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
