import { useState, useCallback, useEffect, useMemo } from "react";
import { Paper, Typography, Alert, IconButton, Tooltip, Box } from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import { DataGrid, GridColDef, GridRenderCellParams } from "@mui/x-data-grid";
import dayjs, { Dayjs } from "dayjs";
import ReportFilters from "./ReportFilters";
import CascadingLocationFilter from "../filters/CascadingLocationFilter";
import { useConnectionStore } from "../../stores/connectionStore";
import { exportToExcel } from "../../core/export";
import { openNimbusSchedule } from "../../core/nimbusLinks";
import { fetchScheduleShiftHistory } from "../../hooks/useScheduleShifts";
import {
  loadAllLookups,
  loadLocations,
  getUserDisplayName,
  getDepartment,
  getScheduleDateRange,
  getLocationViaSchedule,
  getLocationIdViaSchedule,
} from "../../core/lookupService";
import {
  loadLocationGroupHierarchy,
  resolveLocationsForGroup,
} from "../../core/locationGroupService";

interface ChangeHistoryRow {
  id: number;
  scheduleShiftId: number;
  shiftDescription: string;
  shiftDate: string;
  shiftFrom: string;
  shiftTo: string;
  changeDate: string;
  changedBy: string;
  location: string;
  locationId: number | null;
  department: string;
  scheduleId: number | null;
  scheduleDateRange: string;
  allocatedPerson: string;
  activityTypeId: number | null;
  wasDeleted: boolean;
}

// Base columns for export
const baseColumns: GridColDef<ChangeHistoryRow>[] = [
  { field: "shiftDescription", headerName: "Shift Description", flex: 1, minWidth: 150 },
  { field: "shiftDate", headerName: "Shift Date", width: 110 },
  { field: "shiftFrom", headerName: "From", width: 80 },
  { field: "shiftTo", headerName: "To", width: 80 },
  { field: "changeDate", headerName: "Change Date", width: 150 },
  { field: "changedBy", headerName: "Changed By", width: 220 },
  { field: "allocatedPerson", headerName: "Allocated Person", width: 200 },
  { field: "location", headerName: "Location", width: 140 },
  { field: "department", headerName: "Department", width: 140 },
  { field: "scheduleId", headerName: "Schedule ID", width: 100, type: "number" },
  { field: "scheduleDateRange", headerName: "Schedule Period", width: 160 },
  { field: "wasDeleted", headerName: "Deleted", width: 80 },
];

export default function ChangeHistoryReport() {
  // Default to last 7 days
  const [fromDate, setFromDate] = useState<Dayjs | null>(dayjs().subtract(7, "day"));
  const [toDate, setToDate] = useState<Dayjs | null>(dayjs());
  const [data, setData] = useState<ChangeHistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [selectedGroupId, setSelectedGroupId] = useState<number | "">("");
  const [selectedLocationId, setSelectedLocationId] = useState<number | "">("");
  const [dataVersion, setDataVersion] = useState(0);

  const { session } = useConnectionStore();

  // Build columns with action column
  const columns: GridColDef<ChangeHistoryRow>[] = useMemo(() => [
    {
      field: "actions",
      headerName: "",
      width: 50,
      sortable: false,
      filterable: false,
      disableColumnMenu: true,
      renderCell: (params: GridRenderCellParams<ChangeHistoryRow>) => (
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

      // Fetch change history
      setStatus("Fetching change history...");
      const history = await fetchScheduleShiftHistory({
        session: sessionData,
        fromDate,
        toDate,
        onProgress: setStatus,
      });

      console.log(`Fetched ${history.length} history records`);

      // Collect unique schedule IDs
      const scheduleIds = [...new Set(history.map(h => h.ScheduleID).filter((id): id is number => id != null && id > 0))];

      // Load lookup data
      await loadAllLookups(sessionData, scheduleIds, setStatus);

      // Transform data
      const transformed: ChangeHistoryRow[] = history.map((item, index) => ({
        id: item.Id || index,
        scheduleShiftId: item.ScheduleShiftID,
        shiftDescription: item.Description || "",
        shiftDate: item.StartTime ? dayjs(item.StartTime).format("DD/MM/YYYY") : "",
        shiftFrom: item.StartTime ? dayjs(item.StartTime).format("HH:mm") : "",
        shiftTo: item.FinishTime ? dayjs(item.FinishTime).format("HH:mm") : "",
        changeDate: item.Inserted ? dayjs(item.Inserted).format("DD/MM/YYYY HH:mm") : "",
        changedBy: getUserDisplayName(item.InsertedBy),
        location: getLocationViaSchedule(item.ScheduleID),
        locationId: getLocationIdViaSchedule(item.ScheduleID),
        department: getDepartment(item.DepartmentID),
        scheduleId: item.ScheduleID || null,
        scheduleDateRange: getScheduleDateRange(item.ScheduleID),
        allocatedPerson: getUserDisplayName(item.UserID),
        activityTypeId: item.ActivityTypeID || null,
        wasDeleted: item.Deleted,
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
      setStatus(`Found ${filtered.length} change records${filterDesc}`);
    } catch (err) {
      console.error("Search failed:", err);
      const message = err instanceof Error ? err.message : String(err);
      setError(message || "Failed to load change history");
    } finally {
      setLoading(false);
    }
  }, [session, fromDate, toDate, selectedGroupId, selectedLocationId]);

  const handleExport = useCallback(async () => {
    if (data.length === 0) return;
    setStatus("Exporting to Excel...");
    const result = await exportToExcel(data, "Change_History_Report", baseColumns);
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
          Change History Report
        </Typography>
        <Tooltip
          title={
            <>
              <strong>Problem it solves:</strong> "Who changed this allocation and when?"
              <br /><br />
              Shows all changes made to shifts/allocations within the date range, including who made each change and what was modified.
              <br /><br />
              <strong>Note:</strong> Date filter is based on when the change was made, not the shift date.
            </>
          }
          arrow
        >
          <HelpOutlineIcon fontSize="small" color="action" sx={{ cursor: "help" }} />
        </Tooltip>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {status || "Track all changes to allocations - who changed what, and when."}
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
          pagination: { paginationModel: { pageSize: 25 } },
          sorting: { sortModel: [{ field: "changeDate", sort: "desc" }] },
        }}
        disableRowSelectionOnClick
        sx={{
          flex: 1,
          minHeight: 400,
          "& .MuiDataGrid-virtualScroller": {
            overflowX: "auto",
          },
          "& .MuiDataGrid-scrollbar--horizontal": {
            display: "block",
          },
          // Pin first column (actions)
          "& .MuiDataGrid-cell:first-of-type, & .MuiDataGrid-columnHeader:first-of-type": {
            position: "sticky",
            left: 0,
            backgroundColor: "#fff",
            zIndex: 1,
            borderRight: "1px solid rgba(224, 224, 224, 1)",
          },
        }}
      />
    </Paper>
  );
}
