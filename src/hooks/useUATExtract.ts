/**
 * Hook for fetching UAT Extract data
 * Fetches comprehensive user data for 12-sheet Excel export
 * Based on nimbus-user-loader UATExtractService
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

// Entity interfaces for the 12 sheets
export interface UATUser {
  Id: number;
  Username: string;
  Forename: string;
  Surname: string;
  Payroll: string;
  Active: boolean;
  Rosterable: boolean;
  Email: string | null;
  Phone: string | null;
  DateOfBirth: string | null;
  StartDate: string | null;
  FinishDate: string | null;
}

export interface UATUserLocation {
  Id: number;
  UserID: number;
  LocationID: number;
  Active: boolean;
  Location?: {
    Id: number;
    Description: string;
  };
  UserObject?: {
    Payroll: string;
  };
}

export interface UATUserHours {
  Id: number;
  UserID: number;
  Hours: number | null;
  HoursType: string | null;
  EffectiveDate: string | null;
  Active: boolean;
  UserObject?: {
    Payroll: string;
  };
}

export interface UATUserEmployment {
  Id: number;
  UserID: number;
  EmploymentTypeID: number | null;
  EffectiveDate: string | null;
  Active: boolean;
  EmploymentType?: {
    Id: number;
    Description: string;
  };
  UserObject?: {
    Payroll: string;
  };
}

export interface UATUserJobRole {
  Id: number;
  UserID: number;
  JobRoleID: number;
  DefaultRole: boolean;
  Active: boolean;
  JobRole?: {
    Id: number;
    Description: string;
  };
  UserObject?: {
    Payroll: string;
  };
}

export interface UATUserPayRate {
  Id: number;
  UserID: number;
  PayRate: number | null;
  PayRateID: number | null;
  EffectiveDate: string | null;
  Active: boolean;
  PayRateObject?: {
    Id: number;
    Description: string;
  };
  UserObject?: {
    Payroll: string;
  };
}

export interface UATUserPayRateVariation {
  Id: number;
  UserID: number;
  AwardID: number | null;
  PayRate: number | null;
  JobRoleID: number | null;
  EffectiveDate: string | null;
  Active: boolean;
  AwardObject?: {
    Id: number;
    Description: string;
  };
  JobRoleObject?: {
    Id: number;
    Description: string;
  };
  UserObject?: {
    Payroll: string;
  };
}

export interface UATUserAgreement {
  Id: number;
  UserID: number;
  AgreementID: number | null;
  EffectiveDate: string | null;
  Active: boolean;
  Agreement?: {
    Id: number;
    Description: string;
  };
  UserObject?: {
    Payroll: string;
  };
}

export interface UATUserSkill {
  Id: number;
  UserID: number;
  SkillID: number;
  Active: boolean;
  Skill?: {
    Id: number;
    Description: string;
  };
  UserObject?: {
    Payroll: string;
  };
}

export interface UATUserCycle {
  Id: number;
  UserID: number;
  CycleID: number | null;
  EffectiveDate: string | null;
  Active: boolean;
  CycleObject?: {
    Id: number;
    Description: string;
    DaysInCycle: number;
  };
  UserObject?: {
    Payroll: string;
  };
}

export interface UATUserSecurityRole {
  Id: number;
  UserID: number;
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
  UserObject?: {
    Payroll: string;
  };
}

export interface UATExtractData {
  users: UATUser[];
  userLocations: UATUserLocation[];
  userHours: UATUserHours[];
  userEmployments: UATUserEmployment[];
  userJobRoles: UATUserJobRole[];
  userPayRates: UATUserPayRate[];
  userPayRateVariations: UATUserPayRateVariation[];
  userAgreements: UATUserAgreement[];
  userSkills: UATUserSkill[];
  userCycles: UATUserCycle[];
  userSecurityRoles: UATUserSecurityRole[];
}

export interface FetchUATExtractOptions {
  session: UserSession;
  activeOnly?: boolean;
  onProgress?: (message: string) => void;
}

/**
 * Generic paginated OData fetch - NO LIMIT, follows nextLink like original loader
 * Fetches ALL records by following OData pagination
 */
/**
 * Fetch a single page with retry logic
 */
async function fetchWithRetry(
  session: UserSession,
  url: string,
  maxRetries: number = 3
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await invoke("execute_rest_get", {
        url,
        userId: session.auth_mode === "credential" ? session.user_id : null,
        authToken: session.auth_mode === "credential" ? session.auth_token : null,
        appToken: session.auth_mode === "apptoken" ? session.app_token : null,
        username: session.auth_mode === "apptoken" ? session.username : null,
      });
      return response;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`[Retry ${attempt}/${maxRetries}] Request failed: ${lastError.message}`);

      if (attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt - 1) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error("Request failed after retries");
}

