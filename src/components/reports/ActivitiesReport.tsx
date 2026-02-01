import { useState, useCallback, useEffect, useMemo } from "react";
import { Paper, Typography, Alert, Chip, IconButton, Tooltip, Box, FormControlLabel, Switch } from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import { DataGrid, GridColDef, GridRenderCellParams } from "@mui/x-data-grid";
import dayjs, { Dayjs } from "dayjs";
import ReportFilters from "./ReportFilters";
import { dataGridStyles } from "./dataGridStyles";
import CascadingLocationFilter from "../filters/CascadingLocationFilter";
import { useConnectionStore } from "../../stores/connectionStore";
import { exportToExcel } from "../../core/export";
import { openNimbusSchedule } from "../../core/nimbusLinks";
import { fetchActiveShiftsWithActivities } from "../../hooks/useScheduleShifts";
import {
  loadAllLookups,
  loadLocations,
  getUsername,
  getDepartment,
  getScheduleDateRange,
  getLocationViaSchedule,
  getLocationIdViaSchedule,
  getActivityTypeDescription,
  isActivityTypeTT,
  getUserDisplayName,
} from "../../core/lookupService";
import { fetchShiftHistory, analyzeActivityChange } from "../../core/historyService";
import {
  loadLocationGroupHierarchy,
  resolveLocationsForGroup,
} from "../../core/locationGroupService";

interface ActivityChange {
  id: number;
  shiftDescription: string;
  shiftDate: string;
  shiftFrom: string;
  shiftTo: string;
  location: string;
  locationId: number | null;
  department: string;
  scheduleId: number | null;
  scheduleDateRange: string;
  assignedUser: string;
  activityDescription: string;
  syllabusPlus: string;
  isTTActivity: boolean;
  unitCode: string;
  flagged: boolean;
  // Change tracking
  changedBy: string;
  changedDate: string;
  previousActivity: string;
}

// Base columns for export (no action buttons or renderCell) - date first for easier scanning
const baseColumns: GridColDef<ActivityChange>[] = [
  { field: "shiftDate", headerName: "Date", width: 110 },
  { field: "shiftFrom", headerName: "From", width: 80 },
  { field: "shiftTo", headerName: "To", width: 80 },
  { field: "shiftDescription", headerName: "Shift Description", flex: 1, minWidth: 150 },
  { field: "assignedUser", headerName: "Assigned To", width: 180 },
  { field: "activityDescription", headerName: "Current Activity", width: 130 },
  { field: "previousActivity", headerName: "Previous Activity", width: 130 },
  { field: "changedBy", headerName: "Changed By", width: 180 },
  { field: "changedDate", headerName: "Changed Date", width: 140 },
  { field: "syllabusPlus", headerName: "Syllabus Plus", width: 140 },
  { field: "unitCode", headerName: "Unit Code", width: 100 },
  { field: "location", headerName: "Location", width: 140 },
  { field: "department", headerName: "Department", width: 140 },
  { field: "scheduleId", headerName: "Schedule ID", width: 90 },
  { field: "scheduleDateRange", headerName: "Schedule Period", width: 140 },
  { field: "isTTActivity", headerName: "TT Activity", width: 90 },
  { field: "flagged", headerName: "Flagged", width: 80 },
];

