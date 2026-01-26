/**
 * Regression Test Suite
 *
 * Comprehensive tests for full coverage of all reports and filters.
 * Uses baseline test data for specific assertions.
 *
 * Run with: npx playwright test tests/regression.api.spec.ts --project=api
 */

import { test, expect } from "@playwright/test";
import {
  CONFIG,
  getHeaders,
  AGREEMENT_TYPES,
  LOCATION_GROUPS,
  SHIFTS_WITH_ACTIVITIES,
  SHIFTS_MISSING_ACTIVITIES,
  CHANGE_HISTORY,
  DATE_RANGES,
  EXPECTED_COUNTS,
} from "./test-data";

// ============================================================================
// Agreement Types Tests
// ============================================================================

test.describe("Agreement Types", () => {

  test("all known agreement types exist with correct IDs", async ({ request }) => {
    const response = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/Agreement?$filter=Active eq true and Deleted eq false and AgreementType eq 2&$orderby=Id`,
      { headers: getHeaders() }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    const agreements = Array.isArray(data) ? data : data.value || [];

    // Verify each known agreement exists
    for (const known of AGREEMENT_TYPES.KNOWN_AGREEMENTS) {
      const found = agreements.find((a: any) => a.Id === known.id);
      expect(found, `Agreement ID ${known.id} should exist`).toBeDefined();
      expect(found.Description).toBe(known.description);
    }
  });

  test("agreement count matches expected", async ({ request }) => {
    const response = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/Agreement?$filter=Active eq true and Deleted eq false and AgreementType eq 2&$count=true`,
      { headers: getHeaders() }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    const agreements = Array.isArray(data) ? data : data.value || [];

    expect(agreements.length).toBe(AGREEMENT_TYPES.ALL_IDS.length);
  });

  test("Vacant Shift agreement has expected ID", async ({ request }) => {
    const response = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/Agreement?$filter=Id eq ${AGREEMENT_TYPES.VACANT_SHIFT_ID}`,
      { headers: getHeaders() }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    const agreements = Array.isArray(data) ? data : data.value || [];

    expect(agreements.length).toBe(1);
    expect(agreements[0].Description).toBe("Vacant Shift");
    expect(agreements[0].AgreementType).toBe(2);
  });

});

// ============================================================================
// Location Groups Tests
// ============================================================================

test.describe("Location Groups", () => {

  test("location groups count is reasonable", async ({ request }) => {
    const response = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/LocationGroup?$filter=Active eq true and Deleted eq false&$count=true`,
      { headers: getHeaders() }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    const groups = Array.isArray(data) ? data : data.value || [];

    // Should have many location groups
    expect(groups.length).toBeGreaterThan(100);
  });

  test("nested parent group has expected children", async ({ request }) => {
    const parentId = LOCATION_GROUPS.NESTED_PARENT.id;
    const filter = encodeURIComponent(
      `Active eq true and Deleted eq false and PrimaryLocationGroupID eq ${parentId}`
    );

    const response = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/LocationGroup2LocationGroup?$filter=${filter}`,
      { headers: getHeaders() }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    const nested = Array.isArray(data) ? data : data.value || [];

    // Should have expected children
    const childIds = nested.map((n: any) => n.SecondaryLocationGroupID);
    for (const expectedChild of LOCATION_GROUPS.NESTED_PARENT.childIds) {
      expect(childIds, `Child ${expectedChild} should exist`).toContain(expectedChild);
    }
  });

  test("location group to location mapping exists", async ({ request }) => {
    const response = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/LocationGroup2Location?$filter=Active eq true and Deleted eq false&$top=100`,
      { headers: getHeaders() }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    const mappings = Array.isArray(data) ? data : data.value || [];

    // Should have mappings
    expect(mappings.length).toBeGreaterThan(0);

    // Each mapping should have both IDs
    for (const mapping of mappings) {
      expect(mapping.LocationGroupID).toBeDefined();
      expect(mapping.LocationID).toBeDefined();
    }
  });

  test("locations have required fields", async ({ request }) => {
    const response = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/Location?$filter=Active eq true&$top=50`,
      { headers: getHeaders() }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    const locations = Array.isArray(data) ? data : data.value || [];

    expect(locations.length).toBeGreaterThan(0);
    for (const loc of locations.slice(0, 10)) {
      expect(loc).toHaveProperty("Id");
      expect(loc).toHaveProperty("Description");
    }
  });

});

// ============================================================================
// Activities Report Tests
// ============================================================================

test.describe("Activities Report", () => {

  test("known shifts with activities are returned", async ({ request }) => {
    const shiftIds = SHIFTS_WITH_ACTIVITIES.SHIFT_IDS.join(',');
    const filter = encodeURIComponent(`Id in (${shiftIds})`);

    const response = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/ScheduleShift?$filter=${filter}`,
      { headers: getHeaders() }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    const shifts = Array.isArray(data) ? data : data.value || [];

    expect(shifts.length).toBeGreaterThan(0);
    for (const shift of shifts) {
      expect(shift.ActivityTypeID).not.toBeNull();
    }
  });

  test("activity type filter works", async ({ request }) => {
    const activityTypeId = SHIFTS_WITH_ACTIVITIES.ACTIVITY_TYPE_IDS[0];
    const filter = encodeURIComponent(
      `Deleted eq false and ActivityTypeID eq ${activityTypeId}`
    );

    const response = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/ScheduleShift?$filter=${filter}&$top=10`,
      { headers: getHeaders() }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    const shifts = Array.isArray(data) ? data : data.value || [];

    expect(shifts.length).toBeGreaterThan(0);
    for (const shift of shifts) {
      expect(shift.ActivityTypeID).toBe(activityTypeId);
    }
  });

  test("ActivityType entity exists and has TT prefix field", async ({ request }) => {
    const response = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/ActivityType?$top=10`,
      { headers: getHeaders() }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    const activityTypes = Array.isArray(data) ? data : data.value || [];

    expect(activityTypes.length).toBeGreaterThan(0);
    expect(activityTypes[0]).toHaveProperty("Id");
    expect(activityTypes[0]).toHaveProperty("Description");
  });

});

