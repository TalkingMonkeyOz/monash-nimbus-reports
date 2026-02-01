/**
 * Hook for fetching User Security Roles
 * Single OData query with $expand for all related data
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
  Id: number;
  UserID: number;
  SecurityRoleID: number;
  LocationID: number | null;
  LocationGroupID: number | null;
  Active: boolean;
  // Expanded user
  UserObject?: {
    Id: number;
    Username: string;
    Forename: string;
    Surname: string;
    Payroll: string;
    Active: boolean;
    Rosterable: boolean;
  };
  // Expanded security role
  SecurityRole?: {
    Description: string;
  };
  // Expanded location
  LocationObject?: {
    Description: string;
  };
  // Expanded location group
  LocationGroupObject?: {
    Description: string;
  };
}

export interface FetchUserSecurityRolesOptions {
  session: UserSession;
  activeOnly?: boolean;
  onProgress?: (message: string) => void;
}

/**
 * Fetch user security roles with all related data in a single query
 */
export async function fetchUsersWithSecurityRoles(
  options: FetchUserSecurityRolesOptions
): Promise<UserSecurityRoleData[]> {
  const { session, activeOnly = true, onProgress } = options;

  const pageSize = 500;
  let offset = 0;
  let hasMore = true;
  const allRecords: UserSecurityRoleData[] = [];

  const odataBase = `${session.base_url.replace(/\/$/, "")}/CoreAPI/Odata`;

  // Build filter - filter on the security role record, and optionally on user active status
  const filters: string[] = ["Deleted eq false"];
  if (activeOnly) {
    filters.push("Active eq true");
    filters.push("UserObject/Active eq true");
  }
  const filter = filters.join(" and ");

  // Single query: UserSecurityRole with $expand for User, SecurityRole, Location, LocationGroup
  const select = "Id,UserID,SecurityRoleID,LocationID,LocationGroupID,Active";
  const expand = [
    "UserObject($select=Id,Username,Forename,Surname,Payroll,Active,Rosterable)",
    "SecurityRole($select=Description)",
    "LocationObject($select=Description)",
    "LocationGroupObject($select=Description)",
  ].join(",");

  while (hasMore) {
    onProgress?.(`Fetching security roles: ${allRecords.length} loaded...`);

    const url = `${odataBase}/UserSecurityRole?$select=${select}&$expand=${encodeURIComponent(expand)}&$filter=${encodeURIComponent(filter)}&$top=${pageSize}&$skip=${offset}&$orderby=UserObject/Username`;

    console.log("[UserSecurityRoles] Query:", url);

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
      } catch (e) {
        console.error("[UserSecurityRoles] Failed to parse response:", e);
      }
    }

    allRecords.push(...pageRecords);

    if (pageRecords.length < pageSize) {
      hasMore = false;
    } else {
      offset += pageSize;
    }
  }

  onProgress?.(`Loaded ${allRecords.length} security role assignments`);
  return allRecords;
}
