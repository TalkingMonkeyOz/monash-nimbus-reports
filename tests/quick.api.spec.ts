/**
 * Quick Test Suite
 *
 * Fast sanity checks (~30 seconds) to run before each dev session.
 * Tests API connectivity and basic lookup loading.
 *
 * Run with: npx playwright test tests/quick.api.spec.ts --project=api
 */

import { test, expect } from "@playwright/test";
import {
  CONFIG,
  getHeaders,
  AGREEMENT_TYPES,
  LOCATION_GROUPS,
  EXPECTED_COUNTS,
} from "./test-data";

test.describe("Quick Sanity Checks", () => {

  test.describe("API Connectivity", () => {

    test("OData service root is accessible", async ({ request }) => {
      const response = await request.get(`${CONFIG.baseUrl}/CoreAPI/Odata`, {
        headers: getHeaders(),
      });

      expect(response.status()).toBe(200);
      const data = await response.json();
      expect(data.value).toBeDefined();
      expect(data.value.length).toBeGreaterThan(100);
    });

    test("can query ScheduleShift entity", async ({ request }) => {
      const response = await request.get(
        `${CONFIG.baseUrl}/CoreAPI/Odata/ScheduleShift?$top=1`,
        { headers: getHeaders() }
      );

      expect(response.status()).toBe(200);
      const data = await response.json();
      const records = Array.isArray(data) ? data : data.value || [];
      expect(records.length).toBe(1);
      expect(records[0]).toHaveProperty("Id");
    });

  });

  test.describe("Lookup Loading", () => {

    test("Agreement types load correctly (AgreementType=2)", async ({ request }) => {
      const response = await request.get(
        `${CONFIG.baseUrl}/CoreAPI/Odata/Agreement?$filter=Active eq true and Deleted eq false and AgreementType eq 2&$orderby=Description`,
        { headers: getHeaders() }
      );

      expect(response.status()).toBe(200);
      const data = await response.json();
      const agreements = Array.isArray(data) ? data : data.value || [];

      // Should have expected number of agreement types
      expect(agreements.length).toBeGreaterThanOrEqual(EXPECTED_COUNTS.MIN_AGREEMENT_TYPES);

      // Vacant Shift should exist with correct ID
      const vacantShift = agreements.find((a: any) => a.Id === AGREEMENT_TYPES.VACANT_SHIFT_ID);
      expect(vacantShift).toBeDefined();
      expect(vacantShift.Description).toContain("Vacant");
    });

    test("Location groups load correctly", async ({ request }) => {
      const response = await request.get(
        `${CONFIG.baseUrl}/CoreAPI/Odata/LocationGroup?$filter=Active eq true and Deleted eq false&$count=true`,
        { headers: getHeaders() }
      );

      expect(response.status()).toBe(200);
      const data = await response.json();
      const groups = Array.isArray(data) ? data : data.value || [];

      // Should have many location groups
      expect(groups.length).toBeGreaterThan(50);
    });

    test("Locations load correctly", async ({ request }) => {
      const response = await request.get(
        `${CONFIG.baseUrl}/CoreAPI/Odata/Location?$filter=Active eq true&$top=10`,
        { headers: getHeaders() }
      );

      expect(response.status()).toBe(200);
      const data = await response.json();
      const locations = Array.isArray(data) ? data : data.value || [];

      expect(locations.length).toBeGreaterThan(0);
      expect(locations[0]).toHaveProperty("Id");
      expect(locations[0]).toHaveProperty("Description");
    });

    test("Location group hierarchy (nested groups) exists", async ({ request }) => {
      const response = await request.get(
        `${CONFIG.baseUrl}/CoreAPI/Odata/LocationGroup2LocationGroup?$filter=Active eq true and Deleted eq false&$top=10`,
        { headers: getHeaders() }
      );

      expect(response.status()).toBe(200);
      const data = await response.json();
      const nested = Array.isArray(data) ? data : data.value || [];

      // Should have nested group relationships
      expect(nested.length).toBeGreaterThan(0);
      expect(nested[0]).toHaveProperty("PrimaryLocationGroupID");
      expect(nested[0]).toHaveProperty("SecondaryLocationGroupID");
    });

    test("Location group to location mapping exists", async ({ request }) => {
      const response = await request.get(
        `${CONFIG.baseUrl}/CoreAPI/Odata/LocationGroup2Location?$filter=Active eq true and Deleted eq false&$top=10`,
        { headers: getHeaders() }
      );

      expect(response.status()).toBe(200);
      const data = await response.json();
      const mappings = Array.isArray(data) ? data : data.value || [];

      expect(mappings.length).toBeGreaterThan(0);
      expect(mappings[0]).toHaveProperty("LocationGroupID");
      expect(mappings[0]).toHaveProperty("LocationID");
    });

  });

  test.describe("Report Query Patterns", () => {

    test("Shifts with activities query works", async ({ request }) => {
      const filter = encodeURIComponent(
        "Deleted eq false and ActivityTypeID ne null"
      );

      const response = await request.get(
        `${CONFIG.baseUrl}/CoreAPI/Odata/ScheduleShift?$filter=${filter}&$top=5`,
        { headers: getHeaders() }
      );

      expect(response.status()).toBe(200);
      const data = await response.json();
      const shifts = Array.isArray(data) ? data : data.value || [];

      expect(shifts.length).toBeGreaterThan(0);
      shifts.forEach((s: any) => {
        expect(s.ActivityTypeID).not.toBeNull();
      });
    });

    test("Shifts missing activities query works", async ({ request }) => {
      const filter = encodeURIComponent(
        "Deleted eq false and UserID ne null and ActivityTypeID eq null"
      );

      const response = await request.get(
        `${CONFIG.baseUrl}/CoreAPI/Odata/ScheduleShift?$filter=${filter}&$top=5`,
        { headers: getHeaders() }
      );

      expect(response.status()).toBe(200);
      const data = await response.json();
      const shifts = Array.isArray(data) ? data : data.value || [];

      // May or may not have results, but query should work
      shifts.forEach((s: any) => {
        expect(s.ActivityTypeID).toBeNull();
        expect(s.UserID).not.toBeNull();
      });
    });

    test("Schedule shift history query works", async ({ request }) => {
      const response = await request.get(
        `${CONFIG.baseUrl}/CoreAPI/Odata/ScheduleShiftHistory?$top=5&$orderby=Inserted desc`,
        { headers: getHeaders() }
      );

      expect(response.status()).toBe(200);
      const data = await response.json();
      const history = Array.isArray(data) ? data : data.value || [];

      expect(history.length).toBeGreaterThan(0);
      expect(history[0]).toHaveProperty("ScheduleShiftID");
      expect(history[0]).toHaveProperty("Inserted");
    });

  });

});