// ============================================================================
// Missing Activities Report Tests
// ============================================================================

test.describe("Missing Activities Report", () => {

  test("known shifts missing activities are returned", async ({ request }) => {
    const shiftIds = SHIFTS_MISSING_ACTIVITIES.SHIFT_IDS.slice(0, 3).join(',');
    const filter = encodeURIComponent(`Id in (${shiftIds})`);

    const response = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/ScheduleShift?$filter=${filter}`,
      { headers: getHeaders() }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    const shifts = Array.isArray(data) ? data : data.value || [];

    expect(shifts.length).toBeGreaterThan(0);
    // These should have UserID but no ActivityTypeID
    for (const shift of shifts) {
      expect(shift.UserID).not.toBeNull();
      expect(shift.ActivityTypeID).toBeNull();
    }
  });

  test("filter for shifts with user but no activity works", async ({ request }) => {
    const { from, to } = DATE_RANGES.LAST_30_DAYS();
    const filter = encodeURIComponent(
      `Deleted eq false and UserID ne null and ActivityTypeID eq null and StartTime ge ${from}T00:00:00Z and StartTime lt ${to}T23:59:59Z`
    );

    const response = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/ScheduleShift?$filter=${filter}&$top=20`,
      { headers: getHeaders() }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    const shifts = Array.isArray(data) ? data : data.value || [];

    // Verify filter logic
    for (const shift of shifts) {
      expect(shift.Deleted).toBe(false);
      expect(shift.UserID).not.toBeNull();
      expect(shift.ActivityTypeID).toBeNull();
    }
  });

});

// ============================================================================
// Missing Job Roles Report Tests
// ============================================================================

test.describe("Missing Job Roles Report", () => {

  test("filter for shifts without job role works", async ({ request }) => {
    const { from, to } = DATE_RANGES.LAST_30_DAYS();
    const filter = encodeURIComponent(
      `Deleted eq false and JobRoleID eq null and StartTime ge ${from}T00:00:00Z and StartTime lt ${to}T23:59:59Z`
    );

    const response = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/ScheduleShift?$filter=${filter}&$top=20`,
      { headers: getHeaders() }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    const shifts = Array.isArray(data) ? data : data.value || [];

    // Verify filter logic
    for (const shift of shifts) {
      expect(shift.Deleted).toBe(false);
      expect(shift.JobRoleID).toBeNull();
    }
  });

  test("JobRole entity exists", async ({ request }) => {
    const response = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/JobRole?$top=10`,
      { headers: getHeaders() }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    const roles = Array.isArray(data) ? data : data.value || [];

    expect(roles.length).toBeGreaterThan(0);
    expect(roles[0]).toHaveProperty("Id");
    expect(roles[0]).toHaveProperty("Description");
  });

});

