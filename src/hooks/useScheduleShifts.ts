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
      userId: session.user_id,
      authToken: session.auth_token,
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

    // Safety limit
    if (offset >= pageSize * 20) {
      console.warn("Reached safety limit of 10000 records");
      hasMore = false;
    }
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
      userId: session.user_id,
      authToken: session.auth_token,
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

    // Safety limit
    if (offset >= pageSize * 20) {
      console.warn("Reached safety limit of 10000 records");
      hasMore = false;
    }
  }

  onProgress?.(`Loaded ${allRecords.length} history records`);
  return allRecords;
}
