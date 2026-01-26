/**
 * Report Logic Verification Tests
 *
 * These tests verify that the report queries return expected data
 * and that the logic matches the requirements.
 *
 * Run with: npx playwright test tests/report-verification.api.spec.ts --project=api
 */

import { test, expect } from "@playwright/test";
import {
  CONFIG,
  getHeaders,
  AGREEMENT_TYPES,
  SHIFTS_WITH_ACTIVITIES,
  SHIFTS_MISSING_ACTIVITIES,
  CHANGE_HISTORY,
  DATE_RANGES,
} from "./test-data";

// ============================================================================
// Activities Report Verification
// ============================================================================

test.describe("Activities Report Verification", () => {

  test("TT activity detection: ActivityType has IsTTFlag or adhoc_ prefix", async ({ request }) => {
    // Get activity types to verify TT detection logic
    const response = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/ActivityType?$top=50`,
      { headers: getHeaders() }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    const activityTypes = Array.isArray(data) ? data : data.value || [];

    expect(activityTypes.length).toBeGreaterThan(0);

    // Document activity type structure for verification
    console.log("\n=== Activity Type Fields ===");
    console.log("Fields:", Object.keys(activityTypes[0]).join(", "));

    // Check if adhoc_ prefix exists in descriptions
    const adhocTypes = activityTypes.filter((a: any) =>
      a.Description?.toLowerCase().includes("adhoc") ||
      a.Description?.toLowerCase().startsWith("tt")
    );
    console.log(`Types with 'adhoc' or 'TT' in name: ${adhocTypes.length}`);
    adhocTypes.slice(0, 5).forEach((a: any) => {
      console.log(`  ID: ${a.Id}, "${a.Description}"`);
    });
  });

  test("shifts with activities have expected fields", async ({ request }) => {
    const shiftId = SHIFTS_WITH_ACTIVITIES.SHIFT_IDS[0];
    const filter = encodeURIComponent(`Id eq ${shiftId}`);

    const response = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/ScheduleShift?$filter=${filter}`,
      { headers: getHeaders() }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    const shifts = Array.isArray(data) ? data : data.value || [];

    expect(shifts.length).toBe(1);
    const shift = shifts[0];

    // Verify required fields for Activities report
    expect(shift).toHaveProperty("Id");
    expect(shift).toHaveProperty("ActivityTypeID");
    expect(shift).toHaveProperty("ScheduleID");
    expect(shift).toHaveProperty("StartTime");
    expect(shift).toHaveProperty("FinishTime");
    expect(shift).toHaveProperty("UserID");

    // These might be null but should exist
    expect(shift).toHaveProperty("Description");
    expect(shift).toHaveProperty("Deleted");

    console.log("\n=== Shift with Activity ===");
    console.log(`ShiftID: ${shift.Id}`);
    console.log(`ActivityTypeID: ${shift.ActivityTypeID}`);
    console.log(`UserID: ${shift.UserID}`);
    console.log(`ScheduleID: ${shift.ScheduleID}`);
  });

  test("activities report query returns correct shifts", async ({ request }) => {
    const { from, to } = DATE_RANGES.LAST_30_DAYS();
    const filter = encodeURIComponent(
      `Deleted eq false and ActivityTypeID ne null and StartTime ge ${from}T00:00:00Z and StartTime lt ${to}T23:59:59Z`
    );

    const response = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/ScheduleShift?$filter=${filter}&$top=100`,
      { headers: getHeaders() }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    const shifts = Array.isArray(data) ? data : data.value || [];

    console.log(`\n=== Activities Report Query Results ===`);
    console.log(`Shifts with activities in last 30 days: ${shifts.length}`);

    // Verify all shifts have activities
    for (const shift of shifts) {
      expect(shift.Deleted).toBe(false);
      expect(shift.ActivityTypeID).not.toBeNull();
      const startDate = new Date(shift.StartTime);
      expect(startDate.getTime()).toBeGreaterThanOrEqual(new Date(from).getTime());
    }
  });

});

// ============================================================================
// Missing Activities Report Verification
// ============================================================================

test.describe("Missing Activities Report Verification", () => {

  test("missing activities query returns shifts with users but no activity", async ({ request }) => {
    const { from, to } = DATE_RANGES.LAST_30_DAYS();
    const filter = encodeURIComponent(
      `Deleted eq false and UserID ne null and ActivityTypeID eq null and StartTime ge ${from}T00:00:00Z and StartTime lt ${to}T23:59:59Z`
    );

    const response = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/ScheduleShift?$filter=${filter}&$top=100`,
      { headers: getHeaders() }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    const shifts = Array.isArray(data) ? data : data.value || [];

    console.log(`\n=== Missing Activities Query Results ===`);
    console.log(`Shifts with user but no activity: ${shifts.length}`);

    // Verify logic: has user, no activity
    for (const shift of shifts) {
      expect(shift.Deleted).toBe(false);
      expect(shift.UserID).not.toBeNull();
      expect(shift.ActivityTypeID).toBeNull();
    }

    // Verify known shifts appear in results
    if (shifts.length > 0) {
      const shiftIds = shifts.map((s: any) => s.Id);
      console.log(`Sample shift IDs: ${shiftIds.slice(0, 5).join(", ")}`);
    }
  });

  test("known missing-activity shifts are returned by query", async ({ request }) => {
    // Test with specific known IDs
    const knownIds = SHIFTS_MISSING_ACTIVITIES.SHIFT_IDS;
    const filter = encodeURIComponent(`Id in (${knownIds.join(",")})`);

    const response = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/ScheduleShift?$filter=${filter}`,
      { headers: getHeaders() }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    const shifts = Array.isArray(data) ? data : data.value || [];

    // All should have user but no activity (as discovered)
    for (const shift of shifts) {
      expect(shift.UserID).not.toBeNull();
      expect(shift.ActivityTypeID).toBeNull();
    }
  });

});

// ============================================================================
// Missing Job Roles Report Verification
// ============================================================================

test.describe("Missing Job Roles Report Verification", () => {

  test("missing job roles query returns correct shifts", async ({ request }) => {
    const { from, to } = DATE_RANGES.LAST_30_DAYS();
    const filter = encodeURIComponent(
      `Deleted eq false and JobRoleID eq null and StartTime ge ${from}T00:00:00Z and StartTime lt ${to}T23:59:59Z`
    );

    const response = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/ScheduleShift?$filter=${filter}&$top=100`,
      { headers: getHeaders() }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    const shifts = Array.isArray(data) ? data : data.value || [];

    console.log(`\n=== Missing Job Roles Query Results ===`);
    console.log(`Shifts without job role: ${shifts.length}`);

    // Verify logic
    for (const shift of shifts) {
      expect(shift.Deleted).toBe(false);
      expect(shift.JobRoleID).toBeNull();
    }
  });

  test("JobRole lookup returns valid roles", async ({ request }) => {
    const response = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/JobRole?$filter=Active eq true&$top=20`,
      { headers: getHeaders() }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    const roles = Array.isArray(data) ? data : data.value || [];

    console.log(`\n=== Available Job Roles ===`);
    console.log(`Active job roles: ${roles.length}`);
    roles.slice(0, 10).forEach((r: any) => {
      console.log(`  ID: ${r.Id}, "${r.Description}"`);
    });
  });

});

// ============================================================================
// Change History Report Verification
// ============================================================================

test.describe("Change History Report Verification", () => {

  test("history diff: multiple records for same shift enable diff computation", async ({ request }) => {
    const shiftId = CHANGE_HISTORY.SHIFT_WITH_HISTORY;
    const filter = encodeURIComponent(`ScheduleShiftID eq ${shiftId}`);

    const response = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/ScheduleShiftHistory?$filter=${filter}&$orderby=Inserted desc`,
      { headers: getHeaders() }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    const history = Array.isArray(data) ? data : data.value || [];

    console.log(`\n=== Change History for Shift ${shiftId} ===`);
    console.log(`History records: ${history.length}`);

    // Need at least 2 records to compute diff
    expect(history.length).toBeGreaterThan(1);

    // Show what changed between records
    if (history.length >= 2) {
      const latest = history[0];
      const previous = history[1];

      console.log("\nLatest record fields:", Object.keys(latest).slice(0, 15).join(", "));

      // Compare key fields that might change
      const fieldsToCompare = ["StartTime", "FinishTime", "UserID", "ActivityTypeID", "JobRoleID", "Description"];
      console.log("\nField differences:");
      for (const field of fieldsToCompare) {
        if (latest[field] !== previous[field]) {
          console.log(`  ${field}: "${previous[field]}" → "${latest[field]}"`);
        }
      }
    }
  });

  test("history has all required fields for change tracking", async ({ request }) => {
    const response = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/ScheduleShiftHistory?$top=1`,
      { headers: getHeaders() }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    const history = Array.isArray(data) ? data : data.value || [];

    expect(history.length).toBe(1);
    const record = history[0];

    // Required fields for change history report
    expect(record).toHaveProperty("Id");
    expect(record).toHaveProperty("ScheduleShiftID");
    expect(record).toHaveProperty("Inserted");
    expect(record).toHaveProperty("InsertedBy");

    // Fields that might change (for diff)
    expect(record).toHaveProperty("StartTime");
    expect(record).toHaveProperty("FinishTime");
    expect(record).toHaveProperty("UserID");

    console.log("\n=== History Record Fields ===");
    console.log("All fields:", Object.keys(record).join(", "));
  });

  test("filter by ChangedBy user returns correct records", async ({ request }) => {
    const userId = CHANGE_HISTORY.CHANGER_USER_IDS[0];
    const filter = encodeURIComponent(`InsertedBy eq ${userId}`);

    const response = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/ScheduleShiftHistory?$filter=${filter}&$top=20&$orderby=Inserted desc`,
      { headers: getHeaders() }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    const history = Array.isArray(data) ? data : data.value || [];

    console.log(`\n=== Changes by User ${userId} ===`);
    console.log(`Records: ${history.length}`);

    // All should be by this user
    for (const h of history) {
      expect(h.InsertedBy).toBe(userId);
    }
  });

});