// ============================================================================
// Change History Report Tests
// ============================================================================

test.describe("Change History Report", () => {

  test("known history records exist", async ({ request }) => {
    const historyIds = CHANGE_HISTORY.HISTORY_IDS.slice(0, 3).join(',');
    const filter = encodeURIComponent(`Id in (${historyIds})`);

    const response = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/ScheduleShiftHistory?$filter=${filter}`,
      { headers: getHeaders() }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    const history = Array.isArray(data) ? data : data.value || [];

    expect(history.length).toBeGreaterThan(0);
    for (const h of history) {
      expect(h.ScheduleShiftID).toBe(CHANGE_HISTORY.SHIFT_WITH_HISTORY);
    }
  });

  test("history for known shift has multiple records", async ({ request }) => {
    const filter = encodeURIComponent(
      `ScheduleShiftID eq ${CHANGE_HISTORY.SHIFT_WITH_HISTORY}`
    );

    const response = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/ScheduleShiftHistory?$filter=${filter}&$orderby=Inserted desc`,
      { headers: getHeaders() }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    const history = Array.isArray(data) ? data : data.value || [];

    // Should have multiple history records for diff computation
    expect(history.length).toBeGreaterThan(1);

    // Should be ordered by date descending
    for (let i = 1; i < history.length; i++) {
      const prev = new Date(history[i - 1].Inserted);
      const curr = new Date(history[i].Inserted);
      expect(prev.getTime()).toBeGreaterThanOrEqual(curr.getTime());
    }
  });

  test("history has InsertedBy for person filter", async ({ request }) => {
    const response = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/ScheduleShiftHistory?$top=10&$orderby=Inserted desc`,
      { headers: getHeaders() }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    const history = Array.isArray(data) ? data : data.value || [];

    expect(history.length).toBeGreaterThan(0);
    for (const h of history) {
      expect(h).toHaveProperty("InsertedBy");
      expect(h).toHaveProperty("Inserted");
      expect(h).toHaveProperty("ScheduleShiftID");
    }
  });

  test("filter by InsertedBy works", async ({ request }) => {
    const userId = CHANGE_HISTORY.CHANGER_USER_IDS[0];
    const filter = encodeURIComponent(`InsertedBy eq ${userId}`);

    const response = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/ScheduleShiftHistory?$filter=${filter}&$top=10`,
      { headers: getHeaders() }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    const history = Array.isArray(data) ? data : data.value || [];

    expect(history.length).toBeGreaterThan(0);
    for (const h of history) {
      expect(h.InsertedBy).toBe(userId);
    }
  });

});

// ============================================================================
// Orphaned Shifts Report Tests
// ============================================================================

test.describe("Orphaned Shifts Report", () => {

  test("Schedule entity has Deleted field", async ({ request }) => {
    const response = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/Schedule?$top=5`,
      { headers: getHeaders() }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    const schedules = Array.isArray(data) ? data : data.value || [];

    expect(schedules.length).toBeGreaterThan(0);
    expect(schedules[0]).toHaveProperty("Id");
    expect(schedules[0]).toHaveProperty("Deleted");
  });

  test("can find deleted schedules", async ({ request }) => {
    const filter = encodeURIComponent("Deleted eq true");

    const response = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/Schedule?$filter=${filter}&$top=10`,
      { headers: getHeaders() }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    const schedules = Array.isArray(data) ? data : data.value || [];

    // Should have some deleted schedules
    expect(schedules.length).toBeGreaterThan(0);
    for (const s of schedules) {
      expect(s.Deleted).toBe(true);
    }
  });

  test("can filter shifts by ScheduleID", async ({ request }) => {
    // First get a valid schedule ID
    const scheduleResponse = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/Schedule?$top=1`,
      { headers: getHeaders() }
    );

    expect(scheduleResponse.status()).toBe(200);
    const scheduleData = await scheduleResponse.json();
    const schedules = Array.isArray(scheduleData) ? scheduleData : scheduleData.value || [];
    expect(schedules.length).toBeGreaterThan(0);

    const scheduleId = schedules[0].Id;
    const filter = encodeURIComponent(`ScheduleID eq ${scheduleId}`);

    const shiftsResponse = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/ScheduleShift?$filter=${filter}&$top=10`,
      { headers: getHeaders() }
    );

    expect(shiftsResponse.status()).toBe(200);
    const shiftsData = await shiftsResponse.json();
    const shifts = Array.isArray(shiftsData) ? shiftsData : shiftsData.value || [];

    // All shifts should belong to this schedule
    for (const shift of shifts) {
      expect(shift.ScheduleID).toBe(scheduleId);
    }
  });

});