async function fetchPaginated<T>(
  session: UserSession,
  entityPath: string,
  select: string,
  expand: string,
  filter: string,
  pageSize: number = 500,
  onProgress?: (message: string) => void
): Promise<T[]> {
  const odataBase = `${session.base_url.replace(/\/$/, "")}/CoreAPI/Odata`;
  const allRecords: T[] = [];
  let currentUrl: string | null = `${odataBase}/${entityPath}?$select=${select}&$filter=${encodeURIComponent(filter)}&$top=${pageSize}`;
  if (expand) {
    currentUrl += `&$expand=${encodeURIComponent(expand)}`;
  }

  let pageCount = 0;

  while (currentUrl) {
    pageCount++;
    onProgress?.(`Fetching ${entityPath}: ${allRecords.length} loaded (page ${pageCount})...`);

    // Use retry wrapper for resilience
    const response = await fetchWithRetry(session, currentUrl);

    let pageRecords: T[] = [];
    let nextLink: string | null = null;

    if (response?.body) {
      try {
        const parsed = JSON.parse(response.body);

        // Handle both array and object response formats
        if (Array.isArray(parsed)) {
          pageRecords = parsed;
        } else {
          pageRecords = parsed.value || [];
          // Check for OData nextLink for pagination
          nextLink = parsed["odata.nextLink"] || parsed["@odata.nextLink"] || null;
        }
      } catch {
        console.error(`Failed to parse OData response for ${entityPath}`);
      }
    }

    allRecords.push(...pageRecords);

    // If no nextLink and we got fewer records than page size, we're done
    if (nextLink) {
      currentUrl = nextLink;
    } else if (pageRecords.length < pageSize) {
      currentUrl = null;
    } else {
      // No nextLink but got full page - use skip-based pagination as fallback
      currentUrl = `${odataBase}/${entityPath}?$select=${select}&$filter=${encodeURIComponent(filter)}&$top=${pageSize}&$skip=${allRecords.length}`;
      if (expand) {
        currentUrl += `&$expand=${encodeURIComponent(expand)}`;
      }
    }
  }

  console.log(`Fetched ${allRecords.length} ${entityPath} records in ${pageCount} pages`);
  return allRecords;
}

/**
 * Fetch all UAT Extract data
 */
export async function fetchUATExtract(
  options: FetchUATExtractOptions
): Promise<UATExtractData> {
  const { session, activeOnly = true, onProgress } = options;

  const activeFilter = activeOnly ? "Active eq true and Deleted eq false" : "Deleted eq false";
  const userFilter = activeOnly ? "Active eq true and Deleted eq false" : "Deleted eq false";

  onProgress?.("Starting UAT Extract...");

  // Fetch all entities in parallel where possible
  const [
    users,
    userLocations,
    userHours,
    userEmployments,
    userJobRoles,
    userPayRates,
    userPayRateVariations,
    userAgreements,
    userSkills,
    userCycles,
    userSecurityRoles,
  ] = await Promise.all([
    // 1. Users (Staff Profile)
    fetchPaginated<UATUser>(
      session,
      "User",
      "Id,Username,Forename,Surname,Payroll,Active,Rosterable,Email,Phone,DateOfBirth,StartDate,FinishDate",
      "",
      userFilter,
      500,
      (msg) => onProgress?.(`[1/11] ${msg}`)
    ),

    // 2. User Locations
    fetchPaginated<UATUserLocation>(
      session,
      "UserLocation",
      "UserID,LocationID,Active",
      "Location($select=Description),UserObject($select=Payroll)",
      activeFilter,
      500,
      (msg) => onProgress?.(`[2/11] ${msg}`)
    ),

    // 3. User Hours
    fetchPaginated<UATUserHours>(
      session,
      "UserHours",
      "Id,UserID,Hours,HoursType,EffectiveDate,Active",
      "UserObject($select=Payroll)",
      activeFilter,
      500,
      (msg) => onProgress?.(`[3/11] ${msg}`)
    ),

    // 4. User Employments
    fetchPaginated<UATUserEmployment>(
      session,
      "UserEmployment",
      "UserID,EmploymentTypeID,EffectiveDate,Active",
      "EmploymentType($select=Description),UserObject($select=Payroll)",
      activeFilter,
      500,
      (msg) => onProgress?.(`[4/11] ${msg}`)
    ),

    // 5. User Job Roles
    fetchPaginated<UATUserJobRole>(
      session,
      "UserJobRole",
      "Id,UserID,JobRoleID,DefaultRole,Active",
      "JobRole,UserObject($select=Payroll)",
      activeFilter,
      500,
      (msg) => onProgress?.(`[5/11] ${msg}`)
    ),

    // 6. User Pay Rates
    fetchPaginated<UATUserPayRate>(
      session,
      "UserPayRate",
      "UserID,PayRateID,PayRate,EffectiveDate,Active",
      "PayRateObject($select=Description),UserObject($select=Payroll)",
      activeFilter,
      500,
      (msg) => onProgress?.(`[6/11] ${msg}`)
    ),

    // 7. User Pay Rate Variations
    fetchPaginated<UATUserPayRateVariation>(
      session,
      "UserPayRateVariation",
      "UserID,AwardID,PayRate,JobRoleID,EffectiveDate,Active",
      "AwardObject($select=Description),JobRoleObject($select=Description),UserObject($select=Payroll)",
      activeFilter,
      500,
      (msg) => onProgress?.(`[7/11] ${msg}`)
    ),

    // 8. User Agreements
    fetchPaginated<UATUserAgreement>(
      session,
      "UserAgreement",
      "Id,UserID,AgreementID,EffectiveDate,Active",
      "Agreement,UserObject($select=Payroll)",
      activeFilter,
      500,
      (msg) => onProgress?.(`[8/11] ${msg}`)
    ),

    // 9. User Skills
    fetchPaginated<UATUserSkill>(
      session,
      "UserSkill",
      "Id,UserID,SkillID,Active",
      "Skill,UserObject($select=Payroll)",
      activeFilter,
      500,
      (msg) => onProgress?.(`[9/11] ${msg}`)
    ),

    // 10. User Cycles
    fetchPaginated<UATUserCycle>(
      session,
      "UserCycle",
      "UserID,CycleID,EffectiveDate,Active",
      "CycleObject($select=Description,DaysInCycle),UserObject($select=Payroll)",
      activeFilter,
      500,
      (msg) => onProgress?.(`[10/11] ${msg}`)
    ),

    // 11. User Security Roles
    fetchPaginated<UATUserSecurityRole>(
      session,
      "UserSecurityRole",
      "UserID,SecurityRoleID,LocationGroupID,LocationID,EffectiveDate,Active",
      "SecurityRole($select=Description),LocationGroupObject($select=Description),LocationObject($select=Description),UserObject($select=Payroll)",
      activeFilter,
      500,
      (msg) => onProgress?.(`[11/11] ${msg}`)
    ),
  ]);

  onProgress?.(`Loaded ${users.length} users with all related data`);

  return {
    users,
    userLocations,
    userHours,
    userEmployments,
    userJobRoles,
    userPayRates,
    userPayRateVariations,
    userAgreements,
    userSkills,
    userCycles,
    userSecurityRoles,
  };
}

