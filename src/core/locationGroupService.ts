/**
 * LocationGroup Hierarchy Service
 *
 * Handles loading and resolving the hierarchical location group structure:
 * - LocationGroup: Groups that can contain locations and other groups
 * - LocationGroup2Location: Maps groups to their direct locations
 * - LocationGroup2LocationGroup: Maps groups to child groups (RECURSIVE!)
 *
 * Key features:
 * - Recursive resolution: selecting a group includes all nested groups and their locations
 * - Cycle detection: prevents infinite loops in malformed data
 * - Caching: loads once per session, clears on connection change
 */

import { invoke } from "@tauri-apps/api/core";

interface Session {
  base_url: string;
  user_id: number;
  auth_token: string;
}

// ============================================================================
// Types
// ============================================================================

export interface LocationGroupInfo {
  id: number;
  description: string;
  orgCode: string | null; // SAP Organisation Code (adhoc_OrganisationCode)
}

interface LocationGroupNode {
  id: number;
  description: string;
  orgCode: string | null;
  childGroupIds: Set<number>; // Groups contained in this group
  directLocationIds: Set<number>; // Locations directly in this group (not via child groups)
}

// ============================================================================
// Cache
// ============================================================================

const groupCache = new Map<number, LocationGroupNode>();
let hierarchyLoaded = false;
let lastLoadTime: Date | null = null;

// Cache TTL: 24 hours (hierarchy rarely changes)
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// ============================================================================
// OData Fetching
// ============================================================================

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
      console.error("Failed to parse OData response for", endpoint);
      return [];
    }
  }
  return [];
}

// ============================================================================
// Loading Functions
// ============================================================================

/**
 * Load the complete location group hierarchy
 * This fetches all three entities and builds the in-memory hierarchy
 */
export async function loadLocationGroupHierarchy(
  session: Session,
  onProgress?: (msg: string) => void
): Promise<void> {
  // Check if cache is still valid
  if (hierarchyLoaded && lastLoadTime) {
    const age = Date.now() - lastLoadTime.getTime();
    if (age < CACHE_TTL_MS) {
      console.log("LocationGroup hierarchy cache still valid");
      return;
    }
  }

  onProgress?.("Loading location groups...");

  // 1. Load all LocationGroups
  const groups = await fetchOData<{
    Id: number;
    Description: string;
    adhoc_OrganisationCode?: string;
  }>(
    session,
    "LocationGroup?$filter=Active eq true and Deleted eq false&$select=Id,Description,adhoc_OrganisationCode&$orderby=Description"
  );

  console.log(`Loaded ${groups.length} location groups`);

  // Initialize nodes
  groupCache.clear();
  for (const g of groups) {
    groupCache.set(g.Id, {
      id: g.Id,
      description: g.Description || `Group ${g.Id}`,
      orgCode: g.adhoc_OrganisationCode || null,
      childGroupIds: new Set(),
      directLocationIds: new Set(),
    });
  }

  onProgress?.("Loading group-to-location mappings...");

  // 2. Load LocationGroup2Location (groups → locations)
  const group2Location = await fetchOData<{
    LocationGroupID: number;
    LocationID: number;
  }>(
    session,
    "LocationGroup2Location?$filter=Active eq true and Deleted eq false&$select=LocationGroupID,LocationID"
  );

  console.log(`Loaded ${group2Location.length} group-to-location mappings`);

  // Populate direct locations for each group
  for (const mapping of group2Location) {
    const node = groupCache.get(mapping.LocationGroupID);
    if (node) {
      node.directLocationIds.add(mapping.LocationID);
    }
  }

  onProgress?.("Loading nested group relationships...");

  // 3. Load LocationGroup2LocationGroup (groups → child groups)
  const group2Group = await fetchOData<{
    PrimaryLocationGroupID: number;
    SecondaryLocationGroupID: number;
  }>(
    session,
    "LocationGroup2LocationGroup?$filter=Active eq true and Deleted eq false&$select=PrimaryLocationGroupID,SecondaryLocationGroupID"
  );

  console.log(`Loaded ${group2Group.length} nested group relationships`);

  // Populate child groups
  for (const mapping of group2Group) {
    const parentNode = groupCache.get(mapping.PrimaryLocationGroupID);
    if (parentNode) {
      parentNode.childGroupIds.add(mapping.SecondaryLocationGroupID);
    }
  }

  hierarchyLoaded = true;
  lastLoadTime = new Date();

  onProgress?.(`Location group hierarchy loaded (${groups.length} groups)`);
}

// ============================================================================
// Resolution Functions
// ============================================================================

/**
 * Resolve ALL location IDs for a group, including all nested child groups
 * Uses DFS with visited set to prevent cycles
 */