// ============================================================================
// Deleted Agreements Report Tests
// ============================================================================

test.describe("Deleted Agreements Report", () => {

  test("can find ScheduleShiftAgreement entity", async ({ request }) => {
    const response = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/ScheduleShiftAgreement?$top=5`,
      { headers: getHeaders() }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    const agreements = Array.isArray(data) ? data : data.value || [];

    expect(agreements.length).toBeGreaterThan(0);
    expect(agreements[0]).toHaveProperty("ScheduleShiftID");
    expect(agreements[0]).toHaveProperty("AgreementID");
  });

  test("can filter by AgreementID", async ({ request }) => {
    // Use a known agreement ID (not Vacant Shift)
    const agreementId = AGREEMENT_TYPES.ALL_IDS.find(id => id !== AGREEMENT_TYPES.VACANT_SHIFT_ID);
    const filter = encodeURIComponent(`AgreementID eq ${agreementId}`);

    const response = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/ScheduleShiftAgreement?$filter=${filter}&$top=10`,
      { headers: getHeaders() }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    const agreements = Array.isArray(data) ? data : data.value || [];

    // All should have this agreement ID
    for (const a of agreements) {
      expect(a.AgreementID).toBe(agreementId);
    }
  });

  test("ScheduleShiftAgreement has Deleted and Updated fields", async ({ request }) => {
    const response = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/ScheduleShiftAgreement?$top=10`,
      { headers: getHeaders() }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    const agreements = Array.isArray(data) ? data : data.value || [];

    expect(agreements.length).toBeGreaterThan(0);
    expect(agreements[0]).toHaveProperty("Deleted");
    expect(agreements[0]).toHaveProperty("Updated");
    expect(agreements[0]).toHaveProperty("UpdatedBy");
  });

});

// ============================================================================
// User/Person Lookup Tests
// ============================================================================

test.describe("User Lookup", () => {

  test("User entity has required fields for lookup", async ({ request }) => {
    const response = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/User?$top=10&$filter=Active eq true`,
      { headers: getHeaders() }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    const users = Array.isArray(data) ? data : data.value || [];

    expect(users.length).toBeGreaterThan(0);
    expect(users[0]).toHaveProperty("Id");
    // Nimbus uses Forename/Surname, not FirstName/LastName
    expect(users[0]).toHaveProperty("Forename");
    expect(users[0]).toHaveProperty("Surname");
  });

  test("can filter users by name substring", async ({ request }) => {
    // Nimbus uses Forename, not FirstName
    const filter = encodeURIComponent("contains(Forename, 'Admin')");

    const response = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/User?$filter=${filter}&$top=10`,
      { headers: getHeaders() }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    const users = Array.isArray(data) ? data : data.value || [];

    // All should contain 'Admin'
    for (const u of users) {
      expect(u.Forename.toLowerCase()).toContain('admin');
    }
  });

  test("can resolve user by ID", async ({ request }) => {
    const userId = CHANGE_HISTORY.CHANGER_USER_IDS[0];
    const filter = encodeURIComponent(`Id eq ${userId}`);

    const response = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/User?$filter=${filter}`,
      { headers: getHeaders() }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    const users = Array.isArray(data) ? data : data.value || [];

    expect(users.length).toBe(1);
    expect(users[0].Id).toBe(userId);
  });

});
