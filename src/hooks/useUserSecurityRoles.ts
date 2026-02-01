/**
 * Hook for fetching User data with Security Roles and Job Roles
 * Uses OData $expand to get related entities in a single query
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

export interface UserSecurityRoleData {
  // User fields
  Id: number;
  Username: string;
  Forename: string;
  Surname: string;
  Payroll: string;
  Active: boolean;
  Rosterable: boolean;
  // Expanded security roles
  SecurityRoles?: Array<{
    Id: number;
    SecurityRoleID: number;
    LocationID: number | null;
    LocationGroupID: number | null;
    Active: boolean;
    SecurityRole?: {
      Id: number;
      Description: string;
    };
    LocationObject?: {
      Id: number;
      Description: string;
    };
    LocationGroupObject?: {
      Id: number;
      Description: string;
    };
  }>;
  // Expanded job roles
  JobRoles?: Array<{
    Id: number;
    JobRoleID: number;
    DefaultRole: boolean;
    Active: boolean;
    JobRole?: {
      Id: number;
      Description: string;
    };
  }>;
}

export interface FetchUserSecurityRolesOptions {
  session: UserSession;
  activeOnly?: boolean;
  onProgress?: (message: string) => void;
}

/**
 * Fetch users with expanded security roles and job roles
 */
export async function fetchUsersWithSecurityRoles(
  options: FetchUserSecurityRolesOptions
): Promise<UserSecurityRoleData[]> {
  const { session, activeOnly = true, onProgress } = options;

  const pageSize = 100; // Smaller page size due to expanded data
  let offset = 0;
  let hasMore = true;
  const allRecords: UserSecurityRoleData[] = [];

  const odataBase = `${session.base_url.replace(/\/$/, "")}/CoreAPI/Odata`;

  // Build filter
  const filters: string[] = ["Deleted eq false"];
  if (activeOnly) {
    filters.push("Active eq true");
  }
  const filter = filters.join(" and ");

  // Fields to select from User
  const selectFields = "Id,Username,Forename,Surname,Payroll,Active,Rosterable";

  // Expand security roles with nested expands for SecurityRole, Location, LocationGroup
  // Expand job roles with nested expand for JobRole
  const expand = [
    "SecurityRoles($expand=SecurityRole,LocationObject,LocationGroupObject;$filter=Deleted eq false)",
    "JobRoles($expand=JobRole;$filter=Deleted eq false)",
  ].join(",");

  while (hasMore) {
    onProgress?.(`Fetching users: ${allRecords.length} loaded...`);

    const url = `${odataBase}/User?$select=${selectFields}&$expand=${encodeURIComponent(expand)}&$filter=${encodeURIComponent(filter)}&$top=${pageSize}&$skip=${offset}&$orderby=Username`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await invoke<any>("execute_rest_get", {
      url,
      userId: session.auth_mode === "credential" ? session.user_id : null,
      authToken: session.auth_mode === "credential" ? session.auth_token : null,
      appToken: session.auth_mode === "apptoken" ? session.app_token : null,
      username: session.auth_mode === "apptoken" ? session.username : null,
    });

    let pageRecords: UserSecurityRoleData[] = [];
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

  onProgress?.(`Loaded ${allRecords.length} users with security roles`);
  return allRecords;
}
