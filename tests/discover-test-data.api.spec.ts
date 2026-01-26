/**
 * Test Data Discovery Script
 *
 * Queries test-monash to find specific records for baseline testing.
 * Run with: npx ts-node tests/discover-test-data.ts
 * Or: npx playwright test tests/discover-test-data.spec.ts --project=api
 */

import { test, expect } from "@playwright/test";

const CONFIG = {
  baseUrl: process.env.NIMBUS_BASE_URL || "https://test-monash.nimbus.cloud",
  userId: process.env.NIMBUS_USER_ID || "20",
  authToken: process.env.NIMBUS_AUTH_TOKEN || "9b8b5ee7-71ac-4f03-9364-04d9c61a5d2e",
};

function getHeaders() {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    UserID: CONFIG.userId,
    Authorization: `Bearer ${CONFIG.authToken}`,
    AuthenticationToken: CONFIG.authToken,
  };
}

test.describe("Discover Baseline Test Data", () => {

  test("Find deleted shifts for Deleted Agreements report", async ({ request }) => {
    // Find deleted shifts in last 90 days
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const filter = encodeURIComponent(
      `Deleted eq true and StartTime ge ${ninetyDaysAgo.toISOString()}`
    );

    const response = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/ScheduleShift?$filter=${filter}&$top=20&$orderby=LastUpdated desc`,
      { headers: getHeaders() }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    const records = Array.isArray(data) ? data : data.value || [];

    console.log("\n=== DELETED SHIFTS (Baseline for Deleted Agreements Report) ===");
    console.log(`Found ${records.length} deleted shifts in last 90 days`);

    if (records.length > 0) {
      console.log("\nSample records for testing:");
      records.slice(0, 5).forEach((r: any, i: number) => {
        console.log(`  ${i + 1}. ShiftID: ${r.Id}, ScheduleID: ${r.ScheduleID}, LastUpdatedBy: ${r.LastUpdatedBy}, Date: ${r.StartTime?.split('T')[0]}`);
      });

      // Extract unique LastUpdatedBy users (deleters)
      const deleters = [...new Set(records.map((r: any) => r.LastUpdatedBy).filter(Boolean))];
      console.log(`\nUsers who deleted shifts: ${deleters.slice(0, 10).join(', ')}`);
    }
  });

  test("Find location groups and their hierarchy", async ({ request }) => {
    // Get location groups
    const groupsResponse = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/LocationGroup?$filter=Active eq true and Deleted eq false&$top=50&$orderby=Description`,
      { headers: getHeaders() }
    );

    expect(groupsResponse.status()).toBe(200);
    const groupsData = await groupsResponse.json();
    const groups = Array.isArray(groupsData) ? groupsData : groupsData.value || [];

    console.log("\n=== LOCATION GROUPS ===");
    console.log(`Found ${groups.length} active location groups`);

    // Get group-to-location mappings
    const mappingsResponse = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/LocationGroup2Location?$filter=Active eq true and Deleted eq false&$top=100`,
      { headers: getHeaders() }
    );

    const mappingsData = await mappingsResponse.json();
    const mappings = Array.isArray(mappingsData) ? mappingsData : mappingsData.value || [];

    // Count locations per group
    const locationCounts: Record<number, number> = {};
    mappings.forEach((m: any) => {
      locationCounts[m.LocationGroupID] = (locationCounts[m.LocationGroupID] || 0) + 1;
    });

    // Find groups with most locations (good for testing hierarchy)
    const groupsWithCounts = groups.map((g: any) => ({
      id: g.Id,
      description: g.Description,
      locationCount: locationCounts[g.Id] || 0
    })).sort((a: any, b: any) => b.locationCount - a.locationCount);

    console.log("\nTop groups by location count (good for hierarchy testing):");
    groupsWithCounts.slice(0, 10).forEach((g: any, i: number) => {
      console.log(`  ${i + 1}. GroupID: ${g.id}, "${g.description}", ${g.locationCount} locations`);
    });

    // Get nested groups
    const nestedResponse = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/LocationGroup2LocationGroup?$filter=Active eq true and Deleted eq false&$top=50`,
      { headers: getHeaders() }
    );

    const nestedData = await nestedResponse.json();
    const nested = Array.isArray(nestedData) ? nestedData : nestedData.value || [];

    console.log(`\nNested group relationships: ${nested.length} found`);
    if (nested.length > 0) {
      console.log("Sample nested groups (for recursive testing):");
      nested.slice(0, 5).forEach((n: any, i: number) => {
        const parent = groups.find((g: any) => g.Id === n.PrimaryLocationGroupID);
        const child = groups.find((g: any) => g.Id === n.SecondaryLocationGroupID);
        console.log(`  ${i + 1}. Parent: ${parent?.Description || n.PrimaryLocationGroupID} → Child: ${child?.Description || n.SecondaryLocationGroupID}`);
      });
    }
  });

  test("Find agreement types (AgreementType=2)", async ({ request }) => {
    const response = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/Agreement?$filter=Active eq true and Deleted eq false and AgreementType eq 2&$orderby=Description`,
      { headers: getHeaders() }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    const agreements = Array.isArray(data) ? data : data.value || [];

    console.log("\n=== AGREEMENT TYPES (Type=2, Shift/Person) ===");
    console.log(`Found ${agreements.length} agreement types`);

    agreements.forEach((a: any, i: number) => {
      console.log(`  ${i + 1}. ID: ${a.Id}, "${a.Description}"`);
    });

    // Find Vacant Shift if exists
    const vacant = agreements.find((a: any) =>
      a.Description?.toLowerCase().includes('vacant')
    );
    if (vacant) {
      console.log(`\n*** VACANT SHIFT ID: ${vacant.Id} ("${vacant.Description}") - use for exclude filter testing ***`);
    }
  });

  test("Find shifts with activities for Activities Report", async ({ request }) => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const filter = encodeURIComponent(
      `Deleted eq false and ActivityTypeID ne null and StartTime ge ${thirtyDaysAgo.toISOString()}`
    );

    const response = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/ScheduleShift?$filter=${filter}&$top=20`,
      { headers: getHeaders() }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    const shifts = Array.isArray(data) ? data : data.value || [];

    console.log("\n=== SHIFTS WITH ACTIVITIES ===");
    console.log(`Found ${shifts.length} shifts with activities in last 30 days`);

    // Get unique activity types
    const activityTypes = [...new Set(shifts.map((s: any) => s.ActivityTypeID).filter(Boolean))];
    console.log(`Unique ActivityTypeIDs: ${activityTypes.slice(0, 20).join(', ')}`);

    if (shifts.length > 0) {
      console.log("\nSample shifts for testing:");
      shifts.slice(0, 5).forEach((s: any, i: number) => {
        console.log(`  ${i + 1}. ShiftID: ${s.Id}, ActivityTypeID: ${s.ActivityTypeID}, LocationID: ${s.LocationID}`);
      });
    }
  });

  test("Find shifts missing activities for Missing Activities Report", async ({ request }) => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const filter = encodeURIComponent(
      `Deleted eq false and UserID ne null and ActivityTypeID eq null and StartTime ge ${thirtyDaysAgo.toISOString()}`
    );

    const response = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/ScheduleShift?$filter=${filter}&$top=20`,
      { headers: getHeaders() }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    const shifts = Array.isArray(data) ? data : data.value || [];

    console.log("\n=== SHIFTS MISSING ACTIVITIES ===");
    console.log(`Found ${shifts.length} shifts with user but no activity in last 30 days`);

    if (shifts.length > 0) {
      console.log("\nSample shifts for testing:");
      shifts.slice(0, 5).forEach((s: any, i: number) => {
        console.log(`  ${i + 1}. ShiftID: ${s.Id}, UserID: ${s.UserID}, LocationID: ${s.LocationID}, Date: ${s.StartTime?.split('T')[0]}`);
      });
    }
  });

  test("Find shifts missing job roles for Missing Job Roles Report", async ({ request }) => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const filter = encodeURIComponent(
      `Deleted eq false and JobRoleID eq null and StartTime ge ${thirtyDaysAgo.toISOString()}`
    );

    const response = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/ScheduleShift?$filter=${filter}&$top=20`,
      { headers: getHeaders() }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    const shifts = Array.isArray(data) ? data : data.value || [];

    console.log("\n=== SHIFTS MISSING JOB ROLES ===");
    console.log(`Found ${shifts.length} shifts without job role in last 30 days`);

    if (shifts.length > 0) {
      console.log("\nSample shifts for testing:");
      shifts.slice(0, 5).forEach((s: any, i: number) => {
        console.log(`  ${i + 1}. ShiftID: ${s.Id}, UserID: ${s.UserID}, LocationID: ${s.LocationID}`);
      });
    }
  });

  test("Find users for Person Lookup testing", async ({ request }) => {
    const response = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/User?$filter=Active eq true&$top=50&$orderby=LastName`,
      { headers: getHeaders() }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    const users = Array.isArray(data) ? data : data.value || [];

    console.log("\n=== USERS FOR LOOKUP TESTING ===");
    console.log(`Sample of ${users.length} users`);

    // Find users with different name patterns
    users.slice(0, 10).forEach((u: any, i: number) => {
      console.log(`  ${i + 1}. UserID: ${u.Id}, Name: "${u.FirstName} ${u.LastName}", Payroll: ${u.PayrollNumber || 'N/A'}`);
    });

    // Count total users
    const countResponse = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/User?$count=true&$top=0`,
      { headers: getHeaders() }
    );
    const countData = await countResponse.json();
    console.log(`\nTotal active users: ${countData['@odata.count'] || 'unknown'}`);
  });

  test("Find change history records", async ({ request }) => {
    // Query ScheduleShiftHistory for recent changes
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const filter = encodeURIComponent(
      `Inserted ge ${thirtyDaysAgo.toISOString()}`
    );

    const response = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/ScheduleShiftHistory?$filter=${filter}&$top=20&$orderby=Inserted desc`,
      { headers: getHeaders() }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    const history = Array.isArray(data) ? data : data.value || [];

    console.log("\n=== CHANGE HISTORY RECORDS ===");
    console.log(`Found ${history.length} history records in last 30 days`);

    if (history.length > 0) {
      // Get unique ChangedBy users
      const changers = [...new Set(history.map((h: any) => h.InsertedBy).filter(Boolean))];
      console.log(`Users who made changes: ${changers.slice(0, 10).join(', ')}`);

      console.log("\nSample history records:");
      history.slice(0, 5).forEach((h: any, i: number) => {
        console.log(`  ${i + 1}. HistoryID: ${h.Id}, ShiftID: ${h.ScheduleShiftID}, By: ${h.InsertedBy}, Date: ${h.Inserted?.split('T')[0]}`);
      });
    }
  });

  test("Find orphaned shifts (Deleted=false but parent deleted)", async ({ request }) => {
    // This is complex - need to find shifts where parent schedule is deleted
    // First get some deleted schedules
    const schedulesResponse = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/Schedule?$filter=Deleted eq true&$top=10`,
      { headers: getHeaders() }
    );

    const schedulesData = await schedulesResponse.json();
    const deletedSchedules = Array.isArray(schedulesData) ? schedulesData : schedulesData.value || [];

    console.log("\n=== ORPHANED SHIFTS DETECTION ===");
    console.log(`Found ${deletedSchedules.length} deleted schedules`);

    if (deletedSchedules.length > 0) {
      // Check if any have non-deleted shifts
      const scheduleIds = deletedSchedules.slice(0, 5).map((s: any) => s.Id);
      console.log(`Checking schedules: ${scheduleIds.join(', ')}`);

      for (const scheduleId of scheduleIds) {
        const shiftsFilter = encodeURIComponent(`ScheduleID eq ${scheduleId} and Deleted eq false`);
        const shiftsResponse = await request.get(
          `${CONFIG.baseUrl}/CoreAPI/Odata/ScheduleShift?$filter=${shiftsFilter}&$top=5`,
          { headers: getHeaders() }
        );

        const shiftsData = await shiftsResponse.json();
        const orphanedShifts = Array.isArray(shiftsData) ? shiftsData : shiftsData.value || [];

        if (orphanedShifts.length > 0) {
          console.log(`  Schedule ${scheduleId} (DELETED) has ${orphanedShifts.length} non-deleted shifts (ORPHANED)`);
          orphanedShifts.slice(0, 2).forEach((s: any) => {
            console.log(`    ShiftID: ${s.Id}, Date: ${s.StartTime?.split('T')[0]}`);
          });
        }
      }
    }
  });

  test("Summary: Generate test data constants", async ({ request }) => {
    console.log("\n");
    console.log("=".repeat(70));
    console.log("RECOMMENDED TEST DATA CONSTANTS");
    console.log("=".repeat(70));
    console.log(`
Copy these to your test files:

export const TEST_DATA = {
  // Dates (adjust based on discovery output)
  DATE_RANGE: {
    from: "YYYY-MM-DD",  // Fill from discovery
    to: "YYYY-MM-DD",
  },

  // Known deleted shift IDs (from discovery)
  DELETED_SHIFT_IDS: [],  // Fill from discovery

  // Location groups with known hierarchy
  LOCATION_GROUPS: {
    withMostLocations: { id: 0, name: "", locationCount: 0 },
    nested: { parentId: 0, childId: 0 },
  },

  // Agreement types
  AGREEMENTS: {
    vacantShiftId: 0,  // For exclude filter testing
    allIds: [],  // All type=2 agreement IDs
  },

  // Users for lookup testing
  USERS: {
    withPayroll: { id: 0, name: "", payroll: "" },
    whoDeletdShifts: [],  // User IDs who deleted shifts
  },
};
`);
  });
});