export function resolveLocationsForGroup(groupId: number): Set<number> {
  const locations = new Set<number>();
  const visited = new Set<number>();

  function traverse(gid: number) {
    if (visited.has(gid)) return; // Prevent cycles
    visited.add(gid);

    const node = groupCache.get(gid);
    if (!node) return;

    // Add direct locations from this group
    node.directLocationIds.forEach((lid) => locations.add(lid));

    // Recursively traverse child groups
    node.childGroupIds.forEach((childId) => traverse(childId));
  }

  traverse(groupId);
  return locations;
}

/**
 * Resolve ALL location IDs for multiple groups
 */
export function resolveLocationsForGroups(groupIds: number[]): Set<number> {
  const locations = new Set<number>();
  for (const gid of groupIds) {
    resolveLocationsForGroup(gid).forEach((lid) => locations.add(lid));
  }
  return locations;
}

/**
 * Get child group IDs for a group (direct children only, not recursive)
 */
export function getChildGroupIds(groupId: number): number[] {
  const node = groupCache.get(groupId);
  return node ? Array.from(node.childGroupIds) : [];
}

/**
 * Get ALL descendant group IDs (recursive)
 */
export function getAllDescendantGroupIds(groupId: number): Set<number> {
  const descendants = new Set<number>();
  const visited = new Set<number>();

  function traverse(gid: number) {
    if (visited.has(gid)) return;
    visited.add(gid);

    const node = groupCache.get(gid);
    if (!node) return;

    node.childGroupIds.forEach((childId) => {
      descendants.add(childId);
      traverse(childId);
    });
  }

  traverse(groupId);
  return descendants;
}

// ============================================================================
// Getters
// ============================================================================

/**
 * Get location group info by ID
 */
export function getLocationGroup(groupId: number): LocationGroupInfo | null {
  const node = groupCache.get(groupId);
  if (!node) return null;
  return {
    id: node.id,
    description: node.description,
    orgCode: node.orgCode,
  };
}

/**
 * Get all location groups as array for dropdown
 * Sorted by description
 */
export function getAllLocationGroups(): LocationGroupInfo[] {
  return Array.from(groupCache.values())
    .map((node) => ({
      id: node.id,
      description: node.description,
      orgCode: node.orgCode,
    }))
    .sort((a, b) => a.description.localeCompare(b.description));
}

/**
 * Get root location groups (groups not contained in any other group)
 */
export function getRootLocationGroups(): LocationGroupInfo[] {
  // Find all group IDs that are children of some other group
  const childIds = new Set<number>();
  for (const node of groupCache.values()) {
    node.childGroupIds.forEach((cid) => childIds.add(cid));
  }

  // Return groups that are NOT children
  return Array.from(groupCache.values())
    .filter((node) => !childIds.has(node.id))
    .map((node) => ({
      id: node.id,
      description: node.description,
      orgCode: node.orgCode,
    }))
    .sort((a, b) => a.description.localeCompare(b.description));
}

/**
 * Get location count for a group (including nested groups)
 */
export function getLocationCountForGroup(groupId: number): number {
  return resolveLocationsForGroup(groupId).size;
}

/**
 * Search location groups by name or org code
 */
export function searchLocationGroups(
  query: string,
  limit: number = 20
): LocationGroupInfo[] {
  const lowerQuery = query.toLowerCase();
  const results: LocationGroupInfo[] = [];

  for (const node of groupCache.values()) {
    if (results.length >= limit) break;

    const matchesDescription = node.description
      .toLowerCase()
      .includes(lowerQuery);
    const matchesOrgCode = node.orgCode?.toLowerCase().includes(lowerQuery);

    if (matchesDescription || matchesOrgCode) {
      results.push({
        id: node.id,
        description: node.description,
        orgCode: node.orgCode,
      });
    }
  }

  return results.sort((a, b) => a.description.localeCompare(b.description));
}

// ============================================================================
// Cache Management
// ============================================================================

/**
 * Clear the location group cache
 * Call this when switching connections
 */
export function clearLocationGroupCache(): void {
  groupCache.clear();
  hierarchyLoaded = false;
  lastLoadTime = null;
  console.log("LocationGroup cache cleared");
}

/**
 * Check if hierarchy is loaded
 */
export function isHierarchyLoaded(): boolean {
  return hierarchyLoaded;
}

/**
 * Force reload of hierarchy (ignores cache TTL)
 */
export async function reloadLocationGroupHierarchy(
  session: Session,
  onProgress?: (msg: string) => void
): Promise<void> {
  clearLocationGroupCache();
  await loadLocationGroupHierarchy(session, onProgress);
}
