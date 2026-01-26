/**
 * Report Settings Store
 *
 * Persists filter selections across sessions using Zustand + persist.
 * Settings are stored per-connection to support multiple environments.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

// ============================================================================
// Global Preferences Types (Apply to all reports)
// ============================================================================

export interface GlobalPreferences {
  /** Agreement type IDs to show in dropdowns (empty = show all) */
  visibleAgreementTypeIds: number[];
  /** Default date range for reports in days (e.g., 7, 14, 30, 90) */
  defaultDateRangeDays: number;
  /** Default location group IDs to pre-select */
  defaultLocationGroupIds: number[];
}

// ============================================================================
// Filter Settings Types
// ============================================================================

export interface DateRangeSettings {
  fromDate: string | null; // ISO date string
  toDate: string | null;
}

export interface LocationFilterSettings {
  locationGroupIds: number[];
  locationIds: number[];
}

export interface AgreementFilterSettings {
  agreementTypeIds: number[]; // Selected agreement type IDs
  excludedAgreementIds: number[]; // Agreement IDs to exclude (e.g., Vacant Shift)
  excludeVacantShifts: boolean;
}

// ============================================================================
// Per-Report Settings
// ============================================================================

export interface DeletedAgreementsSettings {
  dateRange: DateRangeSettings;
  location: LocationFilterSettings;
  agreements: AgreementFilterSettings;
  deletedByUserId: number | null;
}

export interface ActivitiesSettings {
  dateRange: DateRangeSettings;
  location: LocationFilterSettings;
}

export interface MissingActivitiesSettings {
  dateRange: DateRangeSettings;
  location: LocationFilterSettings;
}

export interface MissingJobRolesSettings {
  dateRange: DateRangeSettings;
  location: LocationFilterSettings;
}

export interface ChangeHistorySettings {
  dateRange: DateRangeSettings;
  location: LocationFilterSettings;
  changedByUserId: number | null;
  showDiff: boolean;
}

export interface OrphanedShiftsSettings {
  dateRange: DateRangeSettings;
  location: LocationFilterSettings;
}

// ============================================================================
// Store State
// ============================================================================

interface ReportSettingsState {
  // Settings per connection (keyed by connection name)
  settingsByConnection: Record<string, ConnectionReportSettings>;

  // Actions
  getSettings: (connectionName: string) => ConnectionReportSettings;
  updateDeletedAgreementsSettings: (
    connectionName: string,
    settings: Partial<DeletedAgreementsSettings>
  ) => void;
  updateActivitiesSettings: (
    connectionName: string,
    settings: Partial<ActivitiesSettings>
  ) => void;
  updateMissingActivitiesSettings: (
    connectionName: string,
    settings: Partial<MissingActivitiesSettings>
  ) => void;
  updateMissingJobRolesSettings: (
    connectionName: string,
    settings: Partial<MissingJobRolesSettings>
  ) => void;
  updateChangeHistorySettings: (
    connectionName: string,
    settings: Partial<ChangeHistorySettings>
  ) => void;
  updateOrphanedShiftsSettings: (
    connectionName: string,
    settings: Partial<OrphanedShiftsSettings>
  ) => void;
  updateGlobalPreferences: (
    connectionName: string,
    preferences: Partial<GlobalPreferences>
  ) => void;
  getGlobalPreferences: (connectionName: string) => GlobalPreferences;
  clearSettings: (connectionName: string) => void;
}

interface ConnectionReportSettings {
  globalPreferences: GlobalPreferences;
  deletedAgreements: DeletedAgreementsSettings;
  activities: ActivitiesSettings;
  missingActivities: MissingActivitiesSettings;
  missingJobRoles: MissingJobRolesSettings;
  changeHistory: ChangeHistorySettings;
  orphanedShifts: OrphanedShiftsSettings;
}

// ============================================================================
// Default Settings
// ============================================================================

function getDefaultDateRange(): DateRangeSettings {
  // Default to last 30 days
  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);

  return {
    fromDate: thirtyDaysAgo.toISOString().split("T")[0],
    toDate: today.toISOString().split("T")[0],
  };
}

function getDefaultLocationSettings(): LocationFilterSettings {
  return {
    locationGroupIds: [],
    locationIds: [],
  };
}

function getDefaultAgreementSettings(): AgreementFilterSettings {
  return {
    agreementTypeIds: [],
    excludedAgreementIds: [],
    excludeVacantShifts: false,
  };
}

