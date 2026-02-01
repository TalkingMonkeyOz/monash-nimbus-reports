/**
 * Agreement Service
 * Fetches deleted ScheduleShiftAgreement records and related data
 *
 * OPTIMIZED: Uses single OData call with $expand=Agreements($filter=Deleted eq true)
 * to get both shift details and deleted agreements in one request.
 */

import { invoke } from "@tauri-apps/api/core";
import { Dayjs } from "dayjs";

interface Session {
  base_url: string;
  auth_mode: "credential" | "apptoken";
  // Credential-based
  user_id?: number;
  auth_token?: string;
  // App Token based
  app_token?: string;
  username?: string;
}

export interface DeletedAgreementLink {
  id: number;  // ScheduleShiftAgreement.Id
  scheduleShiftId: number;
  agreementId: number;
  deleted: boolean;
  updatedDate: string;
  updatedBy: number | null;
}

export interface ShiftDetails {
  id: number;
  description: string;
  startTime: string;
  finishTime: string;
  scheduleId: number | null;
  departmentId: number | null;
  userId: number | null;
  syllabusPlus: string;
}

export interface AgreementDetails {
  id: number;
  description: string;
}

/** Combined result from single-call approach */
export interface DeletedAgreementsResult {
  deletedLinks: DeletedAgreementLink[];
  shiftDetails: Map<number, ShiftDetails>;
}

/**
 * Fetch OData with pagination
 */
async function fetchODataPaged<T>(
  session: Session,
  endpoint: string,
  filter?: string,
  orderby?: string,
  select?: string
): Promise<T[]> {
  const pageSize = 500;
  let offset = 0;
  let hasMore = true;
  const allRecords: T[] = [];

  const odataBase = `${session.base_url.replace(/\/$/, "")}/CoreAPI/Odata`;

  while (hasMore) {
    let url = `${odataBase}/${endpoint}?$top=${pageSize}&$skip=${offset}`;
    if (filter) {
      url += `&$filter=${encodeURIComponent(filter)}`;
    }
    if (orderby) {
      url += `&$orderby=${encodeURIComponent(orderby)}`;
    }
    if (select) {
      url += `&$select=${encodeURIComponent(select)}`;
    }

    console.log(`[OData] Fetching: ${url}`);

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

    let pageRecords: T[] = [];
    if (response?.body) {
      try {
        const parsed = JSON.parse(response.body);
        pageRecords = Array.isArray(parsed) ? parsed : parsed.value || [];
        console.log(`[OData] Response: ${pageRecords.length} records`);
      } catch (e) {
        console.error("[OData] Failed to parse response:", e);
        console.error("[OData] Raw body:", response.body?.substring(0, 500));
      }
    } else {
      console.warn("[OData] No response body received");
      console.log("[OData] Full response:", JSON.stringify(response));
    }

    allRecords.push(...pageRecords);

    if (pageRecords.length < pageSize) {
      hasMore = false;
    } else {
      offset += pageSize;
    }

    // Safety limit
    if (offset >= pageSize * 20) {
      console.warn("Reached safety limit");
      hasMore = false;
    }
  }

  return allRecords;
}

/**
 * Fetch OData with $expand support (single call)
 */