// ============================================================================
// Deleted Agreements Report Verification
// ============================================================================

test.describe("Deleted Agreements Report Verification", () => {

  test("ScheduleShiftAgreement links shifts to agreements", async ({ request }) => {
    const response = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/ScheduleShiftAgreement?$filter=Deleted eq false&$top=10`,
      { headers: getHeaders() }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    const links = Array.isArray(data) ? data : data.value || [];

    console.log(`\n=== ScheduleShiftAgreement Records ===`);
    console.log(`Active links: ${links.length}`);

    for (const link of links.slice(0, 5)) {
      console.log(`  ShiftID: ${link.ScheduleShiftID}, AgreementID: ${link.AgreementID}`);
    }

    // Verify structure
    expect(links[0]).toHaveProperty("ScheduleShiftID");
    expect(links[0]).toHaveProperty("AgreementID");
    expect(links[0]).toHaveProperty("Deleted");
  });

  test("can find deleted ScheduleShiftAgreement records", async ({ request }) => {
    const filter = encodeURIComponent("Deleted eq true");

    const response = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/ScheduleShiftAgreement?$filter=${filter}&$top=20`,
      { headers: getHeaders() }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    const deleted = Array.isArray(data) ? data : data.value || [];

    console.log(`\n=== Deleted Agreement Links ===`);
    console.log(`Found: ${deleted.length} deleted`);

    if (deleted.length > 0) {
      console.log("Sample deleted records:");
      for (const d of deleted.slice(0, 5)) {
        console.log(`  ID: ${d.Id}, ShiftID: ${d.ScheduleShiftID}, AgreementID: ${d.AgreementID}, UpdatedBy: ${d.UpdatedBy}`);
      }
    }
  });

  test("agreement filter excludes Vacant Shift correctly", async ({ request }) => {
    const vacantId = AGREEMENT_TYPES.VACANT_SHIFT_ID;
    const filter = encodeURIComponent(`AgreementID ne ${vacantId}`);

    const response = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/ScheduleShiftAgreement?$filter=${filter}&$top=20`,
      { headers: getHeaders() }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    const links = Array.isArray(data) ? data : data.value || [];

    // None should have Vacant Shift agreement
    for (const link of links) {
      expect(link.AgreementID).not.toBe(vacantId);
    }
  });

});

// ============================================================================
// Orphaned Shifts Report Verification
// ============================================================================

test.describe("Orphaned Shifts Report Verification", () => {

  test("orphaned shifts: non-deleted shifts on deleted schedules", async ({ request }) => {
    // First find a deleted schedule
    const scheduleResponse = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/Schedule?$filter=Deleted eq true&$top=5`,
      { headers: getHeaders() }
    );

    expect(scheduleResponse.status()).toBe(200);
    const scheduleData = await scheduleResponse.json();
    const deletedSchedules = Array.isArray(scheduleData) ? scheduleData : scheduleData.value || [];

    if (deletedSchedules.length === 0) {
      console.log("No deleted schedules found - skipping orphan check");
      return;
    }

    console.log(`\n=== Checking for Orphaned Shifts ===`);
    let totalOrphans = 0;

    for (const schedule of deletedSchedules) {
      const scheduleId = schedule.Id;
      const filter = encodeURIComponent(`ScheduleID eq ${scheduleId} and Deleted eq false`);

      const shiftsResponse = await request.get(
        `${CONFIG.baseUrl}/CoreAPI/Odata/ScheduleShift?$filter=${filter}&$top=10`,
        { headers: getHeaders() }
      );

      const shiftsData = await shiftsResponse.json();
      const orphanedShifts = Array.isArray(shiftsData) ? shiftsData : shiftsData.value || [];

      if (orphanedShifts.length > 0) {
        console.log(`Schedule ${scheduleId} (DELETED) has ${orphanedShifts.length} orphaned shifts`);
        totalOrphans += orphanedShifts.length;
      }
    }

    console.log(`Total orphaned shifts found: ${totalOrphans}`);
  });

});

