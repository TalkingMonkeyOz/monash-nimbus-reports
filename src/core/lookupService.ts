/**
 * Lookup services for enriching report data with User, Location, Department, Schedule info
 * Uses CoreAPI OData for efficient lookups with caching
 */

import { invoke } from "@tauri-apps/api/core";

interface Session {
  base_url: string;
  user_id: number;
  auth_token: string;
}

// Cache for lookups to avoid repeated API calls
const userCache = new Map<number, UserInfo>();
const locationCache = new Map<number, LocationInfo>();
const departmentCache = new Map<number, DepartmentInfo>();
const scheduleCache = new Map<number, ScheduleInfo>();
const agreementCache = new Map<number, AgreementInfo>();
const scheduleShiftCache = new Map<number, ScheduleShiftInfo>();
const activityTypeCache = new Map<number, ActivityTypeInfo>();
const agreementTypeCache = new Map<number, AgreementTypeInfo>();

// Cached sorted arrays for fast access (rebuilt when data loads)
let cachedLocationArray: LocationInfo[] | null = null;

// ============================================================================
// User Search Index - Optimized for 21k+ users with type-ahead
// ============================================================================

interface UserSearchIndex {
  // Maps lowercase tokens to user IDs for fast prefix matching
  byNameToken: Map<string, Set<number>>; // "john" → [1, 45, 892]
  byPayroll: Map<string, number>; // "12345" → 1 (exact match)
  byUsername: Map<string, number>; // "jsmith" → 1 (exact match)
  built: boolean;
}

const userSearchIndex: UserSearchIndex = {
  byNameToken: new Map(),
  byPayroll: new Map(),
  byUsername: new Map(),
  built: false,
};

/**
 * Build the user search index after loading users
 * Called automatically by loadUsers()
 */
function buildUserSearchIndex(): void {
  if (userSearchIndex.built) return;

  userSearchIndex.byNameToken.clear();
  userSearchIndex.byPayroll.clear();
  userSearchIndex.byUsername.clear();

  for (const [id, user] of userCache) {
    // Index by name tokens (forename, surname)
    const nameTokens = `${user.forename} ${user.surname}`
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length >= 2);

    for (const token of nameTokens) {
      if (!userSearchIndex.byNameToken.has(token)) {
        userSearchIndex.byNameToken.set(token, new Set());
      }
      userSearchIndex.byNameToken.get(token)!.add(id);
    }

    // Index by payroll (exact match, lowercase)
    if (user.payroll) {
      userSearchIndex.byPayroll.set(user.payroll.toLowerCase(), id);
    }

    // Index by username (exact match, lowercase)
    if (user.username) {
      userSearchIndex.byUsername.set(user.username.toLowerCase(), id);
    }
  }

  userSearchIndex.built = true;
  console.log(
    `User search index built: ${userSearchIndex.byNameToken.size} name tokens, ${userSearchIndex.byPayroll.size} payrolls`
  );
}

/**
 * Search users by query string (name, payroll, or username)
 * Returns up to `limit` results, prioritizing exact matches
 */
export function searchUsers(query: string, limit: number = 20): UserInfo[] {
  if (!query || query.length < 2) return [];
  if (!userSearchIndex.built) return [];

  const lowerQuery = query.toLowerCase().trim();
  const results = new Map<number, UserInfo>(); // Use Map to dedupe

  // 1. Exact payroll match (highest priority)
  const payrollMatch = userSearchIndex.byPayroll.get(lowerQuery);
  if (payrollMatch !== undefined) {
    const user = userCache.get(payrollMatch);
    if (user) results.set(payrollMatch, user);
  }

  // 2. Exact username match
  const usernameMatch = userSearchIndex.byUsername.get(lowerQuery);
  if (usernameMatch !== undefined && !results.has(usernameMatch)) {
    const user = userCache.get(usernameMatch);
    if (user) results.set(usernameMatch, user);
  }

  // 3. Prefix match on name tokens
  if (results.size < limit) {
    // Find all tokens that START WITH the query
    const matchingIds = new Set<number>();
    for (const [token, ids] of userSearchIndex.byNameToken) {
      if (token.startsWith(lowerQuery)) {
        ids.forEach((id) => matchingIds.add(id));
      }
    }

    // Add to results up to limit
    for (const id of matchingIds) {
      if (results.size >= limit) break;
      if (!results.has(id)) {
        const user = userCache.get(id);
        if (user) results.set(id, user);
      }
    }
  }

  // 4. If still under limit, do partial username match
  if (results.size < limit) {
    for (const [username, id] of userSearchIndex.byUsername) {
      if (results.size >= limit) break;
      if (!results.has(id) && username.includes(lowerQuery)) {
        const user = userCache.get(id);
        if (user) results.set(id, user);
      }
    }
  }

  // Sort by full name and return as array
  return Array.from(results.values()).sort((a, b) =>
    a.fullName.localeCompare(b.fullName)
  );
}

