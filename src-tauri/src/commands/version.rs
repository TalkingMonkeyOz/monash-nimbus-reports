use reqwest::Client;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionInfo {
    pub current_version: String,
    pub latest_version: Option<String>,
    pub update_available: bool,
    pub release_url: Option<String>,
    pub release_notes: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GitHubRelease {
    tag_name: String,
    html_url: String,
    body: Option<String>,
}

/// Get current app version from Cargo.toml
#[tauri::command]
pub fn get_current_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Check GitHub releases for a newer version
/// Returns version info including whether an update is available
#[tauri::command]
pub async fn check_for_updates(
    owner: String,
    repo: String,
    github_token: Option<String>,
) -> Result<VersionInfo, String> {
    let current = env!("CARGO_PKG_VERSION").to_string();

    let client = Client::builder()
        .user_agent("MonashNimbusReports/1.0")
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

    let url = format!(
        "https://api.github.com/repos/{}/{}/releases/latest",
        owner, repo
    );

    let mut request = client.get(&url);

    // Add token for private repos
    if let Some(token) = github_token {
        request = request.header("Authorization", format!("Bearer {}", token));
    }

    let response = request
        .send()
        .await
        .map_err(|e| format!("Failed to fetch releases: {}", e))?;

    if response.status() == 404 {
        // No releases yet
        return Ok(VersionInfo {
            current_version: current,
            latest_version: None,
            update_available: false,
            release_url: None,
            release_notes: None,
        });
    }

    if !response.status().is_success() {
        return Err(format!(
            "GitHub API returned status {}: {}",
            response.status(),
            response.text().await.unwrap_or_default()
        ));
    }

    let release: GitHubRelease = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse release info: {}", e))?;

    // Strip 'v' prefix if present (e.g., "v1.0.0" -> "1.0.0")
    let latest = release.tag_name.trim_start_matches('v').to_string();

    // Simple version comparison (assumes semver)
    let update_available = is_newer_version(&current, &latest);

    Ok(VersionInfo {
        current_version: current,
        latest_version: Some(latest),
        update_available,
        release_url: Some(release.html_url),
        release_notes: release.body,
    })
}

/// Compare two semver versions, returns true if latest > current
fn is_newer_version(current: &str, latest: &str) -> bool {
    let parse = |v: &str| -> Vec<u32> {
        v.split('.')
            .filter_map(|part| part.parse::<u32>().ok())
            .collect()
    };

    let current_parts = parse(current);
    let latest_parts = parse(latest);

    for i in 0..3 {
        let c = current_parts.get(i).copied().unwrap_or(0);
        let l = latest_parts.get(i).copied().unwrap_or(0);
        if l > c {
            return true;
        }
        if l < c {
            return false;
        }
    }
    false
}
