import { useState, useCallback } from "react";
import { Paper, Typography, Alert, Box } from "@mui/material";
import { DataGrid, GridColDef } from "@mui/x-data-grid";
import dayjs, { Dayjs } from "dayjs";
import ReportFilters from "./ReportFilters";
import { useConnectionStore } from "../../stores/connectionStore";
import { exportToExcel } from "../../core/export";
import { fetchDeletedShifts } from "../../hooks/useScheduleShifts";
import {
  loadAllLookups,
  getUsername,
  getDepartment,
  getScheduleDateRange,
  getLocationViaSchedule,
} from "../../core/lookupService";

interface DeletedAgreement {
  id: number;
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
  deletedBy: string;
  deletedDate: string;
}

const columns: GridColDef<DeletedAgreement>[] = [
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
  { field: "deletedBy", headerName: "Deleted By", width: 180 },
  { field: "deletedDate", headerName: "Deleted Date", width: 140 },
];

export default function DeletedAgreementsReport() {
  // Default to first week of March 2026 (where test data exists)
  const [fromDate, setFromDate] = useState<Dayjs | null>(dayjs("2026-03-01"));
  const [toDate, setToDate] = useState<Dayjs | null>(dayjs("2026-03-07"));
  const [data, setData] = useState<DeletedAgreement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");

  const { session } = useConnectionStore();

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

      // Fetch deleted shifts only - server-side filtered for efficiency
      const deletedShifts = await fetchDeletedShifts({
        session: sessionData,
        fromDate,
        toDate,
        onProgress: setStatus,
      });

      console.log(`Server returned ${deletedShifts.length} deleted shifts in date range`);

      // Collect unique schedule IDs for batch lookup
      const scheduleIds = [...new Set(deletedShifts.map(s => s.ScheduleID).filter((id): id is number => id != null && id > 0))];

      // Load lookup data (users, locations, departments, schedules)
      await loadAllLookups(sessionData, scheduleIds, setStatus);

      // Transform to report format with lookups
      const transformed: DeletedAgreement[] = deletedShifts.map((item, index) => ({
        id: item.Id || index,
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
        deletedBy: getUsername(item.UpdatedBy),
        deletedDate: item.Updated ? dayjs(item.Updated).format("DD/MM/YYYY HH:mm") : "",
      }));

      setData(transformed);
      setStatus(`Found ${transformed.length} deleted shifts`);
    } catch (err) {
      console.error("Search failed:", err);
      const message = err instanceof Error ? err.message : String(err);
      setError(message || "Failed to load report data");
    } finally {
      setLoading(false);
    }
  }, [session, fromDate, toDate]);

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
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Box
        sx={{
          width: "100%",
          overflowX: "auto",
          position: "relative",
          // Sticky scrollbar at bottom of viewport
          "& ::-webkit-scrollbar": {
            height: 12,
          },
          "& ::-webkit-scrollbar-track": {
            backgroundColor: "#f1f1f1",
          },
          "& ::-webkit-scrollbar-thumb": {
            backgroundColor: "#888",
            borderRadius: 6,
            "&:hover": {
              backgroundColor: "#555",
            },
          },
        }}
      >
        <DataGrid
          rows={data}
          columns={columns}
          loading={loading}
          autoHeight
          pageSizeOptions={[25, 50, 100]}
          initialState={{
            pagination: { paginationModel: { pageSize: 25 } },
          }}
          disableRowSelectionOnClick
          sx={{
            minWidth: 1600,
            "& .MuiDataGrid-virtualScroller": {
              overflowX: "visible",
            },
          }}
        />
      </Box>
    </Paper>
  );
}
