import { openUrl } from "@tauri-apps/plugin-opener";

/**
 * Opens a Nimbus schedule in the default browser
 * URL pattern: {base_url}/Schedule/ScheduleGrid.aspx?ScheduleID={scheduleId}
 */
export async function openNimbusSchedule(
  baseUrl: string,
  scheduleId: number | null
): Promise<void> {
  if (!scheduleId) {
    console.warn("[NimbusLinks] No schedule ID provided");
    return;
  }

  // Remove trailing slash from base URL if present
  const cleanBaseUrl = baseUrl.replace(/\/$/, "");
  const url = `${cleanBaseUrl}/Schedule/ScheduleGrid.aspx?ScheduleID=${scheduleId}`;

  console.log(`[NimbusLinks] Opening: ${url}`);
  await openUrl(url);
}

/**
 * Builds a Nimbus schedule URL without opening it
 */
export function buildNimbusScheduleUrl(
  baseUrl: string,
  scheduleId: number | null
): string | null {
  if (!scheduleId) return null;

  const cleanBaseUrl = baseUrl.replace(/\/$/, "");
  return `${cleanBaseUrl}/Schedule/ScheduleGrid.aspx?ScheduleID=${scheduleId}`;
}