/**
 * Check if user search index is ready
 */
export function isUserSearchIndexReady(): boolean {
  return userSearchIndex.built;
}

export interface UserInfo {
  id: number;
  username: string;
  forename: string;
  surname: string;
  fullName: string;
  payroll: string;
}

export interface LocationInfo {
  id: number;
  description: string;
}

export interface DepartmentInfo {
  id: number;
  description: string;
}

export interface ScheduleInfo {
  id: number;
  description: string;
  startDate: string;
  finishDate: string;
  dateRange: string;
  locationId: number | null;
}

export interface AgreementInfo {
  id: number;
  description: string;
}

export interface ScheduleShiftInfo {
  id: number;
  description: string;
  startTime: string;
  finishTime: string;
  scheduleId: number | null;
  departmentId: number | null;
  userId: number | null;
}

export interface ActivityTypeInfo {
  id: number;
  description: string;
  isTT: boolean; // True if description starts with "TT:"
}

export interface AgreementTypeInfo {
  id: number;
  description: string;
}

/**
 * Fetch data from CoreAPI OData
 */
async function fetchOData<T>(session: Session, endpoint: string): Promise<T[]> {
  const url = `${session.base_url.replace(/\/$/, "")}/CoreAPI/Odata/${endpoint}`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await invoke<any>("execute_rest_get", {
    url,
    userId: session.user_id,
    authToken: session.auth_token,
  });

  if (response?.body) {
    try {
      const parsed = JSON.parse(response.body);
      return Array.isArray(parsed) ? parsed : parsed.value || [];
    } catch {
      console.error("Failed to parse OData response");
      return [];
    }
  }
  return [];
}

/**
 * Load users into cache - fetches all users once
 */
export async function loadUsers(session: Session): Promise<void> {
  if (userCache.size > 0) return; // Already loaded

  const users = await fetchOData<{
    Id: number;
    Username: string;
    Forename: string;
    Surname: string;
    Payroll: string;
  }>(session, "User?$select=Id,Username,Forename,Surname,Payroll");

  for (const user of users) {
    userCache.set(user.Id, {
      id: user.Id,
      username: user.Username || "",
      forename: user.Forename || "",
      surname: user.Surname || "",
      fullName: `${user.Forename || ""} ${user.Surname || ""}`.trim() || user.Username || `User ${user.Id}`,
      payroll: user.Payroll || "",
    });
  }
  console.log(`Loaded ${userCache.size} users into cache`);

  // Build search index for fast type-ahead
  buildUserSearchIndex();
}

/**
 * Load locations into cache
 */
export async function loadLocations(session: Session): Promise<void> {
  if (locationCache.size > 0) return;

  const locations = await fetchOData<{
    Id: number;
    Description: string;
  }>(session, "Location?$select=Id,Description");

  for (const loc of locations) {
    locationCache.set(loc.Id, {
      id: loc.Id,
      description: loc.Description || `Location ${loc.Id}`,
    });
  }

  // Build cached sorted array for fast getAllLocations()
  cachedLocationArray = Array.from(locationCache.values()).sort((a, b) =>
    a.description.localeCompare(b.description)
  );

  console.log(`Loaded ${locationCache.size} locations into cache`);
}

/**
 * Load departments into cache
 */
export async function loadDepartments(session: Session): Promise<void> {
  if (departmentCache.size > 0) return;

  const departments = await fetchOData<{
    Id: number;
    Description: string;
  }>(session, "Department?$select=Id,Description");

  for (const dept of departments) {
    departmentCache.set(dept.Id, {
      id: dept.Id,
      description: dept.Description || `Department ${dept.Id}`,
    });
  }
  console.log(`Loaded ${departmentCache.size} departments into cache`);
}