/**
 * Check if the connected user has a specific security role
 * Used for access control to sensitive reports
 */
export async function checkUserSecurityRole(
  session: UserSession,
  allowedRoles: string[]
): Promise<{ hasAccess: boolean; userRoles: string[] }> {
  if (!session.username) {
    return { hasAccess: false, userRoles: [] };
  }

  const odataBase = `${session.base_url.replace(/\/$/, "")}/CoreAPI/Odata`;

  // Find the user by username
  const userUrl = `${odataBase}/User?$filter=Username eq '${session.username}' and Deleted eq false&$select=Id`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userResponse = await invoke<any>("execute_rest_get", {
    url: userUrl,
    userId: session.auth_mode === "credential" ? session.user_id : null,
    authToken: session.auth_mode === "credential" ? session.auth_token : null,
    appToken: session.auth_mode === "apptoken" ? session.app_token : null,
    username: session.auth_mode === "apptoken" ? session.username : null,
  });

  let userId: number | null = null;
  if (userResponse?.body) {
    try {
      const parsed = JSON.parse(userResponse.body);
      const users = Array.isArray(parsed) ? parsed : parsed.value || [];
      if (users.length > 0) {
        userId = users[0].Id;
      }
    } catch {
      console.error("Failed to parse user lookup response");
    }
  }

  if (!userId) {
    return { hasAccess: false, userRoles: [] };
  }

  // Get the user's security roles
  const rolesUrl = `${odataBase}/UserSecurityRole?$filter=UserID eq ${userId} and Active eq true and Deleted eq false&$expand=SecurityRole&$select=Id,SecurityRole`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rolesResponse = await invoke<any>("execute_rest_get", {
    url: rolesUrl,
    userId: session.auth_mode === "credential" ? session.user_id : null,
    authToken: session.auth_mode === "credential" ? session.auth_token : null,
    appToken: session.auth_mode === "apptoken" ? session.app_token : null,
    username: session.auth_mode === "apptoken" ? session.username : null,
  });

  const userRoles: string[] = [];
  if (rolesResponse?.body) {
    try {
      const parsed = JSON.parse(rolesResponse.body);
      const roles = Array.isArray(parsed) ? parsed : parsed.value || [];
      for (const role of roles) {
        if (role.SecurityRole?.Description) {
          userRoles.push(role.SecurityRole.Description);
        }
      }
    } catch {
      console.error("Failed to parse security roles response");
    }
  }

  // Check if any of the user's roles match the allowed roles (case-insensitive)
  const normalizedAllowed = allowedRoles.map((r) => r.toLowerCase());
  const hasAccess = userRoles.some((r) => normalizedAllowed.includes(r.toLowerCase()));

  return { hasAccess, userRoles };
}
