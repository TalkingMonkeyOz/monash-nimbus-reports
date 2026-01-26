/**
 * Baseline Test Data Constants
 *
 * Discovered from test-monash database on 2026-01-26.
 * Used for assertions in quick and regression tests.
 */

export const CONFIG = {
  baseUrl: process.env.NIMBUS_BASE_URL || "https://test-monash.nimbus.cloud",
  userId: process.env.NIMBUS_USER_ID || "20",
  authToken: process.env.NIMBUS_AUTH_TOKEN || "9b8b5ee7-71ac-4f03-9364-04d9c61a5d2e",
};

export function getHeaders() {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    UserID: CONFIG.userId,
    Authorization: `Bearer ${CONFIG.authToken}`,
    AuthenticationToken: CONFIG.authToken,
  };
}

// ============================================================================
// Agreement Types (AgreementType eq 2 - Shift/Person agreements)
// ============================================================================

export const AGREEMENT_TYPES = {
  /** Vacant Shift - commonly excluded from reports */
  VACANT_SHIFT_ID: 1,

  /** All agreement type IDs (21 total) */
  ALL_IDS: [1, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 19, 20, 21, 22, 23, 24],

  /** Agreement details for verification */
  KNOWN_AGREEMENTS: [
    { id: 1, description: "Vacant Shift" },
    { id: 3, description: "Repeat" },
    { id: 4, description: "Ignore Repeat" },
    { id: 5, description: "Ignore Part Number" },
    { id: 6, description: "Asynchronous Shift" },
    { id: 8, description: "Clinical Multi.Inst." },
    { id: 9, description: "Rural Clinical" },
    { id: 10, description: "Complex" },
    { id: 11, description: "Specialised" },
    { id: 12, description: "Law Specialised" },
    { id: 13, description: "Developed" },
    { id: 14, description: "MADA" },
    { id: 15, description: "SPAHC Practical" },
    { id: 16, description: "Lead" },
    { id: 17, description: "Support" },
    { id: 19, description: "Studio" },
    { id: 20, description: "Online" },
    { id: 21, description: "Onsite" },
    { id: 22, description: "Metro Clinical" },
    { id: 23, description: "CNE" },
    { id: 24, description: "L/P" },
  ],
};

// ============================================================================
// Location Groups with Hierarchy
// ============================================================================

export const LOCATION_GROUPS = {
  /** Parent group with nested children (for hierarchy testing) */
  NESTED_PARENT: {
    id: 1086,
    childIds: [1087, 1088, 1089, 1090, 1100],
  },

  /** Sample group IDs from discovery */
  SAMPLE_IDS: [1442, 1290, 1297, 976, 959, 1298, 872, 964, 1235, 1164],

  /** Expected minimum number of location groups */
  MIN_COUNT: 700, // Discovery showed 719
};

// ============================================================================
// Shifts with Activities (for Activities Report)
// ============================================================================

export const SHIFTS_WITH_ACTIVITIES = {
  /** Known shift IDs with activities */
  SHIFT_IDS: [99145, 99146, 99147, 99148, 99149],

  /** Activity type IDs found */
  ACTIVITY_TYPE_IDS: [139, 143],
};

// ============================================================================
// Shifts Missing Activities (for Missing Activities Report)
// ============================================================================

export const SHIFTS_MISSING_ACTIVITIES = {
  /** Known shift IDs missing activities but with users */
  SHIFT_IDS: [200042, 200043, 200046, 201349, 201356],

  /** User IDs assigned to these shifts */
  USER_IDS: [11110, 8076, 6484, 12602],
};

// ============================================================================
// Change History Records
// ============================================================================

export const CHANGE_HISTORY = {
  /** Known history record IDs */
  HISTORY_IDS: [10761, 10760, 10759, 10758, 10757],

  /** Shift that has history */
  SHIFT_WITH_HISTORY: 201923,

  /** Users who made changes */
  CHANGER_USER_IDS: [19, 21612, 21582],
};

// ============================================================================
// Date Ranges for Testing
// ============================================================================

export const DATE_RANGES = {
  /** Get date N days ago in ISO format */
  daysAgo: (days: number): string => {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString().split('T')[0];
  },

  /** Get today in ISO format */
  today: (): string => new Date().toISOString().split('T')[0],

  /** Standard test range (last 30 days) */
  LAST_30_DAYS: () => ({
    from: DATE_RANGES.daysAgo(30),
    to: DATE_RANGES.today(),
  }),

  /** Extended test range (last 90 days) */
  LAST_90_DAYS: () => ({
    from: DATE_RANGES.daysAgo(90),
    to: DATE_RANGES.today(),
  }),
};

// ============================================================================
// Expected Counts (for regression verification)
// ============================================================================

export const EXPECTED_COUNTS = {
  /** Minimum number of agreement types */
  MIN_AGREEMENT_TYPES: 20,

  /** Minimum number of location groups */
  MIN_LOCATION_GROUPS: 700,

  /** Minimum number of users */
  MIN_USERS: 20000,

  /** Minimum number of locations */
  MIN_LOCATIONS: 100,
};