/**
 * Load activity types into cache
 */
export async function loadActivityTypes(session: Session): Promise<void> {
  if (activityTypeCache.size > 0) return;

  const activityTypes = await fetchOData<{
    Id: number;
    Description: string;
  }>(session, "ActivityType?$select=Id,Description");

  for (const at of activityTypes) {
    const description = at.Description || "";
    activityTypeCache.set(at.Id, {
      id: at.Id,
      description,
      isTT: description.startsWith("TT:"),
    });
  }
  console.log(`Loaded ${activityTypeCache.size} activity types into cache`);
}

/**
 * Get activity type info by ID
 */
export function getActivityType(activityTypeId: number | null | undefined): ActivityTypeInfo | null {
  if (!activityTypeId) return null;
  return activityTypeCache.get(activityTypeId) || null;
}

/**
 * Get activity type description by ID
 */
export function getActivityTypeDescription(activityTypeId: number | null | undefined): string {
  if (!activityTypeId) return "";
  const at = activityTypeCache.get(activityTypeId);
  return at?.description || `Activity ${activityTypeId}`;
}

/**
 * Check if an activity type is a TT (timetabled) activity
 */
export function isActivityTypeTT(activityTypeId: number | null | undefined): boolean {
  if (!activityTypeId) return false;
  const at = activityTypeCache.get(activityTypeId);
  return at?.isTT ?? false;
}

// ============================================================================
// Agreement Types (for dynamic filtering)
// ============================================================================

/**
 * Load agreement types into cache - for agreement type filter dropdown
 * IMPORTANT: Load dynamically, never hardcode agreement IDs!
 * AgreementType = 2 is for shift/person agreements (the relevant ones for reports)
 */
export async function loadAgreementTypes(session: Session): Promise<void> {
  if (agreementTypeCache.size > 0) return;

  try {
    console.log("Loading agreement types from OData (AgreementType=2)...");
    const agreements = await fetchOData<{
      Id: number;
      Description: string;
    }>(session, "Agreement?$filter=Active eq true and Deleted eq false and AgreementType eq 2&$select=Id,Description&$orderby=Description");

    console.log(`OData returned ${agreements?.length || 0} agreements`);

    for (const agr of agreements) {
      agreementTypeCache.set(agr.Id, {
        id: agr.Id,
        description: agr.Description || `Agreement ${agr.Id}`,
      });
    }
    console.log(`Loaded ${agreementTypeCache.size} agreement types into cache`);
  } catch (err) {
    console.error("Failed to load agreement types:", err);
  }
}

/**
 * Get agreement type by ID
 */
export function getAgreementType(agreementId: number | null | undefined): AgreementTypeInfo | null {
  if (!agreementId) return null;
  return agreementTypeCache.get(agreementId) || null;
}

/**
 * Get all agreement types as array for filter dropdown
 */
export function getAllAgreementTypes(): AgreementTypeInfo[] {
  return Array.from(agreementTypeCache.values()).sort((a, b) =>
    a.description.localeCompare(b.description)
  );
}

/**
 * Check if agreement types have been loaded
 */
export function isAgreementTypesLoaded(): boolean {
  return agreementTypeCache.size > 0;
}

/**
 * Get all users as array for dropdown (use searchUsers for large lists!)
 */
export function getAllUsers(): UserInfo[] {
  return Array.from(userCache.values()).sort((a, b) =>
    a.fullName.localeCompare(b.fullName)
  );
}

/**
 * Load schedule shifts into cache - filtered by IDs for efficiency
 */
export async function loadScheduleShifts(session: Session, shiftIds: number[]): Promise<void> {
  const missingIds = shiftIds.filter(id => id > 0 && !scheduleShiftCache.has(id));
  if (missingIds.length === 0) return;

  // Fetch in batches to avoid URL length limits
  const batchSize = 50;
  for (let i = 0; i < missingIds.length; i += batchSize) {
    const batch = missingIds.slice(i, i + batchSize);
    const filter = batch.map(id => `Id eq ${id}`).join(" or ");

    const shifts = await fetchOData<{
      Id: number;
      Description: string;
      StartTime: string;
      FinishTime: string;
      ScheduleID: number | null;
      DepartmentID: number | null;
      UserID: number | null;
    }>(session, `ScheduleShift?$filter=${encodeURIComponent(filter)}&$select=Id,Description,StartTime,FinishTime,ScheduleID,DepartmentID,UserID`);

    for (const shift of shifts) {
      scheduleShiftCache.set(shift.Id, {
        id: shift.Id,
        description: shift.Description || "",
        startTime: shift.StartTime || "",
        finishTime: shift.FinishTime || "",
        scheduleId: shift.ScheduleID || null,
        departmentId: shift.DepartmentID || null,
        userId: shift.UserID || null,
      });
    }
  }
  console.log(`Loaded ${scheduleShiftCache.size} schedule shifts into cache`);
}

