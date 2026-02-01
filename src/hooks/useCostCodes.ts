/**
 * Hook for fetching Cost Centre data with validity dates
 * Used to identify invalid cost codes for payroll purposes
 *
 * Based on: Nimbus CostCentre Integration Table Design v2.0
 * Custom fields: adhoc_From, adhoc_To (validity dates)
 * Note: CostCode/Funds MUST have "/" delimiter for SAP payroll extraction
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

export interface CostCentre {
  Id: number;
  Description: string;
  Code: string;
  Active: boolean;
  Deleted: boolean;
  adhoc_From: string | null;
  adhoc_To: string | null;
  // Computed fields for validation
  hasDelimiter?: boolean;
  isExpired?: boolean;
  isNotYetValid?: boolean;
  validationStatus?: "valid" | "expired" | "not_yet_valid" | "missing_delimiter" | "inactive";
}

export interface FetchCostCodesOptions {
  session: UserSession;
  activeOnly?: boolean;
  onProgress?: (message: string) => void;
}

/**
 * Validate a cost code and determine its status
 */
function validateCostCode(cc: CostCentre): CostCentre {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Check for "/" delimiter (required for SAP payroll)
  const hasDelimiter = cc.Code?.includes("/") ?? false;

  // Check validity dates
  let isExpired = false;
  let isNotYetValid = false;

  if (cc.adhoc_To) {
    const toDate = new Date(cc.adhoc_To);
    toDate.setHours(0, 0, 0, 0);
    isExpired = toDate < today;
  }

  if (cc.adhoc_From) {
    const fromDate = new Date(cc.adhoc_From);
    fromDate.setHours(0, 0, 0, 0);
    isNotYetValid = fromDate > today;
  }

  // Determine overall status
  let validationStatus: CostCentre["validationStatus"] = "valid";
  if (!cc.Active) {
    validationStatus = "inactive";
  } else if (!hasDelimiter) {
    validationStatus = "missing_delimiter";
  } else if (isExpired) {
    validationStatus = "expired";
  } else if (isNotYetValid) {
    validationStatus = "not_yet_valid";
  }

  return {
    ...cc,
    hasDelimiter,
    isExpired,
    isNotYetValid,
    validationStatus,
  };
}

/**
 * Fetch all cost centres using OData with adhoc fields
 * Uses /CoreAPI/OData/CostCentre with explicit $select for adhoc fields
 */
export async function fetchCostCodes(
  options: FetchCostCodesOptions
): Promise<CostCentre[]> {
  const { session, activeOnly = false, onProgress } = options;

  const pageSize = 500;
  const allRecords: CostCentre[] = [];
  const odataBase = `${session.base_url.replace(/\/$/, "")}/CoreAPI/Odata`;

  // Build filter - always exclude deleted
  const filters: string[] = ["Deleted eq false"];
  if (activeOnly) {
    filters.push("Active eq true");
  }
  const filter = filters.join(" and ");

  // Select fields including adhoc custom fields
  const selectFields = "Id,Description,Code,Active,Deleted,adhoc_From,adhoc_To";

  let currentUrl: string | null = `${odataBase}/CostCentre?$select=${selectFields}&$filter=${encodeURIComponent(filter)}&$top=${pageSize}&$orderby=Description`;
  let pageCount = 0;

  while (currentUrl) {
    pageCount++;
    onProgress?.(`Fetching cost codes: ${allRecords.length} loaded (page ${pageCount})...`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await invoke<any>("execute_rest_get", {
      url: currentUrl,
      userId: session.auth_mode === "credential" ? session.user_id : null,
      authToken: session.auth_mode === "credential" ? session.auth_token : null,
      appToken: session.auth_mode === "apptoken" ? session.app_token : null,
      username: session.auth_mode === "apptoken" ? session.username : null,
    });

    let pageRecords: CostCentre[] = [];
    let nextLink: string | null = null;

    if (response?.body) {
      try {
        const parsed = JSON.parse(response.body);

        // Handle both array and object response formats
        if (Array.isArray(parsed)) {
          pageRecords = parsed;
        } else {
          pageRecords = parsed.value || [];
          nextLink = parsed["odata.nextLink"] || parsed["@odata.nextLink"] || null;
        }
      } catch {
        console.error("Failed to parse OData response for CostCentre");
      }
    }

    // Validate each cost code
    const validatedRecords = pageRecords.map(validateCostCode);
    allRecords.push(...validatedRecords);

    // Follow pagination
    if (nextLink) {
      currentUrl = nextLink;
    } else if (pageRecords.length < pageSize) {
      currentUrl = null;
    } else {
      // Fallback skip-based pagination
      currentUrl = `${odataBase}/CostCentre?$select=${selectFields}&$filter=${encodeURIComponent(filter)}&$top=${pageSize}&$skip=${allRecords.length}&$orderby=Description`;
    }
  }

  console.log(`Fetched ${allRecords.length} CostCentre records in ${pageCount} pages`);
  onProgress?.(`Loaded ${allRecords.length} cost codes`);

  return allRecords;
}

/**
 * Get summary statistics for cost code validation
 */
export function getCostCodeStats(costCodes: CostCentre[]): {
  total: number;
  valid: number;
  expired: number;
  notYetValid: number;
  missingDelimiter: number;
  inactive: number;
} {
  return {
    total: costCodes.length,
    valid: costCodes.filter((cc) => cc.validationStatus === "valid").length,
    expired: costCodes.filter((cc) => cc.validationStatus === "expired").length,
    notYetValid: costCodes.filter((cc) => cc.validationStatus === "not_yet_valid").length,
    missingDelimiter: costCodes.filter((cc) => cc.validationStatus === "missing_delimiter").length,
    inactive: costCodes.filter((cc) => cc.validationStatus === "inactive").length,
  };
}