export default function ActivitiesReport() {
  // Default to last 30 days
  const [fromDate, setFromDate] = useState<Dayjs | null>(dayjs().subtract(30, "day"));
  const [toDate, setToDate] = useState<Dayjs | null>(dayjs());
  const [data, setData] = useState<ActivityChange[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [selectedGroupId, setSelectedGroupId] = useState<number | "">("");
  const [selectedLocationId, setSelectedLocationId] = useState<number | "">("");
  const [dataVersion, setDataVersion] = useState(0);
  // Status filter: true = show only flagged, false = show all
  const [flaggedOnly, setFlaggedOnly] = useState(true);

  const { session } = useConnectionStore();

  // Build columns with action column
  const columns: GridColDef<ActivityChange>[] = useMemo(() => [
    {
      field: "actions",
      headerName: "",
      width: 50,
      sortable: false,
      filterable: false,
      disableColumnMenu: true,
      renderCell: (params: GridRenderCellParams<ActivityChange>) => (
        params.row.scheduleId ? (
          <Tooltip title="Open in Nimbus">
            <IconButton
              size="small"
              onClick={() => session && openNimbusSchedule(session.base_url, params.row.scheduleId)}
            >
              <OpenInNewIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        ) : null
      ),
    },
    {
      field: "flagged",
      headerName: "Status",
      width: 80,
      renderCell: (params: GridRenderCellParams<ActivityChange>) =>
        params.value ? (
          <Chip label="FLAG" color="error" size="small" />
        ) : (
          <Chip label="OK" color="success" size="small" variant="outlined" />
        ),
    },
    ...baseColumns.slice(0, 15), // All columns up to isTTActivity
    {
      field: "isTTActivity",
      headerName: "TT Activity",
      width: 90,
      renderCell: (params: GridRenderCellParams<ActivityChange>) => (
        <Chip
          label={params.value ? "Yes" : "No"}
          color={params.value ? "success" : "warning"}
          size="small"
          variant="outlined"
        />
      ),
    },
  ], [session]);

  // Load locations and location groups for filter dropdowns
  useEffect(() => {
    if (session) {
      const sessionData = {
        base_url: session.base_url,
        auth_mode: session.auth_mode,
        user_id: session.user_id,
        auth_token: session.auth_token,
        app_token: session.app_token,
        username: session.username,
      };

      // Load both locations and location groups in parallel
      Promise.all([
        loadLocations(sessionData),
        loadLocationGroupHierarchy(sessionData),
      ]).then(() => {
        // Increment dataVersion to trigger filter re-render with loaded data
        setDataVersion((v) => v + 1);
      });
    }
  }, [session]);

  const handleSearch = useCallback(async () => {
    if (!session) {
      setError("Not connected. Please connect first.");
      return;
    }

    setLoading(true);
    setError(null);
    setStatus("Starting search...");

    try {
      const sessionData = {
        base_url: session.base_url,
        auth_mode: session.auth_mode,
        user_id: session.user_id,
        auth_token: session.auth_token,
        app_token: session.app_token,
        username: session.username,
      };

      // Fetch timetabled shifts (have SyllabusPlus) - server-side filtered
      // NOTE: Location filtering is CLIENT-SIDE because Nimbus OData has broken
      // Schedule navigation - Schedule/LocationID filter returns 0 results
      const activeShifts = await fetchActiveShiftsWithActivities({
        session: sessionData,
        fromDate,
        toDate,
        onProgress: setStatus,
      });

      console.log(`Server returned ${activeShifts.length} timetabled shifts`);

      // Collect unique IDs for batch lookups
      const scheduleIds = [...new Set(activeShifts.map(s => s.ScheduleID).filter((id): id is number => id != null && id > 0))];
      const shiftIds = [...new Set(activeShifts.map(s => s.Id).filter((id): id is number => id != null && id > 0))];

      // Load lookup data (users, locations, departments, schedules)
      // This loads Schedule records separately - required for client-side location filtering
      await loadAllLookups(sessionData, scheduleIds, setStatus);

      // Fetch history from ScheduleShiftHistory (correct entity for activity changes)
      const shiftHistoryMap = await fetchShiftHistory(sessionData, shiftIds, setStatus);

      // Transform and flag non-TT activities
      // Business rule: Flag shifts that have SyllabusPlus (from timetable) but use non-TT activity or no activity
      const transformed: ActivityChange[] = activeShifts.map((item, index) => {
        const syllabusPlus = item.adhoc_SyllabusPlus || "";
        const activityDescription = getActivityTypeDescription(item.ActivityTypeID);
        const isTT = isActivityTypeTT(item.ActivityTypeID);

        // Flag: Has SyllabusPlus (timetabled shift) BUT activity is NOT a TT: prefixed activity
        // This indicates someone may have changed/removed a timetabled activity
        const shouldFlag = !!syllabusPlus && !isTT;

        // Get change history for this shift (from ScheduleShiftHistory - correct entity)
        const historyRecords = shiftHistoryMap.get(item.Id);
        const changeInfo = analyzeActivityChange(historyRecords, item.ActivityTypeID ?? null);

        return {
          id: item.Id || index,
          shiftDescription: item.Description || "",
          shiftDate: item.StartTime ? dayjs(item.StartTime).format("DD/MM/YYYY") : "",
          shiftFrom: item.StartTime ? dayjs(item.StartTime).format("HH:mm") : "",
          shiftTo: item.FinishTime ? dayjs(item.FinishTime).format("HH:mm") : "",
          location: getLocationViaSchedule(item.ScheduleID),
          locationId: getLocationIdViaSchedule(item.ScheduleID),
          department: getDepartment(item.DepartmentID),
          scheduleId: item.ScheduleID || null,
          scheduleDateRange: getScheduleDateRange(item.ScheduleID),
          assignedUser: getUsername(item.UserID),
          activityDescription: activityDescription,
          syllabusPlus: syllabusPlus,
          isTTActivity: isTT,
          unitCode: item.adhoc_UnitCode || "",
          flagged: shouldFlag,
          // Change tracking - from ScheduleShiftHistory (correct entity)
          changedBy: changeInfo.changedBy ? getUserDisplayName(changeInfo.changedBy) : "",
          changedDate: changeInfo.changedDate ? dayjs(changeInfo.changedDate).format("DD/MM/YYYY HH:mm") : "",
          previousActivity: changeInfo.previousActivityTypeId !== null
            ? getActivityTypeDescription(changeInfo.previousActivityTypeId)
            : "",
        };
      });

      // Sort flagged items first
      transformed.sort((a, b) => (b.flagged ? 1 : 0) - (a.flagged ? 1 : 0));

      // CLIENT-SIDE location filtering (required due to Nimbus OData Schedule navigation bug)
      // We load Schedules separately via loadAllLookups() which stores LocationID in cache
      let filtered = transformed;

      if (selectedGroupId) {
        // Get all location IDs in the selected group (including nested groups)
        const groupLocationIds = resolveLocationsForGroup(selectedGroupId);
        filtered = filtered.filter(
          (item) => item.locationId !== null && groupLocationIds.has(item.locationId)
        );
      }

      if (selectedLocationId) {
        // Further filter to specific location
        filtered = filtered.filter((item) => item.locationId === selectedLocationId);
      }

      setData(filtered);
      const filterDesc = selectedGroupId || selectedLocationId ? " (filtered by location)" : "";
      setStatus(`Found ${filtered.length} shifts (${filtered.filter(t => t.flagged).length} flagged)${filterDesc}`);
    } catch (err) {
      console.error("Search failed:", err);
      const message = err instanceof Error ? err.message : String(err);
      setError(message || "Failed to load report data");
    } finally {
      setLoading(false);
    }
  }, [session, fromDate, toDate, selectedGroupId, selectedLocationId]);

  const flaggedCount = data.filter((d) => d.flagged).length;

  // Apply flagged-only filter to displayed data
  const displayedData = useMemo(() => {
    if (flaggedOnly) {
      return data.filter((d) => d.flagged);
    }
    return data;
  }, [data, flaggedOnly]);

  const handleExport = useCallback(async () => {
    if (displayedData.length === 0) return;
    setStatus("Exporting to Excel...");
    const filename = flaggedOnly ? "Activities_Report_Flagged" : "Activities_Report";
    const result = await exportToExcel(displayedData, filename, baseColumns);
    if (result.success) {
      setStatus(result.message);
    } else {
      setError(result.message);
    }
  }, [displayedData, flaggedOnly]);

  return (
    <Paper sx={{ p: 1.5, height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
        <Typography variant="h6">
          Activities Report (TT Changes)
        </Typography>
        <Tooltip
          title={
            <>
              <strong>Problem it solves:</strong> "Has someone incorrectly changed a timetabled activity to a non-timetable activity?"
              <br /><br />
              Catches TT→non-TT changes that could affect payroll coding. Rows flagged in red need review.
              <br /><br />
              <strong>Tip:</strong> Click the arrow icon on any row to open that schedule in Nimbus.
            </>
          }
          arrow
        >
          <HelpOutlineIcon fontSize="small" color="action" sx={{ cursor: "help" }} />
        </Tooltip>
        {flaggedCount > 0 && (
          <Chip label={`${flaggedCount} flagged`} color="error" size="small" />
        )}
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {status || "Flag inappropriate activity code changes from timetable (TT) to non-timetable activities."}
      </Typography>

      <ReportFilters
        fromDate={fromDate}
        toDate={toDate}
        onFromDateChange={setFromDate}
        onToDateChange={setToDate}
        onSearch={handleSearch}
        onExport={handleExport}
        loading={loading}
      >
        <CascadingLocationFilter
          selectedGroupId={selectedGroupId}
          selectedLocationId={selectedLocationId}
          onGroupChange={setSelectedGroupId}
          onLocationChange={setSelectedLocationId}
          dataVersion={dataVersion}
        />
        <FormControlLabel
          control={
            <Switch
              checked={flaggedOnly}
              onChange={(e) => setFlaggedOnly(e.target.checked)}
              size="small"
            />
          }
          label="Flagged only"
          sx={{ ml: 1 }}
        />
      </ReportFilters>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <DataGrid
        rows={displayedData}
        columns={columns}
        loading={loading}
        pageSizeOptions={[25, 50, 100]}
        initialState={{
          pagination: { paginationModel: { pageSize: 50 } },
        }}
        disableRowSelectionOnClick
        getRowClassName={(params) => (params.row.flagged ? "flagged-row" : "")}
        sx={dataGridStyles}
      />
    </Paper>
  );
}