function getDefaultGlobalPreferences(): GlobalPreferences {
  return {
    visibleAgreementTypeIds: [], // Empty = show all
    defaultDateRangeDays: 30,
    defaultLocationGroupIds: [],
  };
}

function getDefaultConnectionSettings(): ConnectionReportSettings {
  const dateRange = getDefaultDateRange();
  const location = getDefaultLocationSettings();

  return {
    globalPreferences: getDefaultGlobalPreferences(),
    deletedAgreements: {
      dateRange,
      location,
      agreements: getDefaultAgreementSettings(),
      deletedByUserId: null,
    },
    activities: {
      dateRange,
      location,
    },
    missingActivities: {
      dateRange,
      location,
    },
    missingJobRoles: {
      dateRange,
      location,
    },
    changeHistory: {
      dateRange,
      location,
      changedByUserId: null,
      showDiff: true,
    },
    orphanedShifts: {
      dateRange,
      location,
    },
  };
}

// ============================================================================
// Stable Default References (MUST be defined before store to prevent infinite loops)
// ============================================================================

// These are created once at module load time and reused by selectors
// to prevent "getSnapshot should be cached" errors
const DEFAULT_SETTINGS = getDefaultConnectionSettings();
const DEFAULT_GLOBAL_PREFS = getDefaultGlobalPreferences();

// ============================================================================
// Store Implementation
// ============================================================================

export const useReportSettingsStore = create<ReportSettingsState>()(
  persist(
    (set, get) => ({
      settingsByConnection: {},

      getSettings: (connectionName) => {
        const state = get();
        // Use stable default reference to prevent infinite loops
        return (
          state.settingsByConnection[connectionName] ||
          DEFAULT_SETTINGS
        );
      },

      getGlobalPreferences: (connectionName) => {
        const state = get();
        const settings = state.settingsByConnection[connectionName];
        // Use stable default reference to prevent infinite loops
        return settings?.globalPreferences || DEFAULT_GLOBAL_PREFS;
      },

      updateGlobalPreferences: (connectionName, preferences) => {
        set((state) => {
          const current = state.settingsByConnection[connectionName] ||
            getDefaultConnectionSettings();
          return {
            settingsByConnection: {
              ...state.settingsByConnection,
              [connectionName]: {
                ...current,
                globalPreferences: {
                  ...current.globalPreferences,
                  ...preferences,
                },
              },
            },
          };
        });
      },

      updateDeletedAgreementsSettings: (connectionName, settings) => {
        set((state) => {
          const current = state.settingsByConnection[connectionName] ||
            getDefaultConnectionSettings();
          return {
            settingsByConnection: {
              ...state.settingsByConnection,
              [connectionName]: {
                ...current,
                deletedAgreements: {
                  ...current.deletedAgreements,
                  ...settings,
                  // Deep merge for nested objects
                  ...(settings.dateRange && {
                    dateRange: {
                      ...current.deletedAgreements.dateRange,
                      ...settings.dateRange,
                    },
                  }),
                  ...(settings.location && {
                    location: {
                      ...current.deletedAgreements.location,
                      ...settings.location,
                    },
                  }),
                  ...(settings.agreements && {
                    agreements: {
                      ...current.deletedAgreements.agreements,
                      ...settings.agreements,
                    },
                  }),
                },
              },
            },
          };
        });
      },

      updateActivitiesSettings: (connectionName, settings) => {
        set((state) => {
          const current = state.settingsByConnection[connectionName] ||
            getDefaultConnectionSettings();
          return {
            settingsByConnection: {
              ...state.settingsByConnection,
              [connectionName]: {
                ...current,
                activities: {
                  ...current.activities,
                  ...settings,
                  ...(settings.dateRange && {
                    dateRange: {
                      ...current.activities.dateRange,
                      ...settings.dateRange,
                    },
                  }),
                  ...(settings.location && {
                    location: {
                      ...current.activities.location,
                      ...settings.location,
                    },
                  }),
                },
              },
            },
          };
        });
      },

      updateMissingActivitiesSettings: (connectionName, settings) => {
        set((state) => {
          const current = state.settingsByConnection[connectionName] ||
            getDefaultConnectionSettings();
          return {
            settingsByConnection: {
              ...state.settingsByConnection,
              [connectionName]: {
                ...current,
                missingActivities: {
                  ...current.missingActivities,
                  ...settings,
                  ...(settings.dateRange && {
                    dateRange: {
                      ...current.missingActivities.dateRange,
                      ...settings.dateRange,
                    },
                  }),
                  ...(settings.location && {
                    location: {
                      ...current.missingActivities.location,
                      ...settings.location,
                    },
                  }),
                },
              },
            },
          };
        });
      },

      updateMissingJobRolesSettings: (connectionName, settings) => {
        set((state) => {
          const current = state.settingsByConnection[connectionName] ||
            getDefaultConnectionSettings();
          return {
            settingsByConnection: {
              ...state.settingsByConnection,
              [connectionName]: {
                ...current,
                missingJobRoles: {
                  ...current.missingJobRoles,
                  ...settings,
                  ...(settings.dateRange && {
                    dateRange: {
                      ...current.missingJobRoles.dateRange,
                      ...settings.dateRange,
                    },
                  }),
                  ...(settings.location && {
                    location: {
                      ...current.missingJobRoles.location,
                      ...settings.location,
                    },
                  }),
                },
              },
            },
          };
        });
      },

      updateChangeHistorySettings: (connectionName, settings) => {
        set((state) => {
          const current = state.settingsByConnection[connectionName] ||
            getDefaultConnectionSettings();
          return {
            settingsByConnection: {
              ...state.settingsByConnection,
              [connectionName]: {
                ...current,
                changeHistory: {
                  ...current.changeHistory,
                  ...settings,
                  ...(settings.dateRange && {
                    dateRange: {
                      ...current.changeHistory.dateRange,
                      ...settings.dateRange,
                    },
                  }),
                  ...(settings.location && {
                    location: {
                      ...current.changeHistory.location,
                      ...settings.location,
                    },
                  }),
                },
              },
            },
          };
        });
      },

      updateOrphanedShiftsSettings: (connectionName, settings) => {
        set((state) => {
          const current = state.settingsByConnection[connectionName] ||
            getDefaultConnectionSettings();
          return {
            settingsByConnection: {
              ...state.settingsByConnection,
              [connectionName]: {
                ...current,
                orphanedShifts: {
                  ...current.orphanedShifts,
                  ...settings,
                  ...(settings.dateRange && {
                    dateRange: {
                      ...current.orphanedShifts.dateRange,
                      ...settings.dateRange,
                    },
                  }),
                  ...(settings.location && {
                    location: {
                      ...current.orphanedShifts.location,
                      ...settings.location,
                    },
                  }),
                },
              },
            },
          };
        });
      },

      clearSettings: (connectionName) => {
        set((state) => {
          const { [connectionName]: _, ...rest } = state.settingsByConnection;
          return { settingsByConnection: rest };
        });
      },
    }),
    {
      name: "monash-nimbus-report-settings",
      version: 1,
    }
  )
);

