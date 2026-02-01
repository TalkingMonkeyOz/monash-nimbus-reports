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
import { fetchShiftsMissingJobRole } from "../../hooks/useScheduleShifts";
import {
  loadAllLookups,
  loadLocations,
  getUsername,
  getDepartment,
  getScheduleDateRange,
  getLocationViaSchedule,
  getLocationIdViaSchedule,
} from "../../core/lookupService";
import {
  loadLocationGroupHierarchy,
  resolveLocationsForGroup,
} from "../../core/locationGroupService";

interface ShiftMissingJobRole {
  id: number;
  shiftDescription: string;
  shiftDate: string;
  shiftFrom: string;
  shiftTo: string;
  hours: number;
  location: string;
  locationId: number | null;
  department: string;
  scheduleId: number | null;
  scheduleDateRange: string;
  unitCode: string;
  assignedUser: string;
  activityType: string;
}

// Base columns for export
const baseColumns: GridColDef<ShiftMissingJobRole>[] = [
  { field: "shiftDescription", headerName: "Shift Description", flex: 1, minWidth: 150 },
  { field: "shiftDate", headerName: "Date", width: 110 },
  { field: "shiftFrom", headerName: "From", width: 80 },
  { field: "shiftTo", headerName: "To", width: 80 },
  { field: "hours", headerName: "Hours", width: 80, type: "number" },
  { field: "location", headerName: "Location", width: 140 },
  { field: "department", headerName: "Department", width: 140 },
  { field: "scheduleId", headerName: "Schedule ID", width: 90 },
  { field: "scheduleDateRange", headerName: "Schedule Period", width: 160 },
  { field: "unitCode", headerName: "Unit Code", width: 100 },
  { field: "assignedUser", headerName: "Assigned To", width: 180 },
  { field: "activityType", headerName: "Activity Type", flex: 1, minWidth: 120 },
];

export default function MissingJobRolesReport() {
  // Default to last 30 days
  const [fromDate, setFromDate] = useState<Dayjs | null>(dayjs().subtract(30, "day"));
  const [toDate, setToDate] = useState<Dayjs | null>(dayjs());
  const [data, setData] = useState<ShiftMissingJobRole[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [selectedGroupId, setSelectedGroupId] = useState<number | "">("");
  const [selectedLocationId, setSelectedLocationId] = useState<number | "">("");
  const [dataVersion, setDataVersion] = useState(0);

  const { session } = useConnectionStore();

  // Build columns with action column
  const columns: GridColDef<ShiftMissingJobRole>[] = useMemo(() => [
    {
      field: "actions",
      headerName: "",
      width: 50,
      sortable: false,
      filterable: false,
      disableColumnMenu: true,
      renderCell: (params: GridRenderCellParams<ShiftMissingJobRole>) => (
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
    ...baseColumns,
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

      // Fetch shifts missing job role - server-side filtered
      const missingJobRoleShifts = await fetchShiftsMissingJobRole({
        session: sessionData,
        fromDate,
        toDate,
        onProgress: setStatus,
      });

      console.log(`Server returned ${missingJobRoleShifts.length} shifts with missing job roles`);

      // Collect unique schedule IDs for batch lookup
      const scheduleIds = [...new Set(missingJobRoleShifts.map(s => s.ScheduleID).filter((id): id is number => id != null && id > 0))];

      // Load lookup data (users, locations, departments, schedules)
      await loadAllLookups(sessionData, scheduleIds, setStatus);

      // Transform to report format with lookups
      const transformed: ShiftMissingJobRole[] = missingJobRoleShifts.map((item, index) => ({
        id: item.Id || index,
        shiftDescription: item.Description || "",
        shiftDate: item.StartTime ? dayjs(item.StartTime).format("DD/MM/YYYY") : "",
        shiftFrom: item.StartTime ? dayjs(item.StartTime).format("HH:mm") : "",
        shiftTo: item.FinishTime ? dayjs(item.FinishTime).format("HH:mm") : "",
        hours: item.Hours || 0,
        location: getLocationViaSchedule(item.ScheduleID),
        locationId: getLocationIdViaSchedule(item.ScheduleID),
        department: getDepartment(item.DepartmentID),
        scheduleId: item.ScheduleID || null,
        scheduleDateRange: getScheduleDateRange(item.ScheduleID),
        unitCode: item.adhoc_UnitCode || "",
        assignedUser: getUsername(item.UserID),
        activityType: item.adhoc_ActivityGroup || "",
      }));

      // Filter by location group and/or specific location
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
      const filterDesc = selectedGroupId || selectedLocationId ? " (filtered)" : "";
      setStatus(`Found ${filtered.length} shifts with missing job roles${filterDesc}`);
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
    const result = await exportToExcel(data, "Missing_Job_Roles_Report", baseColumns);
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
          Missing Job Roles Report
        </Typography>
        <Tooltip
          title={
            <>
              <strong>Problem it solves:</strong> "This shift doesn't have a job role - it may not cost correctly."
              <br /><br />
              Finds configuration gaps where shifts are missing job roles, which could affect payroll processing.
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
        {status || "Identify shifts that don't have a job role assigned."}
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
