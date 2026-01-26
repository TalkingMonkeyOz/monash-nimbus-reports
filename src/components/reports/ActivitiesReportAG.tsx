/**
 * Activities Report - AG Grid Proof of Concept
 *
 * Demonstrates AG Grid Community with:
 * - Material Design theme
 * - Row grouping (free in AG Grid Community!)
 * - Column grouping
 * - Same data as MUI DataGrid version
 */

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Paper, Typography, Alert, FormControl, InputLabel, Select, MenuItem, SelectChangeEvent, Box, ToggleButton, ToggleButtonGroup } from "@mui/material";
import { AgGridReact } from "ag-grid-react";
import { ColDef, GridReadyEvent, ModuleRegistry, AllCommunityModule } from "ag-grid-community";
import { GridColDef } from "@mui/x-data-grid";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-material.css";

// Register AG Grid modules (required for v31+)
ModuleRegistry.registerModules([AllCommunityModule]);
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
  getActivityTypeDescription,
  isActivityTypeTT,
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

// AG Grid column definitions
const columnDefs: ColDef<ActivityChange>[] = [
  {
    field: "shiftDate",
    headerName: "Date",
    width: 110,
    enableRowGroup: true,
  },
  { field: "shiftFrom", headerName: "From", width: 80 },
  { field: "shiftTo", headerName: "To", width: 80 },
  { field: "shiftDescription", headerName: "Shift Description", flex: 1, minWidth: 150 },
  { field: "assignedUser", headerName: "Assigned To", width: 180, enableRowGroup: true },
  {
    field: "activityDescription",
    headerName: "Activity",
    flex: 1,
    minWidth: 120,
    enableRowGroup: true,
  },
  { field: "syllabusPlus", headerName: "Syllabus Plus", width: 150 },
  { field: "unitCode", headerName: "Unit Code", width: 100 },
  {
    field: "location",
    headerName: "Location",
    width: 140,
    enableRowGroup: true,
  },
  {
    field: "department",
    headerName: "Department",
    width: 140,
    enableRowGroup: true,
  },
  { field: "scheduleId", headerName: "Schedule ID", width: 100 },
  { field: "scheduleDateRange", headerName: "Schedule Period", width: 160 },
  {
    field: "isTTActivity",
    headerName: "TT Activity",
    width: 100,
    enableRowGroup: true,
    valueFormatter: (params) => params.value ? "Yes" : "No",
  },
  {
    field: "flagged",
    headerName: "Flagged",
    width: 100,
    enableRowGroup: true,
    valueFormatter: (params) => params.value ? "Yes" : "No",
    cellStyle: (params) => params.value ? { color: "red", fontWeight: "bold" } : null,
  },
];

// Export columns for Excel (MUI GridColDef format)
const exportColumns: GridColDef<ActivityChange>[] = columnDefs.map(c => ({
  field: c.field as string,
  headerName: c.headerName || c.field as string,
  width: c.width as number || 100,
}));

