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
  auth_mode: "credential" | "apptoken";
  // Credential-based
  user_id?: number;
  auth_token?: string;
  // App Token based
  app_token?: string;
  username?: string;
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
 * Fields to select from ScheduleShift - includes adhoc fields
 * IMPORTANT: Without $select, adhoc fields are NOT returned by OData!
 */
const SCHEDULE_SHIFT_SELECT_FIELDS = [
  // Core fields
  "Id",
  "Description",
  "StartTime",
  "FinishTime",
  "Hours",
  "Deleted",
  "Updated",
  "UpdatedBy",
  "UserID",
  "ActivityTypeID",
  "JobRoleID",
  "ScheduleID",
  "DepartmentID",
  // Adhoc fields - must be explicitly selected!
  "adhoc_SyllabusPlus",
  "adhoc_UnitCode",
  "adhoc_ActivityGroup",
  "adhoc_IsDeleted",
  "adhoc_TeachingPeriod",
  "adhoc_ActivityCode",
].join(",");

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

    // Build URL with $select (required for adhoc fields!) and filter
    let url = `${odataBase}/ScheduleShift?$select=${SCHEDULE_SHIFT_SELECT_FIELDS}&$top=${pageSize}&$skip=${offset}`;
    if (filter) {
      url += `&$filter=${encodeURIComponent(filter)}`;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await invoke<any>("execute_rest_get", {
      url,
      // Credential-based auth
      userId: session.auth_mode === "credential" ? session.user_id : null,
      authToken: session.auth_mode === "credential" ? session.auth_token : null,
      // App Token auth
      appToken: session.auth_mode === "apptoken" ? session.app_token : null,
      username: session.auth_mode === "apptoken" ? session.username : null,
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

    // No artificial limit - follow pagination to completion
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
 * Fetch timetabled shifts for TT Changes Report
 * Server-side filter: Deleted eq false and adhoc_SyllabusPlus ne null
 *
 * NOTE: Location filtering is done CLIENT-SIDE because Nimbus OData has broken
 * Schedule navigation - Schedule/LocationID filter returns 0 results.
 * We load Schedules separately via loadSchedules() and filter client-side.
 *
 * Returns shifts that came from Syllabus Plus (timetabled).
 * Client-side then flags shifts where ActivityType is NULL or non-TT.
 */
export async function fetchActiveShiftsWithActivities(
  options: Omit<FetchOptions, "deletedOnly" | "additionalFilter">
): Promise<ScheduleShiftData[]> {
  return fetchShiftsInDateRange({
    ...options,
    // Only get timetabled shifts (have SyllabusPlus value)
    // Don't filter by ActivityTypeID - we want to find NULL and non-TT activities
    // NOTE: Location filtering is client-side due to Nimbus OData limitation
    additionalFilter: "Deleted eq false and adhoc_SyllabusPlus ne null",
  });
}

/**
 * Extended shift data with embedded Schedule for location info
 */
export interface ScheduleShiftWithSchedule extends ScheduleShiftData {
  Schedule?: {
    Id: number;
    LocationID?: number;
    StartDate?: string;
    EndDate?: string;
  };
}

/**
 * Fetch shifts missing activity - for Missing Activities Report
 * OPTIMIZED: Uses $expand=Schedule to get LocationID inline for server-side filtering
 * Server-side filter: Deleted eq false and ActivityTypeID eq null
 * Optional: Schedule/LocationID in (ids) for location filtering
 */
export async function fetchShiftsMissingActivity(
  options: Omit<FetchOptions, "deletedOnly" | "additionalFilter"> & {
    locationIds?: number[];
  }
): Promise<ScheduleShiftWithSchedule[]> {
  const { session, fromDate, toDate, locationIds, onProgress } = options;

  const pageSize = 500;
  let offset = 0;
  let hasMore = true;
  const allRecords: ScheduleShiftWithSchedule[] = [];

  const odataBase = `${session.base_url.replace(/\/$/, "")}/CoreAPI/Odata`;

  // Build filter: Shifts with no activity
  const filters: string[] = ["Deleted eq false", "ActivityTypeID eq null"];
  if (fromDate) {
    filters.push(`StartTime ge ${fromDate.startOf("day").toISOString()}`);
  }
  if (toDate) {
    filters.push(`StartTime lt ${toDate.endOf("day").toISOString()}`);
  }
  // Add location filter if specified
  if (locationIds && locationIds.length > 0) {
    filters.push(`Schedule/LocationID in (${locationIds.join(",")})`);
  }
  const filter = filters.join(" and ");

  // Use $expand to get Schedule inline for LocationID
  const expand = "Schedule($select=Id,LocationID,StartDate,EndDate)";

  while (hasMore) {
    onProgress?.(`Fetching shifts missing activity: ${allRecords.length} loaded...`);

    let url = `${odataBase}/ScheduleShift?$select=${SCHEDULE_SHIFT_SELECT_FIELDS}&$top=${pageSize}&$skip=${offset}&$expand=${encodeURIComponent(expand)}`;
    if (filter) {
      url += `&$filter=${encodeURIComponent(filter)}`;
    }

    console.log(`[MissingActivities] Full URL: ${url}`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await invoke<any>("execute_rest_get", {
      url,
      userId: session.auth_mode === "credential" ? session.user_id : null,
      authToken: session.auth_mode === "credential" ? session.auth_token : null,
      appToken: session.auth_mode === "apptoken" ? session.app_token : null,
      username: session.auth_mode === "apptoken" ? session.username : null,
    });

    let pageRecords: ScheduleShiftWithSchedule[] = [];
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
  }

  console.log(`[MissingActivities] Loaded ${allRecords.length} shifts with missing activity`);
  onProgress?.(`Loaded ${allRecords.length} shifts with missing activity`);
  return allRecords;
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

/**
 * Fetch empty/unallocated shifts - for Deleted Agreements Report
 * Server-side filter: Deleted eq false and UserID eq null
 * These are shifts that exist but have no person assigned
 */
export async function fetchEmptyShifts(
  options: Omit<FetchOptions, "deletedOnly" | "additionalFilter">
): Promise<ScheduleShiftData[]> {
  return fetchShiftsInDateRange({
    ...options,
    additionalFilter: "Deleted eq false and UserID eq null",
  });
}

/**
 * Deleted ScheduleShiftAgreement data structure
 * Represents an agreement that was removed from a shift
 */
export interface DeletedScheduleShiftAgreementData {
  Id: number;
  ScheduleShiftID: number;
  AgreementID: number;
  Deleted: boolean;
  Updated?: string;
  UpdatedBy?: number;
  // Joined from ScheduleShift
  shiftDescription?: string;
  shiftStartTime?: string;
  shiftFinishTime?: string;
  shiftScheduleID?: number;
  shiftDepartmentID?: number;
  // Joined from Agreement
  agreementDescription?: string;
}

/**
 * Fetch deleted ScheduleShiftAgreement records - for Deleted Agreements Report
 * These are agreements that were removed/deleted from shifts
 */
export async function fetchDeletedScheduleShiftAgreements(
  options: Omit<FetchOptions, "deletedOnly" | "additionalFilter">
): Promise<DeletedScheduleShiftAgreementData[]> {
  const { session, fromDate, toDate, onProgress } = options;

  const pageSize = 500;
  let offset = 0;
  let hasMore = true;
  const allRecords: DeletedScheduleShiftAgreementData[] = [];

  const odataBase = `${session.base_url.replace(/\/$/, "")}/CoreAPI/Odata`;

  // Filter by Updated date for deleted records
  const filters: string[] = ["Deleted eq true"];
  if (fromDate) {
    filters.push(`Updated ge ${fromDate.startOf("day").toISOString()}`);
  }
  if (toDate) {
    filters.push(`Updated lt ${toDate.endOf("day").toISOString()}`);
  }
  const filter = filters.join(" and ");

  while (hasMore) {
    onProgress?.(`Fetching deleted agreements: ${allRecords.length} loaded...`);

    const url = `${odataBase}/ScheduleShiftAgreement?$top=${pageSize}&$skip=${offset}&$filter=${encodeURIComponent(filter)}&$orderby=Updated desc`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await invoke<any>("execute_rest_get", {
      url,
      // Credential-based auth
      userId: session.auth_mode === "credential" ? session.user_id : null,
      authToken: session.auth_mode === "credential" ? session.auth_token : null,
      // App Token auth
      appToken: session.auth_mode === "apptoken" ? session.app_token : null,
      username: session.auth_mode === "apptoken" ? session.username : null,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let pageRecords: any[] = [];
    if (response?.body) {
      try {
        const parsed = JSON.parse(response.body);
        pageRecords = Array.isArray(parsed) ? parsed : parsed.value || [];
      } catch {
        console.error("Failed to parse OData response");
      }
    }

    // Map to our interface
    const mapped: DeletedScheduleShiftAgreementData[] = pageRecords.map(r => ({
      Id: r.Id,
      ScheduleShiftID: r.ScheduleShiftID,
      AgreementID: r.AgreementID,
      Deleted: r.Deleted,
      Updated: r.Updated,
      UpdatedBy: r.UpdatedBy,
    }));

    allRecords.push(...mapped);

    if (pageRecords.length < pageSize) {
      hasMore = false;
    } else {
      offset += pageSize;
    }

    // No artificial limit - follow pagination to completion
  }

  onProgress?.(`Loaded ${allRecords.length} deleted agreement records`);
  return allRecords;
}

/**
 * Schedule Shift History data structure
 */
export interface ScheduleShiftHistoryData {
  Id: number;
  ScheduleShiftID: number;
  Description: string;
  StartTime: string;
  FinishTime: string;
  Hours?: number;
  Deleted: boolean;
  Inserted: string;  // When this history record was created (the change timestamp)
  InsertedBy: number;  // Who made this change
  Updated?: string;
  UpdatedBy?: number;
  UserID?: number;
  ActivityTypeID?: number;
  JobRoleID?: number;
  ScheduleID?: number;
  DepartmentID?: number;
}

/**
 * Fetch schedule shift history - for Change History Report
 * Shows all historical changes to shifts within date range
 */
export async function fetchScheduleShiftHistory(
  options: Omit<FetchOptions, "deletedOnly" | "additionalFilter">
): Promise<ScheduleShiftHistoryData[]> {
  const { session, fromDate, toDate, onProgress } = options;

  const pageSize = 500;
  let offset = 0;
  let hasMore = true;
  const allRecords: ScheduleShiftHistoryData[] = [];

  const odataBase = `${session.base_url.replace(/\/$/, "")}/CoreAPI/Odata`;

  // Filter by the history record insertion date (when the change happened)
  const filters: string[] = [];
  if (fromDate) {
    filters.push(`Inserted ge ${fromDate.startOf("day").toISOString()}`);
  }
  if (toDate) {
    filters.push(`Inserted lt ${toDate.endOf("day").toISOString()}`);
  }
  const filter = filters.join(" and ");

  while (hasMore) {
    onProgress?.(`Fetching change history: ${allRecords.length} loaded...`);

    let url = `${odataBase}/ScheduleShiftHistory?$top=${pageSize}&$skip=${offset}&$orderby=Inserted desc`;
    if (filter) {
      url += `&$filter=${encodeURIComponent(filter)}`;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await invoke<any>("execute_rest_get", {
      url,
      // Credential-based auth
      userId: session.auth_mode === "credential" ? session.user_id : null,
      authToken: session.auth_mode === "credential" ? session.auth_token : null,
      // App Token auth
      appToken: session.auth_mode === "apptoken" ? session.app_token : null,
      username: session.auth_mode === "apptoken" ? session.username : null,
    });

    let pageRecords: ScheduleShiftHistoryData[] = [];
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

    // No artificial limit - follow pagination to completion
  }

  onProgress?.(`Loaded ${allRecords.length} history records`);
  return allRecords;
}

/**
 * Extended history data with embedded shift and schedule info via $expand
 */
export interface ScheduleShiftHistoryWithDetails extends ScheduleShiftHistoryData {
  // Embedded ScheduleShift via $expand=ScheduleShiftObject
  ScheduleShiftObject?: {
    Id: number;
    Description: string;
    StartTime: string;
    FinishTime: string;
    ScheduleID?: number;
    UserID?: number;
    ActivityTypeID?: number;
    DepartmentID?: number;
    // Embedded Schedule via nested $expand
    Schedule?: {
      Id: number;
      LocationID?: number;
      StartDate?: string;
      EndDate?: string;
    };
  };
}

/**
 * Fetch schedule shift history with $expand for shift and schedule details
 * OPTIMIZED: Gets all data in one OData call instead of multiple lookups
 * Uses: ScheduleShiftHistory?$expand=ScheduleShiftObject($expand=Schedule($select=Id,LocationID,StartDate,EndDate))
 */
export async function fetchScheduleShiftHistoryWithExpand(
  options: Omit<FetchOptions, "deletedOnly" | "additionalFilter">
): Promise<ScheduleShiftHistoryWithDetails[]> {
  const { session, fromDate, toDate, onProgress } = options;

  const pageSize = 500;
  let offset = 0;
  let hasMore = true;
  const allRecords: ScheduleShiftHistoryWithDetails[] = [];

  const odataBase = `${session.base_url.replace(/\/$/, "")}/CoreAPI/Odata`;

  // Filter by the history record insertion date (when the change happened)
  const filters: string[] = [];
  if (fromDate) {
    filters.push(`Inserted ge ${fromDate.startOf("day").toISOString()}`);
  }
  if (toDate) {
    filters.push(`Inserted lt ${toDate.endOf("day").toISOString()}`);
  }
  const filter = filters.join(" and ");

  // Use $expand to get ScheduleShift and Schedule in one call
  const expand = "ScheduleShiftObject($select=Id,Description,StartTime,FinishTime,ScheduleID,UserID,ActivityTypeID,DepartmentID;$expand=Schedule($select=Id,LocationID,StartDate,EndDate))";

  while (hasMore) {
    onProgress?.(`Fetching change history with details: ${allRecords.length} loaded...`);

    let url = `${odataBase}/ScheduleShiftHistory?$top=${pageSize}&$skip=${offset}&$orderby=Inserted desc&$expand=${encodeURIComponent(expand)}`;
    if (filter) {
      url += `&$filter=${encodeURIComponent(filter)}`;
    }

    console.log(`[ScheduleShiftHistory] Fetching with $expand, offset=${offset}`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await invoke<any>("execute_rest_get", {
      url,
      // Credential-based auth
      userId: session.auth_mode === "credential" ? session.user_id : null,
      authToken: session.auth_mode === "credential" ? session.auth_token : null,
      // App Token auth
      appToken: session.auth_mode === "apptoken" ? session.app_token : null,
      username: session.auth_mode === "apptoken" ? session.username : null,
    });

    let pageRecords: ScheduleShiftHistoryWithDetails[] = [];
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
  }

  console.log(`[ScheduleShiftHistory] Loaded ${allRecords.length} records with embedded shift/schedule details`);
  onProgress?.(`Loaded ${allRecords.length} history records with details`);
  return allRecords;
}

/**
 * Activity history record from ScheduleShiftActivityHistoryList navigation property
 */
export interface ScheduleShiftActivityHistoryRecord {
  Id: number;
  ScheduleShiftID: number;
  ActivityTypeID: number | null;
  Inserted: string;
  InsertedBy: number | null;
  Updated?: string;
  UpdatedBy?: number;
  Deleted: boolean;
}

/**
 * Extended shift data with embedded activity history via $expand
 */
export interface ScheduleShiftWithActivityHistory extends ScheduleShiftData {
  ScheduleShiftActivityHistoryList?: ScheduleShiftActivityHistoryRecord[];
}

/**
 * Fetch active timetabled shifts with $expand for activity history
 * OPTIMIZED: Gets shifts AND activity change history in one OData call
 * Uses: ScheduleShift?$expand=ScheduleShiftActivityHistoryList
 */
export async function fetchActiveShiftsWithActivityHistory(
  options: Omit<FetchOptions, "deletedOnly" | "additionalFilter">
): Promise<ScheduleShiftWithActivityHistory[]> {
  const { session, fromDate, toDate, onProgress } = options;

  const pageSize = 500;
  let offset = 0;
  let hasMore = true;
  const allRecords: ScheduleShiftWithActivityHistory[] = [];

  const odataBase = `${session.base_url.replace(/\/$/, "")}/CoreAPI/Odata`;

  // Build filter: Timetabled shifts (have SyllabusPlus) and not deleted
  const filters: string[] = ["Deleted eq false", "adhoc_SyllabusPlus ne null"];
  if (fromDate) {
    filters.push(`StartTime ge ${fromDate.startOf("day").toISOString()}`);
  }
  if (toDate) {
    filters.push(`StartTime lt ${toDate.endOf("day").toISOString()}`);
  }
  const filter = filters.join(" and ");

  // $expand to get activity history inline
  // NOTE: Nimbus OData API doesn't support $orderby inside $expand (returns 500 error)
  // We sort the history records client-side instead
  const expand = "ScheduleShiftActivityHistoryList($select=Id,ScheduleShiftID,ActivityTypeID,Inserted,InsertedBy,Deleted)";

  while (hasMore) {
    onProgress?.(`Fetching shifts with activity history: ${allRecords.length} loaded...`);

    // Build URL with $select (required for adhoc fields!) and $expand
    let url = `${odataBase}/ScheduleShift?$select=${SCHEDULE_SHIFT_SELECT_FIELDS}&$top=${pageSize}&$skip=${offset}&$expand=${encodeURIComponent(expand)}`;
    if (filter) {
      url += `&$filter=${encodeURIComponent(filter)}`;
    }

    console.log(`[ScheduleShift] Fetching with $expand=ScheduleShiftActivityHistoryList, offset=${offset}`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await invoke<any>("execute_rest_get", {
      url,
      // Credential-based auth
      userId: session.auth_mode === "credential" ? session.user_id : null,
      authToken: session.auth_mode === "credential" ? session.auth_token : null,
      // App Token auth
      appToken: session.auth_mode === "apptoken" ? session.app_token : null,
      username: session.auth_mode === "apptoken" ? session.username : null,
    });

    let pageRecords: ScheduleShiftWithActivityHistory[] = [];
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
  }

  const shiftsWithHistory = allRecords.filter(s => s.ScheduleShiftActivityHistoryList && s.ScheduleShiftActivityHistoryList.length > 0).length;
  console.log(`[ScheduleShift] Loaded ${allRecords.length} shifts, ${shiftsWithHistory} have activity history`);
  onProgress?.(`Loaded ${allRecords.length} timetabled shifts with activity history`);
  return allRecords;
}
