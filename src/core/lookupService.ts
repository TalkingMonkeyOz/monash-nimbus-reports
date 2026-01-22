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

export interface UserInfo {
  id: number;
  username: string;
  forename: string;
  surname: string;
  fullName: string;
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
  }>(session, "User?$select=Id,Username,Forename,Surname");

  for (const user of users) {
    userCache.set(user.Id, {
      id: user.Id,
      username: user.Username || "",
      forename: user.Forename || "",
      surname: user.Surname || "",
      fullName: `${user.Forename || ""} ${user.Surname || ""}`.trim() || user.Username || `User ${user.Id}`,
    });
  }
  console.log(`Loaded ${userCache.size} users into cache`);
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
 * Clear all caches (useful for testing or when switching connections)
 */
export function clearCaches(): void {
  userCache.clear();
  locationCache.clear();
  departmentCache.clear();
  scheduleCache.clear();
}

/**
 * Get all locations as array for dropdown
 */
export function getAllLocations(): LocationInfo[] {
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

  if (scheduleIds.length > 0) {
    onProgress?.("Loading schedules...");
    // Clear schedule cache to ensure we get fresh data with locationId
    scheduleCache.clear();
    await loadSchedules(session, scheduleIds);
  }

  onProgress?.("Lookups loaded");
}