// ============================================================================
// Selector Hooks (for convenience)
// ============================================================================

export function useDeletedAgreementsSettings(connectionName: string | null) {
  return useReportSettingsStore((state) =>
    connectionName
      ? state.getSettings(connectionName).deletedAgreements
      : DEFAULT_SETTINGS.deletedAgreements
  );
}

export function useActivitiesSettings(connectionName: string | null) {
  return useReportSettingsStore((state) =>
    connectionName
      ? state.getSettings(connectionName).activities
      : DEFAULT_SETTINGS.activities
  );
}

export function useMissingActivitiesSettings(connectionName: string | null) {
  return useReportSettingsStore((state) =>
    connectionName
      ? state.getSettings(connectionName).missingActivities
      : DEFAULT_SETTINGS.missingActivities
  );
}

export function useMissingJobRolesSettings(connectionName: string | null) {
  return useReportSettingsStore((state) =>
    connectionName
      ? state.getSettings(connectionName).missingJobRoles
      : DEFAULT_SETTINGS.missingJobRoles
  );
}

export function useChangeHistorySettings(connectionName: string | null) {
  return useReportSettingsStore((state) =>
    connectionName
      ? state.getSettings(connectionName).changeHistory
      : DEFAULT_SETTINGS.changeHistory
  );
}

export function useOrphanedShiftsSettings(connectionName: string | null) {
  return useReportSettingsStore((state) =>
    connectionName
      ? state.getSettings(connectionName).orphanedShifts
      : DEFAULT_SETTINGS.orphanedShifts
  );
}

export function useGlobalPreferences(connectionName: string | null) {
  return useReportSettingsStore((state) =>
    connectionName
      ? state.getGlobalPreferences(connectionName)
      : DEFAULT_GLOBAL_PREFS
  );
}
