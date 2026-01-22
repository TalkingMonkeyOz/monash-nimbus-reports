import { useState, useCallback, useEffect } from "react";
import { Paper, Typography, Alert, Chip, FormControl, InputLabel, Select, MenuItem, SelectChangeEvent } from "@mui/material";
import { DataGrid, GridColDef } from "@mui/x-data-grid";
import dayjs, { Dayjs } from "dayjs";
import ReportFilters from "./ReportFilters";
import { useConnectionStore } from "../../stores/connectionStore";
import { exportToExcel } from "../../core/export";
import { fetchShiftsMissingJobRole } from "../../hooks/useScheduleShifts";
import {
  loadAllLookups,
  loadLocations,
  getUsername,
  getDepartment,
  getScheduleDateRange,
  getLocationViaSchedule,
  getAllLocations,
  LocationInfo,
} from "../../core/lookupService";

interface ShiftMissingJobRole {
  id: number;
  shiftDescription: string;
  shiftDate: string;
  shiftFrom: string;
  shiftTo: string;
  hours: number;
  location: string;
  department: string;
  scheduleId: number | null;
  scheduleDateRange: string;
  unitCode: string;
  assignedUser: string;
  activityType: string;
}

const columns: GridColDef<ShiftMissingJobRole>[] = [
  { field: "shiftDescription", headerName: "Shift Description", flex: 1, minWidth: 150 },
  { field: "shiftDate", headerName: "Date", width: 110 },
  { field: "shiftFrom", headerName: "From", width: 80 },
  { field: "shiftTo", headerName: "To", width: 80 },
  { field: "hours", headerName: "Hours", width: 80, type: "number" },
  { field: "location", headerName: "Location", width: 140 },
  { field: "department", headerName: "Department", width: 140 },
  { field: "scheduleId", headerName: "Schedule ID", width: 100, type: "number" },
  { field: "scheduleDateRange", headerName: "Schedule Period", width: 160 },
  { field: "unitCode", headerName: "Unit Code", width: 100 },
  { field: "assignedUser", headerName: "Assigned To", width: 180 },
  { field: "activityType", headerName: "Activity Type", flex: 1, minWidth: 120 },
];

export default function MissingJobRolesReport() {
  // Default to first week of March 2026 (where test data exists)
  const [fromDate, setFromDate] = useState<Dayjs | null>(dayjs("2026-03-01"));
  const [toDate, setToDate] = useState<Dayjs | null>(dayjs("2026-03-07"));
  const [data, setData] = useState<ShiftMissingJobRole[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [locations, setLocations] = useState<LocationInfo[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<number | "">("");

  const { session } = useConnectionStore();

  // Load locations for filter dropdown
  useEffect(() => {
    if (session) {
      loadLocations({
        base_url: session.base_url,
        user_id: session.user_id,
        auth_token: session.auth_token,
      }).then(() => {
        setLocations(getAllLocations());
      });
    }
  }, [session]);

  const handleLocationChange = (event: SelectChangeEvent<number | "">) => {
    setSelectedLocationId(event.target.value as number | "");
  };

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
        user_id: session.user_id,
        auth_token: session.auth_token,
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
        department: getDepartment(item.DepartmentID),
        scheduleId: item.ScheduleID || null,
        scheduleDateRange: getScheduleDateRange(item.ScheduleID),
        unitCode: item.adhoc_UnitCode || "",
        assignedUser: getUsername(item.UserID),
        activityType: item.adhoc_ActivityGroup || "",
      }));

      // Filter by location if selected
      const selectedLocationName = selectedLocationId
        ? locations.find(l => l.id === selectedLocationId)?.description
        : null;
      const filtered = selectedLocationName
        ? transformed.filter(item => item.location === selectedLocationName)
        : transformed;

      setData(filtered);
      setStatus(`Found ${filtered.length} shifts with missing job roles${selectedLocationName ? ` at ${selectedLocationName}` : ""}`);
    } catch (err) {
      console.error("Search failed:", err);
      const message = err instanceof Error ? err.message : String(err);
      setError(message || "Failed to load report data");
    } finally {
      setLoading(false);
    }
  }, [session, fromDate, toDate, selectedLocationId, locations]);

  const handleExport = useCallback(() => {
    if (data.length === 0) return;
    exportToExcel(data, "Missing_Job_Roles_Report", columns);
  }, [data]);

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Missing Job Roles Report
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Identify shifts that don't have a job role assigned.
        {data.length > 0 && (
          <Chip
            label={`${data.length} shifts with missing job roles`}
            color="warning"
            size="small"
            sx={{ ml: 1 }}
          />
        )}
        {status && <span style={{ marginLeft: 8, fontStyle: "italic" }}>{status}</span>}
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
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Location</InputLabel>
          <Select
            value={selectedLocationId}
            onChange={handleLocationChange}
            label="Location"
          >
            <MenuItem value="">All Locations</MenuItem>
            {locations.map((loc) => (
              <MenuItem key={loc.id} value={loc.id}>
                {loc.description}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
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
          pagination: { paginationModel: { pageSize: 25 } },
        }}
        disableRowSelectionOnClick
        sx={{
          height: "calc(100vh - 340px)",
          minHeight: 400,
        }}
      />
    </Paper>
  );
}
