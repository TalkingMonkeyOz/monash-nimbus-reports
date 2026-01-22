/**
 * Nimbus API Tests
 *
 * Tests the Nimbus API endpoints used by the reports app.
 * Uses live API credentials from environment or defaults.
 *
 * Run with: npx playwright test --project=api
 */

import { test, expect, APIRequestContext } from "@playwright/test";

// Test configuration - can be overridden via environment
const CONFIG = {
  baseUrl: process.env.NIMBUS_BASE_URL || "https://test-monash.nimbus.cloud",
  userId: process.env.NIMBUS_USER_ID || "20",
  authToken: process.env.NIMBUS_AUTH_TOKEN || "9b8b5ee7-71ac-4f03-9364-04d9c61a5d2e",
};

// Common headers for all requests
function getHeaders() {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    UserID: CONFIG.userId,
    Authorization: `Bearer ${CONFIG.authToken}`,
    AuthenticationToken: CONFIG.authToken,
  };
}

test.describe("CoreAPI OData Endpoints", () => {
  test("GET /CoreAPI/Odata - service root returns entity sets", async ({ request }) => {
    const response = await request.get(`${CONFIG.baseUrl}/CoreAPI/Odata`, {
      headers: getHeaders(),
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.value).toBeDefined();
    expect(data.value.length).toBeGreaterThan(100); // Should have many entity sets

    // Verify key entity sets exist
    const entityNames = data.value.map((e: { name: string }) => e.name);
    expect(entityNames).toContain("ScheduleShift");
    expect(entityNames).toContain("ScheduleShiftAttendance");
    expect(entityNames).toContain("UserTask");
  });

  test("GET /CoreAPI/Odata/ScheduleShift - basic query works", async ({ request }) => {
    const response = await request.get(`${CONFIG.baseUrl}/CoreAPI/Odata/ScheduleShift?$top=5`, {
      headers: getHeaders(),
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    const records = Array.isArray(data) ? data : data.value || [];
    expect(records.length).toBeGreaterThan(0);
    expect(records[0]).toHaveProperty("Id");
    expect(records[0]).toHaveProperty("StartTime");
  });

  test("GET /CoreAPI/Odata/ScheduleShift - $filter on date range works", async ({ request }) => {
    const filter = encodeURIComponent(
      "StartTime ge 2026-03-01T00:00:00Z and StartTime lt 2026-03-08T00:00:00Z"
    );
    const response = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/ScheduleShift?$filter=${filter}&$top=10`,
      { headers: getHeaders() }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    const records = Array.isArray(data) ? data : data.value || [];

    // Verify all returned records are within date range
    for (const record of records) {
      const startTime = new Date(record.StartTime);
      expect(startTime.getTime()).toBeGreaterThanOrEqual(new Date("2026-03-01").getTime());
      expect(startTime.getTime()).toBeLessThan(new Date("2026-03-08").getTime());
    }
  });

  test("GET /CoreAPI/Odata/ScheduleShift - $filter Deleted eq true works", async ({ request }) => {
    const filter = encodeURIComponent(
      "Deleted eq true and StartTime ge 2026-03-01T00:00:00Z and StartTime lt 2026-03-08T00:00:00Z"
    );
    const response = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/ScheduleShift?$filter=${filter}&$top=10`,
      { headers: getHeaders() }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    const records = Array.isArray(data) ? data : data.value || [];

    // Verify all returned records have Deleted = true
    for (const record of records) {
      expect(record.Deleted).toBe(true);
    }
  });

  test("GET /CoreAPI/Odata/ScheduleShiftAttendance - has ScheduleID field", async ({ request }) => {
    const response = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/ScheduleShiftAttendance?$top=5`,
      { headers: getHeaders() }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    const records = Array.isArray(data) ? data : data.value || [];
    expect(records.length).toBeGreaterThan(0);
    expect(records[0]).toHaveProperty("ScheduleID");
  });

  test("GET /CoreAPI/Odata/UserTask - has TaskID field", async ({ request }) => {
    const response = await request.get(`${CONFIG.baseUrl}/CoreAPI/Odata/UserTask?$top=5`, {
      headers: getHeaders(),
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    const records = Array.isArray(data) ? data : data.value || [];
    expect(records.length).toBeGreaterThan(0);
    expect(records[0]).toHaveProperty("TaskID");
  });

  test("GET /CoreAPI/Odata/ScheduleShiftAttendanceActivity - exists but NO TaskID", async ({
    request,
  }) => {
    const response = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/ScheduleShiftAttendanceActivity?$top=5`,
      { headers: getHeaders() }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    const records = Array.isArray(data) ? data : data.value || [];
    expect(records.length).toBeGreaterThan(0);

    // CoreAPI OData does NOT expose TaskID on this entity
    expect(records[0]).not.toHaveProperty("TaskID");
    expect(records[0]).toHaveProperty("ScheduleShiftAttendanceID");
  });
});

test.describe("REST API Endpoints", () => {
  test("GET /RESTApi/Task?schedule={id} - returns tasks for schedule", async ({ request }) => {
    const scheduleId = 236457; // Known schedule with tasks
    const response = await request.get(`${CONFIG.baseUrl}/RESTApi/Task?schedule=${scheduleId}`, {
      headers: getHeaders(),
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    const tasks = data.Tasks || data;
    expect(Array.isArray(tasks)).toBe(true);
    expect(tasks.length).toBeGreaterThan(0);

    // Verify task structure
    expect(tasks[0]).toHaveProperty("TaskID");
    expect(tasks[0]).toHaveProperty("TaskHours");
    expect(tasks[0]).toHaveProperty("Description");
  });

  test("GET /RESTApi/ScheduleShiftAttendanceActivity - HAS TaskID", async ({ request }) => {
    const response = await request.get(
      `${CONFIG.baseUrl}/RESTApi/ScheduleShiftAttendanceActivity`,
      { headers: getHeaders() }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    const activities = data.ScheduleShiftAttendanceActivities || data;
    expect(Array.isArray(activities)).toBe(true);

    // Find an activity with TaskID
    const withTask = activities.find((a: { TaskID?: number }) => a.TaskID && a.TaskID > 0);
    if (withTask) {
      expect(withTask).toHaveProperty("TaskID");
      expect(withTask).toHaveProperty("ScheduleShiftAttendanceID");
    }
  });

  test("GET /RESTApi/Task/{id} - returns specific task with hours", async ({ request }) => {
    const taskId = 24; // Known task
    const response = await request.get(`${CONFIG.baseUrl}/RESTApi/Task/${taskId}`, {
      headers: getHeaders(),
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    const tasks = data.Tasks || [data];
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks[0].TaskID).toBe(taskId);
    expect(tasks[0]).toHaveProperty("TaskHours");
  });
});

test.describe("Report Query Patterns", () => {
  test("Deleted Agreements: server-side filter returns deleted shifts", async ({ request }) => {
    const filter = encodeURIComponent(
      "Deleted eq true and StartTime ge 2026-03-01T00:00:00Z and StartTime lt 2026-03-08T00:00:00Z"
    );

    const startTime = Date.now();
    const response = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/ScheduleShift?$filter=${filter}`,
      { headers: getHeaders() }
    );
    const elapsed = Date.now() - startTime;

    expect(response.status()).toBe(200);
    const data = await response.json();
    const records = Array.isArray(data) ? data : data.value || [];

    console.log(`Deleted shifts: ${records.length} records in ${elapsed}ms`);
    expect(elapsed).toBeLessThan(30000);

    // Verify all returned records have Deleted = true
    for (const record of records.slice(0, 10)) {
      expect(record.Deleted).toBe(true);
    }
  });

  test("Activities Report: server-side filter for active shifts with activities", async ({
    request,
  }) => {
    const filter = encodeURIComponent(
      "Deleted eq false and ActivityTypeID ne null and StartTime ge 2026-03-01T00:00:00Z and StartTime lt 2026-03-08T00:00:00Z"
    );

    const response = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/ScheduleShift?$filter=${filter}&$top=100`,
      { headers: getHeaders() }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    const records = Array.isArray(data) ? data : data.value || [];

    console.log(`Active shifts with activities: ${records.length} records`);

    // Verify filter worked
    for (const record of records.slice(0, 10)) {
      expect(record.Deleted).toBe(false);
      expect(record.ActivityTypeID).not.toBeNull();
    }
  });

  test("Missing Activities Report: server-side filter for shifts missing activity", async ({
    request,
  }) => {
    const filter = encodeURIComponent(
      "Deleted eq false and UserID ne null and ActivityTypeID eq null and StartTime ge 2026-03-01T00:00:00Z and StartTime lt 2026-03-08T00:00:00Z"
    );

    const response = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/ScheduleShift?$filter=${filter}&$top=100`,
      { headers: getHeaders() }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    const records = Array.isArray(data) ? data : data.value || [];

    console.log(`Shifts missing activity: ${records.length} records`);

    // Verify filter worked (if any records)
    for (const record of records.slice(0, 10)) {
      expect(record.Deleted).toBe(false);
      expect(record.UserID).not.toBeNull();
      expect(record.ActivityTypeID).toBeNull();
    }
  });

  test("Missing Job Roles Report: server-side filter for shifts missing job role", async ({
    request,
  }) => {
    const filter = encodeURIComponent(
      "Deleted eq false and JobRoleID eq null and StartTime ge 2026-03-01T00:00:00Z and StartTime lt 2026-03-08T00:00:00Z"
    );

    const response = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/ScheduleShift?$filter=${filter}&$top=100`,
      { headers: getHeaders() }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    const records = Array.isArray(data) ? data : data.value || [];

    console.log(`Shifts missing job role: ${records.length} records`);

    // Verify filter worked
    for (const record of records.slice(0, 10)) {
      expect(record.Deleted).toBe(false);
      expect(record.JobRoleID).toBeNull();
    }
  });

  test("Task Hours: can get tasks for schedule and activities with TaskID", async ({
    request,
  }) => {
    const scheduleId = 236457;

    // Step 1: Get tasks for schedule
    const tasksResponse = await request.get(
      `${CONFIG.baseUrl}/RESTApi/Task?schedule=${scheduleId}`,
      { headers: getHeaders() }
    );
    expect(tasksResponse.status()).toBe(200);
    const tasksData = await tasksResponse.json();
    const tasks = tasksData.Tasks || tasksData;

    // Step 2: Get attendances for schedule via OData
    const filter = encodeURIComponent(`ScheduleID eq ${scheduleId}`);
    const attendancesResponse = await request.get(
      `${CONFIG.baseUrl}/CoreAPI/Odata/ScheduleShiftAttendance?$filter=${filter}&$top=10`,
      { headers: getHeaders() }
    );
    expect(attendancesResponse.status()).toBe(200);

    // Step 3: Get activities via REST (has TaskID)
    const activitiesResponse = await request.get(
      `${CONFIG.baseUrl}/RESTApi/ScheduleShiftAttendanceActivity`,
      { headers: getHeaders() }
    );
    expect(activitiesResponse.status()).toBe(200);

    console.log(`Schedule ${scheduleId}: ${tasks.length} tasks`);
  });
});
