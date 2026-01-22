/**
 * Version checking service for update notifications
 */

export const APP_VERSION = "0.1.0";

export interface VersionInfo {
  version: string;
  releaseDate: string;
  downloadUrl: string;
  releaseNotes: string;
}

/**
 * Check for updates from a version manifest URL
 * For production, this would point to a GitHub release or hosted file
 */
export async function checkForUpdates(
  manifestUrl?: string
): Promise<{ hasUpdate: boolean; latestVersion?: VersionInfo }> {
  // Default manifest URL - can be configured
  const url = manifestUrl || "https://raw.githubusercontent.com/monash/nimbus-reports/main/version.json";

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { "Accept": "application/json" }
    });

    if (!response.ok) {
      console.log("Version check: No manifest available");
      return { hasUpdate: false };
    }

    const latest: VersionInfo = await response.json();
    const hasUpdate = compareVersions(latest.version, APP_VERSION) > 0;

    return { hasUpdate, latestVersion: hasUpdate ? latest : undefined };
  } catch (error) {
    console.log("Version check failed:", error);
    return { hasUpdate: false };
  }
}

/**
 * Compare semantic versions
 * Returns: 1 if a > b, -1 if a < b, 0 if equal
 */
function compareVersions(a: string, b: string): number {
  const partsA = a.split(".").map(Number);
  const partsB = b.split(".").map(Number);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    if (numA > numB) return 1;
    if (numA < numB) return -1;
  }
  return 0;
}

/**
 * Get current app version info
 */
export function getAppVersion(): string {
  return APP_VERSION;
}
