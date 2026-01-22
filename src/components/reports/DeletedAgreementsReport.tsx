import { useState, useCallback, useEffect } from "react";
import { Paper, Typography, Alert, FormControl, InputLabel, Select, MenuItem, SelectChangeEvent, FormControlLabel, Checkbox, Chip } from "@mui/material";
import { DataGrid, GridColDef, GridRenderCellParams } from "@mui/x-data-grid";
import dayjs, { Dayjs } from "dayjs";
import ReportFilters from "./ReportFilters";
import { useConnectionStore } from "../../stores/connectionStore";
import { exportToExcel } from "../../core/export";
import { fetchDeletedShifts, fetchEmptyShifts } from "../../hooks/useScheduleShifts";
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

interface DeletedAgreement {
  id: number;
  shiftStatus: "Deleted" | "Empty";
  shiftDescription: string;
  shiftDate: string;
  shiftFrom: string;
  shiftTo: string;
  location: string;
  department: string;
  scheduleId: number | null;
  scheduleDateRange: string;
  syllabusPlus: string;
  activityDescription: string;
  modifiedBy: string;
  modifiedDate: string;
}

const columns: GridColDef<DeletedAgreement>[] = [
  {
    field: "shiftStatus",
    headerName: "Status",
    width: 100,
    renderCell: (params: GridRenderCellParams<DeletedAgreement>) => (
      <Chip
        label={params.value}
        color={params.value === "Deleted" ? "error" : "warning"}
        size="small"
      />
    ),
  },
  { field: "shiftDescription", headerName: "Shift Description", flex: 1, minWidth: 150 },
  { field: "shiftDate", headerName: "Date", width: 110 },
  { field: "shiftFrom", headerName: "From", width: 80 },
  { field: "shiftTo", headerName: "To", width: 80 },
  { field: "location", headerName: "Location", width: 140 },
  { field: "department", headerName: "Department", width: 140 },
  { field: "scheduleId", headerName: "Schedule ID", width: 100, type: "number" },
  { field: "scheduleDateRange", headerName: "Schedule Period", width: 160 },
  { field: "syllabusPlus", headerName: "Syllabus Plus", width: 150 },
  { field: "activityDescription", headerName: "Activity", flex: 1, minWidth: 150 },
  { field: "modifiedBy", headerName: "Modified By", width: 180 },
  { field: "modifiedDate", headerName: "Modified Date", width: 140 },
];

