/**
 * Agreement Service
 * Fetches deleted ScheduleShiftAgreement records and related data
 */

import { invoke } from "@tauri-apps/api/core";
import { Dayjs } from "dayjs";

interface Session {
  base_url: string;
  user_id: number;
  auth_token: string;
}

export interface DeletedAgreementLink {
  id: number;
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
      userId: session.user_id,
      authToken: session.auth_token,
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
 * Fetch DELETED ScheduleShiftAgreement records within date range
 * These are agreements that were removed from shifts
 */
export async function fetchDeletedAgreementLinks(
  session: Session,
  fromDate: Dayjs | null,
  toDate: Dayjs | null,
  onProgress?: (msg: string) => void
): Promise<DeletedAgreementLink[]> {
  onProgress?.("Fetching deleted agreement links...");

  // Filter: Deleted = true AND Updated within date range
  const filters: string[] = ["Deleted eq true"];
  if (fromDate) {
    filters.push(`Updated ge ${fromDate.startOf("day").toISOString()}`);
  }
  if (toDate) {
    filters.push(`Updated lt ${toDate.endOf("day").toISOString()}`);
  }
  const filter = filters.join(" and ");

  console.log(`[AgreementService] Querying ScheduleShiftAgreement with filter: ${filter}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const records = await fetchODataPaged<any>(
    session,
    "ScheduleShiftAgreement",
    filter,
    "Updated desc"
  );

  console.log(`[AgreementService] Found ${records.length} deleted agreement links`);

  const result: DeletedAgreementLink[] = records.map(r => ({
    id: r.Id,
    scheduleShiftId: r.ScheduleShiftID,
    agreementId: r.AgreementID,
    deleted: r.Deleted,
    updatedDate: r.Updated || "",
    updatedBy: r.UpdatedBy || null,
  }));

  onProgress?.(`Found ${result.length} deleted agreement links`);
  return result;
}

/**
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
  const batchSize = 50;

  for (let i = 0; i < shiftIds.length; i += batchSize) {
    const batch = shiftIds.slice(i, i + batchSize);
    // Don't wrap in parentheses - OData handles OR chains fine
    const filter = batch.map(id => `Id eq ${id}`).join(" or ");

    console.log(`[AgreementService] Batch ${i / batchSize + 1}: fetching ${batch.length} shifts`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const records = await fetchODataPaged<any>(
      session,
      "ScheduleShift",
      filter
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
  const batchSize = 50;

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
