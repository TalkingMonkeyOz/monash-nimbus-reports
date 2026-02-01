/**
 * History Service
 * Fetches ScheduleShiftHistory to track who changed activities
 */

import { invoke } from "@tauri-apps/api/core";

interface Session {
  base_url: string;
  auth_mode: "credential" | "apptoken";
  user_id?: number;
  auth_token?: string;
  app_token?: string;
  username?: string;
}

export interface ShiftHistoryRecord {
  id: number;
  scheduleShiftId: number;
  activityTypeId: number | null;
  inserted: string;
  insertedBy: number | null;
  updated: string;
  updatedBy: number | null;
}

export interface ActivityChangeInfo {
  /** Who last changed the activity (user ID) */
  changedBy: number | null;
  /** When the activity was last changed */
  changedDate: string | null;
  /** Previous activity type ID (if we have history) */
  previousActivityTypeId: number | null;
}

/**
 * Fetch history records for given shift IDs
 * Returns a map of shiftId -> array of history records (most recent first)
 */
export async function fetchShiftHistory(
  session: Session,
  shiftIds: number[],
  onProgress?: (msg: string) => void
): Promise<Map<number, ShiftHistoryRecord[]>> {
  if (shiftIds.length === 0) {
    return new Map();
  }

  onProgress?.(`Fetching history for ${shiftIds.length} shifts...`);

  const result = new Map<number, ShiftHistoryRecord[]>();
  const batchSize = 20;
  const odataBase = `${session.base_url.replace(/\/$/, "")}/CoreAPI/Odata`;

  for (let i = 0; i < shiftIds.length; i += batchSize) {
    const batch = shiftIds.slice(i, i + batchSize);
    const shiftIdFilter = batch.map(id => `ScheduleShiftID eq ${id}`).join(" or ");
    const filter = encodeURIComponent(`(${shiftIdFilter})`);
    const select = "Id,ScheduleShiftID,ActivityTypeID,Inserted,InsertedBy,Updated,UpdatedBy";
    const orderby = encodeURIComponent("Inserted desc");

    const url = `${odataBase}/ScheduleShiftHistory?$filter=${filter}&$select=${select}&$orderby=${orderby}`;

    console.log(`[HistoryService] Fetching history batch ${Math.floor(i / batchSize) + 1}`);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await invoke<any>("execute_rest_get", {
        url,
        userId: session.auth_mode === "credential" ? session.user_id : null,
        authToken: session.auth_mode === "credential" ? session.auth_token : null,
        appToken: session.auth_mode === "apptoken" ? session.app_token : null,
        username: session.auth_mode === "apptoken" ? session.username : null,
      });

      if (response?.body) {
        const parsed = JSON.parse(response.body);
        const records = Array.isArray(parsed) ? parsed : parsed.value || [];

        for (const r of records) {
          const shiftId = r.ScheduleShiftID;
          const historyRecord: ShiftHistoryRecord = {
            id: r.Id,
            scheduleShiftId: shiftId,
            activityTypeId: r.ActivityTypeID ?? null,
            inserted: r.Inserted || "",
            insertedBy: r.InsertedBy ?? null,
            updated: r.Updated || "",
            updatedBy: r.UpdatedBy ?? null,
          };

          if (!result.has(shiftId)) {
            result.set(shiftId, []);
          }
          result.get(shiftId)!.push(historyRecord);
        }
      }
    } catch (err) {
      console.error(`[HistoryService] Failed to fetch history batch:`, err);
    }
  }

  console.log(`[HistoryService] Loaded history for ${result.size} shifts`);
  onProgress?.(`Loaded change history for ${result.size} shifts`);
  return result;
}

/**
 * Analyze history records to find who changed the activity and when
 * Returns info about the most recent activity change
 */
export function analyzeActivityChange(
  historyRecords: ShiftHistoryRecord[] | undefined,
  currentActivityTypeId: number | null
): ActivityChangeInfo {
  if (!historyRecords || historyRecords.length === 0) {
    return {
      changedBy: null,
      changedDate: null,
      previousActivityTypeId: null,
    };
  }

  // Records are ordered by Inserted DESC (most recent first)
  // Find the first record that has a different ActivityTypeID from current
  // The next record (older) would be the previous state

  for (let i = 0; i < historyRecords.length; i++) {
    const record = historyRecords[i];
    const nextRecord = historyRecords[i + 1];

    // If this record matches current state and there's an older record with different activity
    if (record.activityTypeId === currentActivityTypeId && nextRecord) {
      if (nextRecord.activityTypeId !== currentActivityTypeId) {
        // Found the change point
        return {
          changedBy: record.insertedBy,
          changedDate: record.inserted,
          previousActivityTypeId: nextRecord.activityTypeId,
        };
      }
    }
  }

  // If no change found, return the most recent record info
  // This covers the case where activity was set initially
  const mostRecent = historyRecords[0];
  return {
    changedBy: mostRecent.insertedBy,
    changedDate: mostRecent.inserted,
    previousActivityTypeId: null,
  };
}