export default function ActivitiesReportAG() {
  const [fromDate, setFromDate] = useState<Dayjs | null>(dayjs().subtract(30, "day"));
  const [toDate, setToDate] = useState<Dayjs | null>(dayjs());
  const [data, setData] = useState<ActivityChange[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [locations, setLocations] = useState<LocationInfo[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<number | "">("");
  const [groupBy, setGroupBy] = useState<string>("");

  const gridRef = useRef<AgGridReact>(null);
  const { session } = useConnectionStore();

  // Default column settings
  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true,
    filter: true,
    resizable: true,
  }), []);

  // Auto-size columns on grid ready
  const onGridReady = useCallback((params: GridReadyEvent) => {
    params.api.sizeColumnsToFit();
  }, []);

  // Load locations on mount
  useEffect(() => {
    if (session) {
      const sessionData = {
        base_url: session.base_url,
        user_id: session.user_id,
        auth_token: session.auth_token,
      };
      loadLocations(sessionData).then(() => {
        setLocations(getAllLocations());
      });
    }
  }, [session]);

  // Handle group by change
  const handleGroupByChange = (_event: React.MouseEvent<HTMLElement>, newGroupBy: string | null) => {
    const value = newGroupBy || "";
    setGroupBy(value);

    if (gridRef.current?.api) {
      if (value) {
        gridRef.current.api.setRowGroupColumns([value]);
      } else {
        gridRef.current.api.setRowGroupColumns([]);
      }
    }
  };

  // Search handler
  const handleSearch = useCallback(async () => {
    if (!session || !fromDate || !toDate) return;

    setLoading(true);
    setError(null);
    setData([]);

    try {
      const sessionData = {
        base_url: session.base_url,
        user_id: session.user_id,
        auth_token: session.auth_token,
      };

      setStatus("Loading lookups...");
      await loadAllLookups(sessionData);

      setStatus("Fetching shifts...");
      const shifts = await fetchActiveShiftsWithActivities({
        session: sessionData,
        fromDate,
        toDate,
        onProgress: (msg: string) => setStatus(msg),
      });

      setStatus("Processing data...");
      const processed: ActivityChange[] = shifts.map((shift) => {
        const location = getLocationViaSchedule(shift.ScheduleID);
        const activityDesc = getActivityTypeDescription(shift.ActivityTypeID);
        const isTT = isActivityTypeTT(shift.ActivityTypeID);

        return {
          id: shift.Id,
          shiftDescription: shift.Description || "",
          shiftDate: shift.StartTime ? dayjs(shift.StartTime).format("DD/MM/YYYY") : "",
          shiftFrom: shift.StartTime ? dayjs(shift.StartTime).format("HH:mm") : "",
          shiftTo: shift.FinishTime ? dayjs(shift.FinishTime).format("HH:mm") : "",
          location: location || "Unknown",
          department: getDepartment(shift.DepartmentID) || "",
          scheduleId: shift.ScheduleID ?? null,
          scheduleDateRange: getScheduleDateRange(shift.ScheduleID) || "",
          assignedUser: getUsername(shift.UserID) || "Unassigned",
          activityDescription: activityDesc || "No Activity",
          syllabusPlus: shift.adhoc_SyllabusPlus || "",
          isTTActivity: isTT,
          unitCode: shift.adhoc_UnitCode || "",
          flagged: shift.UserID !== null && !isTT,
        };
      });

      // Filter by location if selected
      const filtered = selectedLocationId
        ? processed.filter((row) => {
            const locName = row.location.toLowerCase();
            const selectedLoc = locations.find((l) => l.id === selectedLocationId);
            return selectedLoc && locName.includes(selectedLoc.description.toLowerCase());
          })
        : processed;

      setData(filtered);
      setStatus(`Found ${filtered.length} shifts`);
    } catch (err) {
      console.error("Search error:", err);
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [session, fromDate, toDate, selectedLocationId, locations]);

  // Export handler
  const handleExport = useCallback(async () => {
    if (data.length === 0) return;
    await exportToExcel(data, "activities-report-ag", exportColumns);
  }, [data]);

  if (!session) {
    return (
      <Paper sx={{ p: 3 }}>
        <Alert severity="info">Please connect to a Nimbus server first.</Alert>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 2, height: "calc(100vh - 180px)", display: "flex", flexDirection: "column" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
        <Typography variant="h6">
          Activities Report (AG Grid POC)
        </Typography>
        <Typography variant="caption" sx={{
          bgcolor: "primary.main",
          color: "white",
          px: 1,
          py: 0.5,
          borderRadius: 1
        }}>
          AG Grid Community
        </Typography>
      </Box>

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
            onChange={(e: SelectChangeEvent<number | "">) =>
              setSelectedLocationId(e.target.value as number | "")
            }
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

      {/* Group By Toggle - AG Grid feature! */}
      <Box sx={{ mb: 2, display: "flex", alignItems: "center", gap: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Group by:
        </Typography>
        <ToggleButtonGroup
          value={groupBy}
          exclusive
          onChange={handleGroupByChange}
          size="small"
        >
          <ToggleButton value="">
            None
          </ToggleButton>
          <ToggleButton value="activityDescription">
            Activity
          </ToggleButton>
          <ToggleButton value="location">
            Location
          </ToggleButton>
          <ToggleButton value="department">
            Department
          </ToggleButton>
          <ToggleButton value="shiftDate">
            Date
          </ToggleButton>
          <ToggleButton value="flagged">
            Flagged
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {status && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {status}
        </Typography>
      )}

      {/* AG Grid with Material Theme */}
      <div
        className="ag-theme-material"
        style={{
          height: 500,
          width: "100%",
        }}
      >
        <AgGridReact<ActivityChange>
          ref={gridRef}
          rowData={data}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          onGridReady={onGridReady}
          animateRows={true}
          rowGroupPanelShow="always"
          groupDisplayType="groupRows"
          suppressAggFuncInHeader={true}
          rowSelection="multiple"
          groupDefaultExpanded={1}
          overlayNoRowsTemplate="<span style='padding: 10px;'>Click Search to load shifts</span>"
        />
      </div>
    </Paper>
  );
}