/**
 * Get schedule shift info by ID
 */
export function getScheduleShift(shiftId: number | null | undefined): ScheduleShiftInfo | null {
  if (!shiftId) return null;
  return scheduleShiftCache.get(shiftId) || null;
}

/**
 * Load agreements into cache - filtered by IDs for efficiency
 */
export async function loadAgreements(session: Session, agreementIds: number[]): Promise<void> {
  const missingIds = agreementIds.filter(id => id > 0 && !agreementCache.has(id));
  if (missingIds.length === 0) return;

  // Fetch in batches to avoid URL length limits
  const batchSize = 50;
  for (let i = 0; i < missingIds.length; i += batchSize) {
    const batch = missingIds.slice(i, i + batchSize);
    const filter = batch.map(id => `Id eq ${id}`).join(" or ");

    const agreements = await fetchOData<{
      Id: number;
      Description: string;
    }>(session, `Agreement?$filter=${encodeURIComponent(filter)}&$select=Id,Description`);

    for (const agr of agreements) {
      agreementCache.set(agr.Id, {
        id: agr.Id,
        description: agr.Description || `Agreement ${agr.Id}`,
      });
    }
  }
  console.log(`Loaded ${agreementCache.size} agreements into cache`);
}

/**
 * Load schedules into cache - filtered by IDs for efficiency
 */
export async function loadSchedules(session: Session, scheduleIds: number[]): Promise<void> {
  // Check for schedules missing from cache OR missing locationId (schema changed)
  const missingIds = scheduleIds.filter(id => {
    if (id <= 0) return false;
    const cached = scheduleCache.get(id);
    return !cached || cached.locationId === undefined;
  });
  if (missingIds.length === 0) return;

  // Fetch in batches to avoid URL length limits
  const batchSize = 50;
  for (let i = 0; i < missingIds.length; i += batchSize) {
    const batch = missingIds.slice(i, i + batchSize);
    const filter = batch.map(id => `Id eq ${id}`).join(" or ");

    const schedules = await fetchOData<{
      Id: number;
      Description: string;
      ScheduleStart: string;
      ScheduleFinish: string;
      LocationID: number | null;
    }>(session, `Schedule?$filter=${encodeURIComponent(filter)}&$select=Id,Description,ScheduleStart,ScheduleFinish,LocationID`);

    for (const sched of schedules) {
      const startDate = sched.ScheduleStart ? new Date(sched.ScheduleStart).toLocaleDateString("en-AU") : "";
      const finishDate = sched.ScheduleFinish ? new Date(sched.ScheduleFinish).toLocaleDateString("en-AU") : "";

      scheduleCache.set(sched.Id, {
        id: sched.Id,
        description: sched.Description || "",
        startDate,
        finishDate,
        dateRange: startDate && finishDate ? `${startDate} - ${finishDate}` : "",
        locationId: sched.LocationID || null,
      });
    }
  }
  console.log(`Loaded ${scheduleCache.size} schedules into cache`);
}

/**
 * Get user info by ID
 */
export function getUser(userId: number | null | undefined): UserInfo | null {
  if (!userId) return null;
  return userCache.get(userId) || null;
}

/**
 * Get username by ID (convenience function)
 */
export function getUsername(userId: number | null | undefined): string {
  const user = getUser(userId);
  return user?.username || (userId ? `User ${userId}` : "Unknown");
}

/**
 * Get user full name by ID
 */
export function getUserFullName(userId: number | null | undefined): string {
  const user = getUser(userId);
  return user?.fullName || (userId ? `User ${userId}` : "Unknown");
}

/**
 * Get user display name with username: "John Smith (jsmith)"
 */