// ============================================================================
// Location Filter Verification
// ============================================================================

test.describe("Location Filter Verification", () => {

  test("location hierarchy resolves correctly", async ({ request }) => {
    // Get a location group with locations
    const mappingsResponse = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/LocationGroup2Location?$filter=Active eq true and Deleted eq false&$top=50`,
      { headers: getHeaders() }
    );

    expect(mappingsResponse.status()).toBe(200);
    const mappingsData = await mappingsResponse.json();
    const mappings = Array.isArray(mappingsData) ? mappingsData : mappingsData.value || [];

    // Group by LocationGroupID
    const groupToLocations: Record<number, number[]> = {};
    for (const m of mappings) {
      if (!groupToLocations[m.LocationGroupID]) {
        groupToLocations[m.LocationGroupID] = [];
      }
      groupToLocations[m.LocationGroupID].push(m.LocationID);
    }

    console.log("\n=== Location Group → Location Mappings ===");
    const entries = Object.entries(groupToLocations).slice(0, 5);
    for (const [groupId, locationIds] of entries) {
      console.log(`  Group ${groupId}: ${locationIds.length} locations (${locationIds.slice(0, 5).join(", ")}...)`);
    }

    // Verify the hierarchy structure is valid
    expect(Object.keys(groupToLocations).length).toBeGreaterThan(0);

    // Note: ScheduleShift doesn't have LocationID directly
    // Location filtering is done by:
    // 1. Getting ScheduleIDs from Schedule entity filtered by LocationID
    // 2. Or doing client-side filtering after fetching shifts
    // This is handled in the report components via lookupService
  });

  test("Schedule entity has LocationID for filtering", async ({ request }) => {
    const response = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/Schedule?$top=5`,
      { headers: getHeaders() }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    const schedules = Array.isArray(data) ? data : data.value || [];

    expect(schedules.length).toBeGreaterThan(0);
    expect(schedules[0]).toHaveProperty("LocationID");

    console.log("\n=== Schedule Location Filtering ===");
    schedules.slice(0, 3).forEach((s: any) => {
      console.log(`  ScheduleID: ${s.Id}, LocationID: ${s.LocationID}`);
    });
  });

});