async function fetchODataWithExpand<T>(
  session: Session,
  endpoint: string,
  filter?: string,
  expand?: string,
  select?: string,
  top?: number
): Promise<T[]> {
  const pageSize = top || 500;
  let offset = 0;
  let hasMore = true;
  const allRecords: T[] = [];

  const odataBase = `${session.base_url.replace(/\/$/, "")}/CoreAPI/Odata`;

  while (hasMore) {
    let url = `${odataBase}/${endpoint}?$top=${pageSize}&$skip=${offset}`;
    if (filter) {
      url += `&$filter=${encodeURIComponent(filter)}`;
    }
    if (expand) {
      url += `&$expand=${encodeURIComponent(expand)}`;
    }
    if (select) {
      url += `&$select=${encodeURIComponent(select)}`;
    }

    console.log(`[OData+Expand] Fetching: ${url}`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await invoke<any>("execute_rest_get", {
      url,
      userId: session.auth_mode === "credential" ? session.user_id : null,
      authToken: session.auth_mode === "credential" ? session.auth_token : null,
      appToken: session.auth_mode === "apptoken" ? session.app_token : null,
      username: session.auth_mode === "apptoken" ? session.username : null,
    });

    let pageRecords: T[] = [];
    if (response?.body) {
      try {
        const parsed = JSON.parse(response.body);
        pageRecords = Array.isArray(parsed) ? parsed : parsed.value || [];
        console.log(`[OData+Expand] Response: ${pageRecords.length} records`);
      } catch (e) {
        console.error("[OData+Expand] Failed to parse response:", e);
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
      console.warn("Reached safety limit");
      hasMore = false;
    }
  }

  return allRecords;
}

// Fields to select for ScheduleShift - adhoc fields require explicit $select!
const SHIFT_SELECT_FIELDS = "Id,Description,StartTime,FinishTime,ScheduleID,DepartmentID,UserID,adhoc_SyllabusPlus";

/**
 * Fetch deleted agreements with shift details in a SINGLE OData call.
 * Uses $expand=Agreements($filter=Deleted eq true) to get everything at once.
 *
 * Query: ScheduleShift?$filter=...&$expand=Agreements($filter=Deleted eq true)&$select=...
 *
 * Returns both deleted agreement links AND shift details in one request!
 */
export async function fetchDeletedAgreementsWithShifts(
  session: Session,
  fromDate: Dayjs | null,
  toDate: Dayjs | null,
  onProgress?: (msg: string) => void,
  locationIds?: number[]
): Promise<DeletedAgreementsResult> {
  // Build date filter
  const dateFilters: string[] = [];
  if (fromDate) {
    dateFilters.push(`StartTime ge ${fromDate.startOf("day").toISOString()}`);
  }
  if (toDate) {
    dateFilters.push(`StartTime lt ${toDate.endOf("day").toISOString()}`);
  }

  // Build location filter
  let filter: string;
  if (locationIds && locationIds.length > 0) {
    const locationInFilter = `Schedule/LocationID in (${locationIds.join(", ")})`;
    filter = dateFilters.length > 0
      ? `${locationInFilter} and ${dateFilters.join(" and ")}`
      : locationInFilter;
    onProgress?.(`Fetching shifts for ${locationIds.length} location(s)...`);
  } else {
    filter = dateFilters.length > 0 ? dateFilters.join(" and ") : "";
    onProgress?.("Fetching shifts in date range...");
  }

  console.log(`[AgreementService] Single-call query with $expand=Agreements($filter=Deleted eq true)`);
  console.log(`[AgreementService] Filter: ${filter}`);

  // Single OData call with $expand to get shifts + deleted agreements
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shifts = await fetchODataWithExpand<any>(
    session,
    "ScheduleShift",
    filter || undefined,
    "Agreements($filter=Deleted eq true)",  // Only get deleted agreements
    SHIFT_SELECT_FIELDS
  );

  console.log(`[AgreementService] Found ${shifts.length} shifts`);

  // Extract deleted agreement links and shift details
  const deletedLinks: DeletedAgreementLink[] = [];
  const shiftDetails = new Map<number, ShiftDetails>();

  for (const shift of shifts) {
    // Store shift details
    shiftDetails.set(shift.Id, {
      id: shift.Id,
      description: shift.Description || "",
      startTime: shift.StartTime || "",
      finishTime: shift.FinishTime || "",
      scheduleId: shift.ScheduleID || null,
      departmentId: shift.DepartmentID || null,
      userId: shift.UserID || null,
      syllabusPlus: shift.adhoc_SyllabusPlus || "",
    });

    // Extract deleted agreements from this shift
    const agreements = shift.Agreements || [];
    for (const agr of agreements) {
      if (agr.Deleted === true) {
        deletedLinks.push({
          id: agr.Id,  // ScheduleShiftAgreement.Id
          scheduleShiftId: shift.Id,
          agreementId: agr.AgreementID,
          deleted: true,
          updatedDate: agr.Updated || "",
          updatedBy: agr.UpdatedBy || null,
        });
      }
    }
  }

  const shiftsWithDeleted = shifts.filter((s: { Agreements?: unknown[] }) => s.Agreements && s.Agreements.length > 0).length;
  console.log(`[AgreementService] Found ${deletedLinks.length} deleted agreements across ${shiftsWithDeleted} shifts`);
  onProgress?.(`Found ${deletedLinks.length} deleted agreements`);

  return { deletedLinks, shiftDetails };
}

/**
 * @deprecated Use fetchDeletedAgreementsWithShifts instead for single-call approach.
 *
 * Fetch DELETED ScheduleShiftAgreement records for shifts within date range
 * Filters by SHIFT START TIME (not deletion date) as users expect
 */
export async function fetchDeletedAgreementLinks(
  session: Session,
  fromDate: Dayjs | null,
  toDate: Dayjs | null,
  onProgress?: (msg: string) => void,
  locationIds?: number[]  // Filter by locations server-side via Schedule/LocationID
): Promise<DeletedAgreementLink[]> {
  // Build date filter
  const dateFilters: string[] = [];
  if (fromDate) {
    dateFilters.push(`StartTime ge ${fromDate.startOf("day").toISOString()}`);
  }
  if (toDate) {
    dateFilters.push(`StartTime lt ${toDate.endOf("day").toISOString()}`);
  }

  let shiftIds: number[];

  // Query ScheduleShift - with optional location filter using Schedule/LocationID
  if (locationIds && locationIds.length > 0) {
    // Use OData 'in' operator for multiple locations: Schedule/LocationID in (4550, 4551, ...)
    onProgress?.(`Finding shifts for ${locationIds.length} location(s)...`);

    const locationInFilter = `Schedule/LocationID in (${locationIds.join(", ")})`;
    const filter = dateFilters.length > 0
      ? `${locationInFilter} and ${dateFilters.join(" and ")}`
      : locationInFilter;

    console.log(`[AgreementService] Query: ScheduleShift with filter: ${filter}`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shifts = await fetchODataPaged<any>(
      session,
      "ScheduleShift",
      filter,
      undefined,
      "Id"
    );

    shiftIds = shifts.map(s => s.Id as number).filter(id => id > 0);
    console.log(`[AgreementService] Found ${shiftIds.length} shifts in date range for selected locations`);
  } else {
    // No location filter - fetch ALL shifts in date range
    onProgress?.("Finding shifts in date range...");

    const filter = dateFilters.length > 0 ? dateFilters.join(" and ") : undefined;
    console.log(`[AgreementService] Query: ScheduleShift with filter: ${filter}`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shifts = await fetchODataPaged<any>(
      session,
      "ScheduleShift",
      filter,
      undefined,
      "Id"
    );

    shiftIds = shifts.map(s => s.Id as number).filter(id => id > 0);
    console.log(`[AgreementService] Found ${shiftIds.length} shifts in date range`);
  }

  if (shiftIds.length === 0) {
    onProgress?.("No shifts found");
    return [];
  }

  // Query deleted agreements for those shift IDs
  // Use 'in' operator if small batch, otherwise batch with OR
  onProgress?.(`Checking ${shiftIds.length} shifts for deleted agreements...`);

  const allDeletedLinks: DeletedAgreementLink[] = [];

  if (shiftIds.length <= 20) {
    // Small enough to use 'in' operator in single query
    const filter = `Deleted eq true and ScheduleShiftID in (${shiftIds.join(", ")})`;
    console.log(`[AgreementService] Query: ScheduleShiftAgreement with 'in' filter`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const records = await fetchODataPaged<any>(
      session,
      "ScheduleShiftAgreement",
      filter,
      "Updated desc"
    );

    for (const r of records) {
      if (r.Deleted === true) {
        allDeletedLinks.push({
          id: r.Id,
          scheduleShiftId: r.ScheduleShiftID,
          agreementId: r.AgreementID,
          deleted: r.Deleted,
          updatedDate: r.Updated || "",
          updatedBy: r.UpdatedBy || null,
        });
      }
    }
  } else {
    // Batch with OR for larger sets
    const batchSize = 20;
    for (let i = 0; i < shiftIds.length; i += batchSize) {
      const batch = shiftIds.slice(i, i + batchSize);
      const shiftIdFilter = batch.map(id => `ScheduleShiftID eq ${id}`).join(" or ");
      const filter = `Deleted eq true and (${shiftIdFilter})`;

      console.log(`[AgreementService] Batch ${Math.floor(i / batchSize) + 1}: querying ${batch.length} shifts`);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const records = await fetchODataPaged<any>(
        session,
        "ScheduleShiftAgreement",
        filter,
        "Updated desc"
      );

      for (const r of records) {
        if (r.Deleted === true) {
          allDeletedLinks.push({
            id: r.Id,
            scheduleShiftId: r.ScheduleShiftID,
            agreementId: r.AgreementID,
            deleted: r.Deleted,
            updatedDate: r.Updated || "",
            updatedBy: r.UpdatedBy || null,
          });
        }
      }

      if (i + batchSize < shiftIds.length) {
        onProgress?.(`Checked ${i + batch.length} of ${shiftIds.length} shifts...`);
      }
    }
  }

  console.log(`[AgreementService] Found ${allDeletedLinks.length} deleted agreement links`);
  onProgress?.(`Found ${allDeletedLinks.length} deleted agreements`);
  return allDeletedLinks;
}

/**
 * @deprecated Use fetchDeletedAgreementsWithShifts instead - shift details come in the same call.
 *
 * Fetch ScheduleShift details for given IDs
 */
export async function fetchShiftDetails(
  session: Session,
  shiftIds: number[],
  onProgress?: (msg: string) => void
): Promise<Map<number, ShiftDetails>> {
  if (shiftIds.length === 0) {
    console.log("[AgreementService] No shift IDs to fetch");
    return new Map();
  }

  console.log(`[AgreementService] Fetching details for ${shiftIds.length} shifts`);
  console.log(`[AgreementService] First 10 shift IDs:`, shiftIds.slice(0, 10));
  onProgress?.(`Fetching ${shiftIds.length} shift details...`);

  const result = new Map<number, ShiftDetails>();
  const batchSize = 20;

  for (let i = 0; i < shiftIds.length; i += batchSize) {
    const batch = shiftIds.slice(i, i + batchSize);
    // Don't wrap in parentheses - OData handles OR chains fine
    const filter = batch.map(id => `Id eq ${id}`).join(" or ");

    console.log(`[AgreementService] Batch ${i / batchSize + 1}: fetching ${batch.length} shifts`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const records = await fetchODataPaged<any>(
      session,
      "ScheduleShift",
      filter,
      undefined,
      SHIFT_SELECT_FIELDS  // Must include $select for adhoc fields!
    );

    console.log(`[AgreementService] Batch returned ${records.length} records`);

    for (const r of records) {
      result.set(r.Id, {
        id: r.Id,
        description: r.Description || "",
        startTime: r.StartTime || "",
        finishTime: r.FinishTime || "",
        scheduleId: r.ScheduleID || null,
        departmentId: r.DepartmentID || null,
        userId: r.UserID || null,
        syllabusPlus: r.adhoc_SyllabusPlus || "",
      });
    }
  }

  console.log(`[AgreementService] Total loaded: ${result.size} shift details for ${shiftIds.length} requested`);
  onProgress?.(`Loaded ${result.size} shift details`);
  return result;
}

/**
 * Fetch Agreement details for given IDs
 */
export async function fetchAgreementDetails(
  session: Session,
  agreementIds: number[],
  onProgress?: (msg: string) => void
): Promise<Map<number, AgreementDetails>> {
  if (agreementIds.length === 0) return new Map();

  onProgress?.("Fetching agreement details...");

  const result = new Map<number, AgreementDetails>();
  const batchSize = 20;

  for (let i = 0; i < agreementIds.length; i += batchSize) {
    const batch = agreementIds.slice(i, i + batchSize);
    const filter = batch.map(id => `Id eq ${id}`).join(" or ");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const records = await fetchODataPaged<any>(
      session,
      "Agreement",
      filter,
      undefined,
      "Id,Description"
    );

    for (const r of records) {
      result.set(r.Id, {
        id: r.Id,
        description: r.Description || `Agreement ${r.Id}`,
      });
    }
  }

  console.log(`[AgreementService] Loaded ${result.size} agreement details`);
  onProgress?.(`Loaded ${result.size} agreement details`);
  return result;
}
