/**
 * Hook for fetching ScheduleShift data with efficient server-side filtering
 *
 * Uses /CoreAPI/Odata endpoint which supports $filter for:
 * - Date ranges (StartTime ge/lt)
 * - Deleted status (Deleted eq true/false)
 * - Other fields as needed
 *
 * Much more efficient than fetching all and filtering client-side.
 */

import { invoke } from "@tauri-apps/api/core";
import { Dayjs } from "dayjs";

interface ScheduleShiftSession {
  base_url: string;
  user_id: number;
  auth_token: string;
}

export interface ScheduleShiftData {
  Id: number;
  Description: string;
  StartTime: string;
  FinishTime: string;
  Hours?: number;
  Deleted: boolean;
  Updated?: string;
  UpdatedBy?: number;
  UserID?: number;
  ActivityTypeID?: number;
  JobRoleID?: number;
  ScheduleID?: number;
  LocationID?: number;
  DepartmentID?: number;
  ActivityDescription?: string;
  // Adhoc fields (from CoreAPI)
  adhoc_SyllabusPlus?: string;
  adhoc_UnitCode?: string;
  adhoc_ActivityGroup?: string;
  adhoc_IsDeleted?: string;
  adhoc_TeachingPeriod?: string;
  adhoc_ActivityCode?: string;
}

export interface FetchOptions {
  session: ScheduleShiftSession;
  fromDate: Dayjs | null;
  toDate: Dayjs | null;
  /** Filter for deleted shifts only */
  deletedOnly?: boolean;
  /** Additional OData filter clauses */
  additionalFilter?: string;
  /** Progress callback */
  onProgress?: (message: string) => void;
}

/**
 * Build OData filter string for date range and optional conditions
 */
function buildODataFilter(
  fromDate: Dayjs | null,
  toDate: Dayjs | null,
  deletedOnly?: boolean,
  additionalFilter?: string
): string {
  const filters: string[] = [];

  if (fromDate) {
    filters.push(`StartTime ge ${fromDate.startOf("day").toISOString()}`);
  }
  if (toDate) {
    filters.push(`StartTime lt ${toDate.endOf("day").toISOString()}`);
  }
  if (deletedOnly) {
    filters.push("Deleted eq true");
  }
  if (additionalFilter) {
    filters.push(additionalFilter);
  }

  return filters.join(" and ");
}

/**
 * Fetch schedule shifts using CoreAPI OData with server-side filtering
 * Much more efficient than fetching all and filtering client-side
 */
async function fetchScheduleShiftsFiltered(
  session: ScheduleShiftSession,
  filter: string,
  onProgress?: (message: string) => void
): Promise<ScheduleShiftData[]> {
  const pageSize = 500;
  let offset = 0;
  let hasMore = true;
  const allRecords: ScheduleShiftData[] = [];

  // Use CoreAPI/Odata endpoint which supports $filter properly
  const odataBase = `${session.base_url.replace(/\/$/, "")}/CoreAPI/Odata`;

  while (hasMore) {
    onProgress?.(`Fetching shifts: ${allRecords.length} loaded...`);

    // Build URL with filter
    let url = `${odataBase}/ScheduleShift?$top=${pageSize}&$skip=${offset}`;
    if (filter) {
      url += `&$filter=${encodeURIComponent(filter)}`;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await invoke<any>("execute_rest_get", {
      url,
      userId: session.user_id,
      authToken: session.auth_token,
    });

    // Parse response body
    let pageRecords: ScheduleShiftData[] = [];
    if (response?.body) {
      try {
        const parsed = JSON.parse(response.body);
        pageRecords = Array.isArray(parsed) ? parsed : parsed.value || [];
      } catch {
        console.error("Failed to parse OData response");
      }
    }

    allRecords.push(...pageRecords);

    if (pageRecords.length < pageSize) {
      hasMore = false;
    } else {
      offset += pageSize;
    }

    // Safety limit - 10000 records (with server-side filter this should be rare)
    if (offset >= pageSize * 20) {
      console.warn("Reached safety limit of 10000 records");
      hasMore = false;
    }
  }

  onProgress?.(`Loaded ${allRecords.length} shifts (server-side filtered)`);
  return allRecords;
}

/**
 * Fetch schedule shifts with efficient server-side filtering
 * Uses CoreAPI OData $filter for date range, deleted status, etc.
 */
export async function fetchShiftsInDateRange(
  options: FetchOptions
): Promise<ScheduleShiftData[]> {
  const { session, fromDate, toDate, deletedOnly, additionalFilter, onProgress } = options;

  // Build server-side filter
  const filter = buildODataFilter(fromDate, toDate, deletedOnly, additionalFilter);

  onProgress?.(`Querying shifts with filter: ${filter || "(none)"}`);
  console.log(`OData filter: ${filter}`);

  // Fetch with server-side filtering - much more efficient!
  const shifts = await fetchScheduleShiftsFiltered(session, filter, onProgress);

  onProgress?.(`Found ${shifts.length} shifts`);
  console.log(`Date range: ${fromDate?.format("DD/MM/YYYY")} - ${toDate?.format("DD/MM/YYYY")}`);
  console.log(`Server returned ${shifts.length} shifts (filtered server-side)`);

  return shifts;
}

/**
 * Fetch deleted shifts only - optimized query
 */
export async function fetchDeletedShifts(
  options: Omit<FetchOptions, "deletedOnly">
): Promise<ScheduleShiftData[]> {
  return fetchShiftsInDateRange({ ...options, deletedOnly: true });
}

/**
 * Fetch active (non-deleted) shifts with activities - for Activities Report
 * Server-side filter: Deleted eq false and ActivityTypeID ne null
 */
export async function fetchActiveShiftsWithActivities(
  options: Omit<FetchOptions, "deletedOnly" | "additionalFilter">
): Promise<ScheduleShiftData[]> {
  return fetchShiftsInDateRange({
    ...options,
    additionalFilter: "Deleted eq false and ActivityTypeID ne null",
  });
}

/**
 * Fetch shifts with user but missing activity - for Missing Activities Report
 * Server-side filter: Deleted eq false and UserID ne null and ActivityTypeID eq null
 */
export async function fetchShiftsMissingActivity(
  options: Omit<FetchOptions, "deletedOnly" | "additionalFilter">
): Promise<ScheduleShiftData[]> {
  return fetchShiftsInDateRange({
    ...options,
    additionalFilter: "Deleted eq false and UserID ne null and ActivityTypeID eq null",
  });
}

/**
 * Fetch shifts missing job role - for Missing Job Roles Report
 * Server-side filter: Deleted eq false and JobRoleID eq null
 */
export async function fetchShiftsMissingJobRole(
  options: Omit<FetchOptions, "deletedOnly" | "additionalFilter">
): Promise<ScheduleShiftData[]> {
  return fetchShiftsInDateRange({
    ...options,
    additionalFilter: "Deleted eq false and JobRoleID eq null",
  });
}
