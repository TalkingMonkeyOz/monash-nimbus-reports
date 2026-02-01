/**
 * Hook for fetching Early Approval data
 * Detects timesheets approved before the shift start time
 */

import { invoke } from "@tauri-apps/api/core";

interface UserSession {
  base_url: string;
  auth_mode: "credential" | "apptoken";
  user_id?: number;
  auth_token?: string;
  app_token?: string;
  username?: string;
}

export interface EarlyApprovalData {
  Id: number;
  Status: number;
  ConfirmedUTC: string | null;
  ConfirmedBy: number | null;
  StartTime: string | null;
  FinishTime: string | null;
  Hours: number | null;
  Notes: string | null;
  // Expanded attendance
  ScheduleShiftAttendanceObject?: {
    Id: number;
    UserID: number | null;
    ScheduleID: number | null;
    StartTime: string | null;
    FinishTime: string | null;
    // Expanded user
    UserObject?: {
      Id: number;
      Username: string;
      Forename: string;
      Surname: string;
    };
    // Expanded schedule
    Schedule?: {
      Id: number;
      LocationID: number | null;
      StartTime: string | null;
      // Expanded location
      Location?: {
        Id: number;
        Description: string;
      };
    };
  };
  // Expanded confirmer
  ConfirmedByUser?: {
    Id: number;
    Username: string;
    Forename: string;
    Surname: string;
  };
}

export interface FetchEarlyApprovalsOptions {
  session: UserSession;
  fromDate: string; // ISO date
  toDate: string; // ISO date
  locationId?: number;
  onProgress?: (message: string) => void;
}

/**
 * Fetch attendance approvals where ConfirmedUTC < StartTime (approved before shift)
 */
export async function fetchEarlyApprovals(
  options: FetchEarlyApprovalsOptions
): Promise<EarlyApprovalData[]> {
  const { session, fromDate, toDate, locationId, onProgress } = options;

  const pageSize = 100;
  let offset = 0;
  let hasMore = true;
  const allRecords: EarlyApprovalData[] = [];

  const odataBase = `${session.base_url.replace(/\/$/, "")}/CoreAPI/Odata`;

  // Build filter - approved items where confirmation was before shift start
  // Status 3 = Approved
  const filters: string[] = [
    "Deleted eq false",
    "Status eq 3", // Approved
    "ConfirmedUTC ne null",
    "StartTime ne null",
    `StartTime ge ${fromDate}T00:00:00Z`,
    `StartTime le ${toDate}T23:59:59Z`,
  ];

  if (locationId) {
    filters.push(`ScheduleShiftAttendanceObject/Schedule/LocationID eq ${locationId}`);
  }

  const filter = filters.join(" and ");

  // Expand to get attendance, user, schedule, location, and confirmer
  const expand = [
    "ScheduleShiftAttendanceObject($expand=UserObject,Schedule($expand=Location))",
  ].join(",");

  const selectFields = "Id,Status,ConfirmedUTC,ConfirmedBy,StartTime,FinishTime,Hours,Notes";

  while (hasMore) {
    onProgress?.(`Fetching approvals: ${allRecords.length} loaded...`);

    const url = `${odataBase}/ScheduleShiftAttendanceApproval?$select=${selectFields}&$expand=${encodeURIComponent(expand)}&$filter=${encodeURIComponent(filter)}&$top=${pageSize}&$skip=${offset}&$orderby=ConfirmedUTC desc`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await invoke<any>("execute_rest_get", {
      url,
      userId: session.auth_mode === "credential" ? session.user_id : null,
      authToken: session.auth_mode === "credential" ? session.auth_token : null,
      appToken: session.auth_mode === "apptoken" ? session.app_token : null,
      username: session.auth_mode === "apptoken" ? session.username : null,
    });

    let pageRecords: EarlyApprovalData[] = [];
    if (response?.body) {
      try {
        const parsed = JSON.parse(response.body);
        pageRecords = Array.isArray(parsed) ? parsed : parsed.value || [];
      } catch {
        console.error("Failed to parse OData response");
      }
    }

    // Filter client-side: ConfirmedUTC < StartTime (early approval)
    // OData may not support comparing two date fields directly
    const earlyApprovals = pageRecords.filter((record) => {
      if (!record.ConfirmedUTC || !record.StartTime) return false;
      const confirmedDate = new Date(record.ConfirmedUTC);
      const startDate = new Date(record.StartTime);
      return confirmedDate < startDate;
    });

    allRecords.push(...earlyApprovals);

    if (pageRecords.length < pageSize) {
      hasMore = false;
    } else {
      offset += pageSize;
    }

    // No artificial limit - follow pagination to completion
  }

  onProgress?.(`Found ${allRecords.length} early approvals`);
  return allRecords;
}

/**
 * Fetch user by ID for confirmer lookup
 */
export async function fetchUserById(
  session: UserSession,
  userId: number
): Promise<{ Username: string; Forename: string; Surname: string } | null> {
  const odataBase = `${session.base_url.replace(/\/$/, "")}/CoreAPI/Odata`;
  const url = `${odataBase}/User(${userId})?$select=Username,Forename,Surname`;

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
      return JSON.parse(response.body);
    }
  } catch (err) {
    console.error("Failed to fetch user:", err);
  }
  return null;
}