export function getUserDisplayName(userId: number | null | undefined): string {
  const user = getUser(userId);
  if (!user) return userId ? `User ${userId}` : "Unknown";
  if (user.fullName && user.username) {
    return `${user.fullName} (${user.username})`;
  }
  return user.fullName || user.username || `User ${userId}`;
}

/**
 * Get user payroll number by ID
 */
export function getUserPayroll(userId: number | null | undefined): string {
  const user = getUser(userId);
  return user?.payroll || "";
}

/**
 * Get location description by ID
 */
export function getLocation(locationId: number | null | undefined): string {
  if (!locationId) return "";
  const loc = locationCache.get(locationId);
  return loc?.description || `Location ${locationId}`;
}

/**
 * Get department description by ID
 */
export function getDepartment(departmentId: number | null | undefined): string {
  if (!departmentId) return "";
  const dept = departmentCache.get(departmentId);
  return dept?.description || `Department ${departmentId}`;
}

/**
 * Get schedule info by ID
 */
export function getSchedule(scheduleId: number | null | undefined): ScheduleInfo | null {
  if (!scheduleId) return null;
  return scheduleCache.get(scheduleId) || null;
}

/**
 * Get schedule date range string
 */
export function getScheduleDateRange(scheduleId: number | null | undefined): string {
  if (!scheduleId) return "";
  const sched = getSchedule(scheduleId);
  return sched?.dateRange || "";
}

/**
 * Get location via schedule (ScheduleShift -> Schedule -> Location)
 */
export function getLocationViaSchedule(scheduleId: number | null | undefined): string {
  if (!scheduleId) return "";
  const sched = getSchedule(scheduleId);
  if (!sched?.locationId) return "";
  return getLocation(sched.locationId);
}

/**
 * Get location ID via schedule (ScheduleShift -> Schedule -> LocationID)
 */
export function getLocationIdViaSchedule(scheduleId: number | null | undefined): number | null {
  if (!scheduleId) return null;
  const sched = getSchedule(scheduleId);
  return sched?.locationId || null;
}

/**
 * Get agreement info by ID
 */
export function getAgreement(agreementId: number | null | undefined): AgreementInfo | null {
  if (!agreementId) return null;
  return agreementCache.get(agreementId) || null;
}

/**
 * Get agreement description by ID
 */
export function getAgreementDescription(agreementId: number | null | undefined): string {
  if (!agreementId) return "";
  const agr = agreementCache.get(agreementId);
  return agr?.description || `Agreement ${agreementId}`;
}

/**
 * Clear all caches (useful for testing or when switching connections)
 */
export function clearCaches(): void {
  userCache.clear();
  locationCache.clear();
  departmentCache.clear();
  scheduleCache.clear();
  agreementCache.clear();
  scheduleShiftCache.clear();
  activityTypeCache.clear();
  cachedLocationArray = null;
  agreementTypeCache.clear();

  // Clear user search index
  userSearchIndex.byNameToken.clear();
  userSearchIndex.byPayroll.clear();
  userSearchIndex.byUsername.clear();
  userSearchIndex.built = false;
}

/**
 * Get all locations as array for dropdown
 */
export function getAllLocations(): LocationInfo[] {
  // Use cached sorted array for O(1) access
  if (cachedLocationArray) return cachedLocationArray;

  // Fallback to building array (shouldn't happen after load)
  return Array.from(locationCache.values()).sort((a, b) =>
    a.description.localeCompare(b.description)
  );
}

/**
 * Get all departments as array for dropdown
 */
export function getAllDepartments(): DepartmentInfo[] {
  return Array.from(departmentCache.values()).sort((a, b) =>
    a.description.localeCompare(b.description)
  );
}

/**
 * Load all lookups needed for reports
 */
export async function loadAllLookups(
  session: Session,
  scheduleIds: number[] = [],
  onProgress?: (msg: string) => void
): Promise<void> {
  onProgress?.("Loading users...");
  await loadUsers(session);

  onProgress?.("Loading locations...");
  await loadLocations(session);

  onProgress?.("Loading departments...");
  await loadDepartments(session);

  onProgress?.("Loading activity types...");
  await loadActivityTypes(session);

  if (scheduleIds.length > 0) {
    onProgress?.("Loading schedules...");
    // Clear schedule cache to ensure we get fresh data with locationId
    scheduleCache.clear();
    await loadSchedules(session, scheduleIds);
  }

  onProgress?.("Lookups loaded");
}
