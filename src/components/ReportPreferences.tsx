/**
 * ReportPreferences - Global settings for report filters
 *
 * Allows users to configure:
 * - Which agreement types to show in dropdowns (from all available)
 * - Default date range for reports
 * - Default location groups
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Paper,
  Typography,
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  ListItemText,
  Button,
  Alert,
  Divider,
  Chip,
  Stack,
  CircularProgress,
  SelectChangeEvent,
} from "@mui/material";
import SaveIcon from "@mui/icons-material/Save";
import RefreshIcon from "@mui/icons-material/Refresh";
import { useConnectionStore } from "../stores/connectionStore";
import {
  useGlobalPreferences,
  useReportSettingsStore,
} from "../stores/reportSettingsStore";
import {
  loadAgreementTypes,
  getAllAgreementTypes,
} from "../core/lookupService";

const DATE_RANGE_OPTIONS = [
  { value: 7, label: "Last 7 days" },
  { value: 14, label: "Last 14 days" },
  { value: 30, label: "Last 30 days" },
  { value: 60, label: "Last 60 days" },
  { value: 90, label: "Last 90 days" },
];

export default function ReportPreferences() {
  const { session, activeConnectionName: connectionName } = useConnectionStore();
  const savedPreferences = useGlobalPreferences(connectionName);
  const updatePreferences = useReportSettingsStore((s) => s.updateGlobalPreferences);

  // Local state for editing
  const [visibleAgreementTypeIds, setVisibleAgreementTypeIds] = useState<number[]>(
    savedPreferences.visibleAgreementTypeIds
  );
  const [defaultDateRangeDays, setDefaultDateRangeDays] = useState<number>(
    savedPreferences.defaultDateRangeDays
  );

  // Loading state
  const [loading, setLoading] = useState(false);
  const [agreementTypesLoaded, setAgreementTypesLoaded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load agreement types on mount
  useEffect(() => {
    if (session && !agreementTypesLoaded) {
      setLoading(true);
      const sessionData = {
        base_url: session.base_url,
        user_id: session.user_id,
        auth_token: session.auth_token,
      };
      loadAgreementTypes(sessionData)
        .then(() => {
          setAgreementTypesLoaded(true);
          setLoading(false);
        })
        .catch((err) => {
          console.error("Failed to load agreement types:", err);
          setError("Failed to load agreement types");
          setLoading(false);
        });
    }
  }, [session, agreementTypesLoaded]);

  // Get all agreement types
  const allAgreementTypes = useMemo(
    () => getAllAgreementTypes(),
    [agreementTypesLoaded]
  );

  // Handle agreement type selection change
  const handleAgreementTypesChange = useCallback(
    (event: SelectChangeEvent<number[]>) => {
      const value = event.target.value;
      setVisibleAgreementTypeIds(
        typeof value === "string" ? value.split(",").map(Number) : value
      );
      setSaved(false);
    },
    []
  );

  // Handle date range change
  const handleDateRangeChange = useCallback(
    (event: SelectChangeEvent<number>) => {
      setDefaultDateRangeDays(event.target.value as number);
      setSaved(false);
    },
    []
  );

  // Select all agreement types
  const handleSelectAll = useCallback(() => {
    setVisibleAgreementTypeIds(allAgreementTypes.map((a) => a.id));
    setSaved(false);
  }, [allAgreementTypes]);

  // Clear all agreement types
  const handleClearAll = useCallback(() => {
    setVisibleAgreementTypeIds([]);
    setSaved(false);
  }, []);

  // Save preferences
  const handleSave = useCallback(() => {
    if (!connectionName) return;

    updatePreferences(connectionName, {
      visibleAgreementTypeIds,
      defaultDateRangeDays,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }, [connectionName, visibleAgreementTypeIds, defaultDateRangeDays, updatePreferences]);

  // Get names of selected agreement types for display
  const selectedAgreementNames = useMemo(() => {
    return visibleAgreementTypeIds
      .map((id) => allAgreementTypes.find((a) => a.id === id)?.description)
      .filter(Boolean) as string[];
  }, [visibleAgreementTypeIds, allAgreementTypes]);

  if (!session) {
    return (
      <Paper sx={{ p: 3 }}>
        <Alert severity="info">Connect to a Nimbus server to configure preferences.</Alert>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 3, maxWidth: 800 }}>
      <Typography variant="h6" gutterBottom>
        Report Preferences
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Configure default settings for all reports. These preferences are saved per connection.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {saved && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Preferences saved successfully!
        </Alert>
      )}

      <Divider sx={{ mb: 3 }} />

      {/* Default Date Range */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="subtitle1" gutterBottom>
          Default Date Range
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Set the default date range when opening reports.
        </Typography>
        <FormControl sx={{ minWidth: 200 }}>
          <InputLabel>Date Range</InputLabel>
          <Select
            value={defaultDateRangeDays}
            onChange={handleDateRangeChange}
            label="Date Range"
          >
            {DATE_RANGE_OPTIONS.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      <Divider sx={{ mb: 3 }} />

      {/* Agreement Types Filter */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="subtitle1" gutterBottom>
          Visible Agreement Types
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Select which agreement types to show in report dropdowns. Leave empty to show all.
        </Typography>

        {loading ? (
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <CircularProgress size={20} />
            <Typography variant="body2">Loading agreement types...</Typography>
          </Box>
        ) : (
          <>
            <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
              <Button
                size="small"
                variant="outlined"
                onClick={handleSelectAll}
                disabled={allAgreementTypes.length === 0}
              >
                Select All ({allAgreementTypes.length})
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={handleClearAll}
                disabled={visibleAgreementTypeIds.length === 0}
              >
                Clear All
              </Button>
              <Button
                size="small"
                variant="outlined"
                startIcon={<RefreshIcon />}
                onClick={() => {
                  setAgreementTypesLoaded(false);
                }}
              >
                Reload
              </Button>
            </Stack>

            <FormControl fullWidth>
              <InputLabel>Agreement Types</InputLabel>
              <Select
                multiple
                value={visibleAgreementTypeIds}
                onChange={handleAgreementTypesChange}
                label="Agreement Types"
                renderValue={() => (
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                    {visibleAgreementTypeIds.length === 0 ? (
                      <Typography variant="body2" color="text.secondary">
                        All types shown
                      </Typography>
                    ) : (
                      <>
                        {selectedAgreementNames.slice(0, 3).map((name) => (
                          <Chip key={name} label={name} size="small" />
                        ))}
                        {selectedAgreementNames.length > 3 && (
                          <Chip
                            label={`+${selectedAgreementNames.length - 3} more`}
                            size="small"
                            variant="outlined"
                          />
                        )}
                      </>
                    )}
                  </Box>
                )}
                MenuProps={{
                  PaperProps: {
                    style: { maxHeight: 400 },
                  },
                }}
              >
                {allAgreementTypes.map((agreement) => (
                  <MenuItem key={agreement.id} value={agreement.id}>
                    <Checkbox
                      checked={visibleAgreementTypeIds.includes(agreement.id)}
                    />
                    <ListItemText primary={agreement.description} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {visibleAgreementTypeIds.length > 0 && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
                {visibleAgreementTypeIds.length} of {allAgreementTypes.length} agreement types selected
              </Typography>
            )}
          </>
        )}
      </Box>

      <Divider sx={{ mb: 3 }} />

      {/* Save Button */}
      <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
        <Button
          variant="contained"
          startIcon={<SaveIcon />}
          onClick={handleSave}
          disabled={!connectionName}
        >
          Save Preferences
        </Button>
      </Box>
    </Paper>
  );
}
