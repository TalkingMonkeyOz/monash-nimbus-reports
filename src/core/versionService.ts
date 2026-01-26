/**
 * Version checking service for update notifications
 * Uses GitHub Releases API via Tauri backend
 */

import { invoke } from "@tauri-apps/api/core";

// GitHub repo details
const GITHUB_OWNER = "TalkingMonkeyOz";
const GITHUB_REPO = "monash-nimbus-reports";

export interface VersionCheckResult {
  current_version: string;
  latest_version: string | null;
  update_available: boolean;
  release_url: string | null;
  release_notes: string | null;
}

/**
 * Get current app version from Rust backend
 */
export async function getAppVersion(): Promise<string> {
  try {
    return await invoke<string>("get_current_version");
  } catch {
    return "0.1.0"; // Fallback
  }
}

/**
 * Check for updates from GitHub Releases
 * @param githubToken Optional token for private repos
 */
export async function checkForUpdates(
  githubToken?: string
): Promise<{ hasUpdate: boolean; latestVersion?: string; releaseUrl?: string; releaseNotes?: string }> {
  try {
    const result = await invoke<VersionCheckResult>("check_for_updates", {
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      githubToken: githubToken || null,
    });

    return {
      hasUpdate: result.update_available,
      latestVersion: result.latest_version || undefined,
      releaseUrl: result.release_url || undefined,
      releaseNotes: result.release_notes || undefined,
    };
  } catch (error) {
    console.log("Version check failed:", error);
    return { hasUpdate: false };
  }
}

/**
 * Open the release URL in the default browser
 */
export async function openReleaseUrl(url: string): Promise<void> {
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } catch (error) {
    // Fallback: try window.open
    window.open(url, "_blank");
  }
}
