import { useState, useCallback, useEffect, useMemo } from "react";
import { Paper, Typography, Alert, Chip, IconButton, Tooltip, Box } from "@mui/material";
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
import { fetchShiftsMissingActivity } from "../../hooks/useScheduleShifts";
import {
  loadAllLookups,
  loadLocations,
  getUsername,
  getDepartment,
  getScheduleDateRange,
  getLocation,
} from "../../core/lookupService";
import {
  loadLocationGroupHierarchy,
  resolveLocationsForGroup,
} from "../../core/locationGroupService";

interface MissingActivity {
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
  assignedPerson: string;
  unitCode: string;
  activityStatus: string;
}

// Base columns for export - date first for easier scanning
const baseColumns: GridColDef<MissingActivity>[] = [
  { field: "shiftDate", headerName: "Date", width: 110 },
  { field: "shiftFrom", headerName: "From", width: 80 },
  { field: "shiftTo", headerName: "To", width: 80 },
  { field: "shiftDescription", headerName: "Shift Description", flex: 1, minWidth: 150 },
  { field: "assignedPerson", headerName: "Assigned Person", width: 180 },
  { field: "unitCode", headerName: "Unit Code", width: 100 },
  { field: "location", headerName: "Location", width: 140 },
  { field: "department", headerName: "Department", width: 140 },
  { field: "scheduleId", headerName: "Schedule ID", width: 90 },
  { field: "scheduleDateRange", headerName: "Schedule Period", width: 160 },
  { field: "activityStatus", headerName: "Activity Status", width: 130 },
];

export default function MissingActivitiesReport() {
  // Default to last 30 days
  const [fromDate, setFromDate] = useState<Dayjs | null>(dayjs().subtract(30, "day"));
  const [toDate, setToDate] = useState<Dayjs | null>(dayjs());
  const [data, setData] = useState<MissingActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [selectedGroupId, setSelectedGroupId] = useState<number | "">("");
  const [selectedLocationId, setSelectedLocationId] = useState<number | "">("");
  const [dataVersion, setDataVersion] = useState(0);

  const { session } = useConnectionStore();

  // Build columns with action column
  const columns: GridColDef<MissingActivity>[] = useMemo(() => [
    {
      field: "actions",
      headerName: "",
      width: 50,
      sortable: false,
      filterable: false,
      disableColumnMenu: true,
      renderCell: (params: GridRenderCellParams<MissingActivity>) => (
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
    ...baseColumns.slice(0, 10), // All columns before activityStatus
    {
      field: "activityStatus",
      headerName: "Activity Status",
      width: 130,
      renderCell: () => (
        <Chip label="MISSING" color="warning" size="small" />
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

      // Build locationIds array for server-side filtering
      let locationIds: number[] | undefined;
      if (selectedLocationId) {
        // Single location selected
        locationIds = [selectedLocationId];
      } else if (selectedGroupId) {
        // Location group selected - get all location IDs in the group
        const groupLocationIds = resolveLocationsForGroup(selectedGroupId);
        locationIds = Array.from(groupLocationIds);
      }

      // Fetch shifts missing activity - server-side filtered including location
      // Uses $expand=Schedule to get LocationID inline
      const missingActivityShifts = await fetchShiftsMissingActivity({
        session: sessionData,
        fromDate,
        toDate,
        locationIds,
        onProgress: setStatus,
      });

      console.log(`Server returned ${missingActivityShifts.length} shifts with missing activities`);

      // Collect unique schedule IDs for batch lookup (for schedule date range)
      const scheduleIds = [...new Set(missingActivityShifts.map(s => s.ScheduleID).filter((id): id is number => id != null && id > 0))];

      // Load lookup data (users, locations, departments, schedules)
      await loadAllLookups(sessionData, scheduleIds, setStatus);

      // Transform to report format - use embedded Schedule for location info
      const transformed: MissingActivity[] = missingActivityShifts.map((item, index) => {
        const locationId = item.Schedule?.LocationID ?? null;
        return {
          id: item.Id || index,
          shiftDescription: item.Description || "",
          shiftDate: item.StartTime ? dayjs(item.StartTime).format("DD/MM/YYYY") : "",
          shiftFrom: item.StartTime ? dayjs(item.StartTime).format("HH:mm") : "",
          shiftTo: item.FinishTime ? dayjs(item.FinishTime).format("HH:mm") : "",
          location: locationId ? getLocation(locationId) : "",
          locationId,
          department: getDepartment(item.DepartmentID),
          scheduleId: item.ScheduleID || null,
          scheduleDateRange: getScheduleDateRange(item.ScheduleID),
          assignedPerson: getUsername(item.UserID),
          unitCode: item.adhoc_UnitCode || "",
          activityStatus: "Missing",
        };
      });

      // No client-side location filtering needed - done server-side via Schedule/LocationID in()

      setData(transformed);
      const filterDesc = locationIds ? " (filtered by location)" : "";
      setStatus(`Found ${transformed.length} shifts with missing activities${filterDesc}`);
    } catch (err) {
      console.error("Search failed:", err);
      const message = err instanceof Error ? err.message : String(err);
      setError(message || "Failed to load report data");
    } finally {
      setLoading(false);
    }
  }, [session, fromDate, toDate, selectedGroupId, selectedLocationId]);

  const handleExport = useCallback(async () => {
    if (data.length === 0) return;
    setStatus("Exporting to Excel...");
    const result = await exportToExcel(data, "Missing_Activities_Report", baseColumns);
    if (result.success) {
      setStatus(result.message);
    } else {
      setError(result.message);
    }
  }, [data]);

  return (
    <Paper sx={{ p: 1.5, height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
        <Typography variant="h6">
          Missing Activities Report
        </Typography>
        <Tooltip
          title={
            <>
              <strong>Problem it solves:</strong> "Someone is allocated but what are they doing?"
              <br /><br />
              Identifies incomplete allocations where a person is assigned but no activity is specified. These need an activity assigned to complete the allocation.
              <br /><br />
              <strong>Tip:</strong> Click the arrow icon on any row to open that schedule in Nimbus.
            </>
          }
          arrow
        >
          <HelpOutlineIcon fontSize="small" color="action" sx={{ cursor: "help" }} />
        </Tooltip>
        {data.length > 0 && (
          <Chip label={`${data.length} missing`} color="warning" size="small" />
        )}
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {status || "Identify shifts with person allocation but missing activity assignment."}
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
      </ReportFilters>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <DataGrid
        rows={data}
        columns={columns}
        loading={loading}
        pageSizeOptions={[25, 50, 100]}
        initialState={{
          pagination: { paginationModel: { pageSize: 50 } },
        }}
        disableRowSelectionOnClick
        sx={dataGridStyles}
      />
    </Paper>
  );
}