export default function DeletedAgreementsReport() {
  // Default to first week of March 2026 (where test data exists)
  const [fromDate, setFromDate] = useState<Dayjs | null>(dayjs("2026-03-01"));
  const [toDate, setToDate] = useState<Dayjs | null>(dayjs("2026-03-07"));
  const [data, setData] = useState<DeletedAgreement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [locations, setLocations] = useState<LocationInfo[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<number | "">("");
  const [includeEmptyShifts, setIncludeEmptyShifts] = useState(false);

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

      // Fetch deleted shifts - server-side filtered for efficiency
      setStatus("Fetching deleted shifts...");
      const deletedShifts = await fetchDeletedShifts({
        session: sessionData,
        fromDate,
        toDate,
        onProgress: setStatus,
      });

      console.log(`Server returned ${deletedShifts.length} deleted shifts in date range`);

      // Optionally fetch empty/unallocated shifts
      let emptyShifts: typeof deletedShifts = [];
      if (includeEmptyShifts) {
        setStatus("Fetching empty shifts...");
        emptyShifts = await fetchEmptyShifts({
          session: sessionData,
          fromDate,
          toDate,
          onProgress: setStatus,
        });
        console.log(`Server returned ${emptyShifts.length} empty shifts in date range`);
      }

      // Collect unique schedule IDs for batch lookup from both sets
      const allShifts = [...deletedShifts, ...emptyShifts];
      const scheduleIds = [...new Set(allShifts.map(s => s.ScheduleID).filter((id): id is number => id != null && id > 0))];

      // Load lookup data (users, locations, departments, schedules)
      await loadAllLookups(sessionData, scheduleIds, setStatus);

      // Transform deleted shifts
      const transformedDeleted: DeletedAgreement[] = deletedShifts.map((item, index) => ({
        id: item.Id || index,
        shiftStatus: "Deleted" as const,
        shiftDescription: item.Description || "",
        shiftDate: item.StartTime ? dayjs(item.StartTime).format("DD/MM/YYYY") : "",
        shiftFrom: item.StartTime ? dayjs(item.StartTime).format("HH:mm") : "",
        shiftTo: item.FinishTime ? dayjs(item.FinishTime).format("HH:mm") : "",
        location: getLocationViaSchedule(item.ScheduleID),
        department: getDepartment(item.DepartmentID),
        scheduleId: item.ScheduleID || null,
        scheduleDateRange: getScheduleDateRange(item.ScheduleID),
        syllabusPlus: item.adhoc_SyllabusPlus || "",
        activityDescription: item.adhoc_ActivityGroup || "",
        modifiedBy: getUsername(item.UpdatedBy),
        modifiedDate: item.Updated ? dayjs(item.Updated).format("DD/MM/YYYY HH:mm") : "",
      }));

      // Transform empty shifts (use different ID range to avoid conflicts)
      const transformedEmpty: DeletedAgreement[] = emptyShifts.map((item, index) => ({
        id: item.Id || (index + 100000),
        shiftStatus: "Empty" as const,
        shiftDescription: item.Description || "",
        shiftDate: item.StartTime ? dayjs(item.StartTime).format("DD/MM/YYYY") : "",
        shiftFrom: item.StartTime ? dayjs(item.StartTime).format("HH:mm") : "",
        shiftTo: item.FinishTime ? dayjs(item.FinishTime).format("HH:mm") : "",
        location: getLocationViaSchedule(item.ScheduleID),
        department: getDepartment(item.DepartmentID),
        scheduleId: item.ScheduleID || null,
        scheduleDateRange: getScheduleDateRange(item.ScheduleID),
        syllabusPlus: item.adhoc_SyllabusPlus || "",
        activityDescription: item.adhoc_ActivityGroup || "",
        modifiedBy: "",
        modifiedDate: "",
      }));

      // Combine both
      const combined = [...transformedDeleted, ...transformedEmpty];

      // Filter by location if selected
      const selectedLocationName = selectedLocationId
        ? locations.find(l => l.id === selectedLocationId)?.description
        : null;
      const filtered = selectedLocationName
        ? combined.filter(item => item.location === selectedLocationName)
        : combined;

      setData(filtered);
      const deletedCount = filtered.filter(f => f.shiftStatus === "Deleted").length;
      const emptyCount = filtered.filter(f => f.shiftStatus === "Empty").length;
      setStatus(`Found ${deletedCount} deleted${includeEmptyShifts ? `, ${emptyCount} empty` : ""} shifts${selectedLocationName ? ` at ${selectedLocationName}` : ""}`);
    } catch (err) {
      console.error("Search failed:", err);
      const message = err instanceof Error ? err.message : String(err);
      setError(message || "Failed to load report data");
    } finally {
      setLoading(false);
    }
  }, [session, fromDate, toDate, selectedLocationId, locations, includeEmptyShifts]);

  const handleExport = useCallback(() => {
    if (data.length === 0) return;
    exportToExcel(data, "Deleted_Agreements_Report", columns);
  }, [data]);

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Deleted Agreements Report
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Track agreement deletions and identify who performed them.
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
        <FormControlLabel
          control={
            <Checkbox
              checked={includeEmptyShifts}
              onChange={(e) => setIncludeEmptyShifts(e.target.checked)}
              size="small"
            />
          }
          label="Include empty/unallocated shifts"
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
