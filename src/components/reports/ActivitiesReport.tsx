import { useState, useCallback, useEffect } from "react";
import { Paper, Typography, Alert, Chip, FormControl, InputLabel, Select, MenuItem, SelectChangeEvent } from "@mui/material";
import { DataGrid, GridColDef, GridRenderCellParams } from "@mui/x-data-grid";
import dayjs, { Dayjs } from "dayjs";
import ReportFilters from "./ReportFilters";
import { useConnectionStore } from "../../stores/connectionStore";
import { exportToExcel } from "../../core/export";
import { fetchActiveShiftsWithActivities } from "../../hooks/useScheduleShifts";
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

interface ActivityChange {
  id: number;
  shiftDescription: string;
  shiftDate: string;
  shiftFrom: string;
  shiftTo: string;
  location: string;
  department: string;
  scheduleId: number | null;
  scheduleDateRange: string;
  assignedUser: string;
  activityDescription: string;
  syllabusPlus: string;
  isTTActivity: boolean;
  unitCode: string;
  flagged: boolean;
}

const columns: GridColDef<ActivityChange>[] = [
  { field: "shiftDescription", headerName: "Shift Description", flex: 1, minWidth: 150 },
  { field: "shiftDate", headerName: "Date", width: 110 },
  { field: "shiftFrom", headerName: "From", width: 80 },
  { field: "shiftTo", headerName: "To", width: 80 },
  { field: "location", headerName: "Location", width: 140 },
  { field: "department", headerName: "Department", width: 140 },
  { field: "scheduleId", headerName: "Schedule ID", width: 100, type: "number" },
  { field: "scheduleDateRange", headerName: "Schedule Period", width: 160 },
  { field: "assignedUser", headerName: "Assigned To", width: 180 },
  { field: "activityDescription", headerName: "Activity", flex: 1, minWidth: 120 },
  { field: "syllabusPlus", headerName: "Syllabus Plus", width: 150 },
  { field: "unitCode", headerName: "Unit Code", width: 100 },
  {
    field: "isTTActivity",
    headerName: "TT Activity",
    width: 100,
    renderCell: (params: GridRenderCellParams<ActivityChange>) => (
      <Chip
        label={params.value ? "Yes" : "No"}
        color={params.value ? "success" : "warning"}
        size="small"
      />
    ),
  },
  {
    field: "flagged",
    headerName: "Flagged",
    width: 100,
    renderCell: (params: GridRenderCellParams<ActivityChange>) =>
      params.value ? (
        <Chip label="FLAG" color="error" size="small" />
      ) : null,
  },
];

export default function ActivitiesReport() {
  // Default to first week of March 2026 (where test data exists)
  const [fromDate, setFromDate] = useState<Dayjs | null>(dayjs("2026-03-01"));
  const [toDate, setToDate] = useState<Dayjs | null>(dayjs("2026-03-07"));
  const [data, setData] = useState<ActivityChange[]>([]);
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

      // Fetch active shifts with activities - server-side filtered
      const activeShifts = await fetchActiveShiftsWithActivities({
        session: sessionData,
        fromDate,
        toDate,
        onProgress: setStatus,
      });

      console.log(`Server returned ${activeShifts.length} active shifts with activities`);

      // Collect unique schedule IDs for batch lookup
      const scheduleIds = [...new Set(activeShifts.map(s => s.ScheduleID).filter((id): id is number => id != null && id > 0))];

      // Load lookup data (users, locations, departments, schedules)
      await loadAllLookups(sessionData, scheduleIds, setStatus);

      // Transform and flag non-TT activities
      const transformed: ActivityChange[] = activeShifts.map((item, index) => {
        const activityGroup = item.adhoc_ActivityGroup || "";
        // TT activities have SyllabusPlus code from timetable
        const syllabusPlus = item.adhoc_SyllabusPlus || "";
        const isTT = !!syllabusPlus;

        return {
          id: item.Id || index,
          shiftDescription: item.Description || "",
          shiftDate: item.StartTime ? dayjs(item.StartTime).format("DD/MM/YYYY") : "",
          shiftFrom: item.StartTime ? dayjs(item.StartTime).format("HH:mm") : "",
          shiftTo: item.FinishTime ? dayjs(item.FinishTime).format("HH:mm") : "",
          location: getLocationViaSchedule(item.ScheduleID),
          department: getDepartment(item.DepartmentID),
          scheduleId: item.ScheduleID || null,
          scheduleDateRange: getScheduleDateRange(item.ScheduleID),
          assignedUser: getUsername(item.UserID),
          activityDescription: activityGroup,
          syllabusPlus: syllabusPlus,
          isTTActivity: isTT,
          unitCode: item.adhoc_UnitCode || "",
          flagged: !isTT && item.ActivityTypeID != null, // Flag: has activity but no SyllabusPlus
        };
      });

      // Sort flagged items first
      transformed.sort((a, b) => (b.flagged ? 1 : 0) - (a.flagged ? 1 : 0));

      // Filter by location if selected
      const selectedLocationName = selectedLocationId
        ? locations.find(l => l.id === selectedLocationId)?.description
        : null;
      const filtered = selectedLocationName
        ? transformed.filter(item => item.location === selectedLocationName)
        : transformed;

      setData(filtered);
      setStatus(`Found ${filtered.length} shifts (${filtered.filter(t => t.flagged).length} flagged)${selectedLocationName ? ` at ${selectedLocationName}` : ""}`);
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
    exportToExcel(data, "Activities_Report", columns);
  }, [data]);

  const flaggedCount = data.filter((d) => d.flagged).length;

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Activities Report (TT Changes)
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Flag inappropriate activity code changes from timetable (TT) to non-timetable activities.
        {flaggedCount > 0 && (
          <Chip
            label={`${flaggedCount} flagged`}
            color="error"
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
        getRowClassName={(params) => (params.row.flagged ? "flagged-row" : "")}
        sx={{
          height: "calc(100vh - 340px)",
          minHeight: 400,
          "& .flagged-row": {
            backgroundColor: "rgba(211, 47, 47, 0.1)",
          },
        }}
      />
    </Paper>
  );
}
