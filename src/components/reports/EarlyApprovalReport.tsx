import { useState, useCallback, useMemo } from "react";
import { Paper, Typography, Alert, Chip, Box, Tooltip } from "@mui/material";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { DataGrid, GridColDef } from "@mui/x-data-grid";
import dayjs, { Dayjs } from "dayjs";
import ReportFilters from "./ReportFilters";
import { dataGridStylesNoPin } from "./dataGridStyles";
import { useConnectionStore } from "../../stores/connectionStore";
import { exportToExcel } from "../../core/export";
import { fetchEarlyApprovals, EarlyApprovalData } from "../../hooks/useEarlyApprovals";

interface EarlyApprovalRow {
  id: string;
  approvalId: number;
  staffName: string;
  staffUsername: string;
  shiftDate: string;
  shiftStart: string;
  shiftFinish: string;
  approvedAt: string;
  approvedBy: string;
  hoursBeforeShift: number;
  location: string;
  hours: number | null;
  notes: string;
}

// Columns for display and export
const baseColumns: GridColDef<EarlyApprovalRow>[] = [
  { field: "staffName", headerName: "Staff", width: 180 },
  { field: "staffUsername", headerName: "Username", width: 140 },
  { field: "location", headerName: "Location", width: 150 },
  { field: "shiftDate", headerName: "Shift Date", width: 110 },
  { field: "shiftStart", headerName: "Shift Start", width: 100 },
  { field: "shiftFinish", headerName: "Shift End", width: 100 },
  { field: "approvedAt", headerName: "Approved At", width: 160 },
  { field: "approvedBy", headerName: "Approved By", width: 150 },
  { field: "hoursBeforeShift", headerName: "Hours Early", width: 100, type: "number" },
  { field: "hours", headerName: "Duration", width: 90, type: "number" },
  { field: "notes", headerName: "Notes", flex: 1, minWidth: 150 },
];

export default function EarlyApprovalReport() {
  const [data, setData] = useState<EarlyApprovalRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [fromDate, setFromDate] = useState<Dayjs | null>(dayjs().startOf("month"));
  const [toDate, setToDate] = useState<Dayjs | null>(dayjs().endOf("month"));

  const { session } = useConnectionStore();

  // Build columns with warning highlighting for very early approvals
  const columns: GridColDef<EarlyApprovalRow>[] = useMemo(() => [
    ...baseColumns.slice(0, 8), // Up to approvedBy
    {
      field: "hoursBeforeShift",
      headerName: "Hours Early",
      width: 110,
      type: "number",
      renderCell: (params) => {
        const hours = params.value as number;
        // Flag if approved more than 24 hours early
        const isSevere = hours >= 24;
        return (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            {isSevere && <WarningAmberIcon color="warning" fontSize="small" />}
            <Chip
              label={`${hours.toFixed(1)}h`}
              color={isSevere ? "warning" : "default"}
              size="small"
              variant={isSevere ? "filled" : "outlined"}
            />
          </Box>
        );
      },
    },
    ...baseColumns.slice(9), // hours and notes
  ], []);

  const handleSearch = useCallback(async () => {
    if (!session) {
      setError("Not connected. Please connect first.");
      return;
    }

    if (!fromDate || !toDate) {
      setError("Please select a date range.");
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

      // Fetch early approvals
      const approvals = await fetchEarlyApprovals({
        session: sessionData,
        fromDate: fromDate.format("YYYY-MM-DD"),
        toDate: toDate.format("YYYY-MM-DD"),
        onProgress: setStatus,
      });

      setStatus(`Processing ${approvals.length} early approvals...`);

      // Transform to row format
      const rows: EarlyApprovalRow[] = approvals.map((approval: EarlyApprovalData) => {
        const attendance = approval.ScheduleShiftAttendanceObject;
        const user = attendance?.UserObject;
        const schedule = attendance?.Schedule;
        const location = schedule?.Location;

        const confirmedDate = approval.ConfirmedUTC ? new Date(approval.ConfirmedUTC) : null;
        const startDate = approval.StartTime ? new Date(approval.StartTime) : null;

        // Calculate hours before shift
        let hoursBeforeShift = 0;
        if (confirmedDate && startDate) {
          hoursBeforeShift = (startDate.getTime() - confirmedDate.getTime()) / (1000 * 60 * 60);
        }

        return {
          id: `${approval.Id}`,
          approvalId: approval.Id,
          staffName: user ? `${user.Forename || ""} ${user.Surname || ""}`.trim() : "Unknown",
          staffUsername: user?.Username || "",
          shiftDate: startDate ? dayjs(startDate).format("DD/MM/YYYY") : "",
          shiftStart: startDate ? dayjs(startDate).format("HH:mm") : "",
          shiftFinish: approval.FinishTime ? dayjs(approval.FinishTime).format("HH:mm") : "",
          approvedAt: confirmedDate ? dayjs(confirmedDate).format("DD/MM/YYYY HH:mm") : "",
          approvedBy: `User ${approval.ConfirmedBy || "Unknown"}`, // Would need another query for name
          hoursBeforeShift: Math.round(hoursBeforeShift * 10) / 10,
          location: location?.Description || "",
          hours: approval.Hours,
          notes: approval.Notes || "",
        };
      });

      // Sort by hours early (most early first)
      rows.sort((a, b) => b.hoursBeforeShift - a.hoursBeforeShift);

      setData(rows);
      setStatus(`Found ${rows.length} early approvals`);
    } catch (err) {
      console.error("Search failed:", err);
      const message = err instanceof Error ? err.message : String(err);
      setError(message || "Failed to load report data");
    } finally {
      setLoading(false);
    }
  }, [session, fromDate, toDate]);

  const handleExport = useCallback(async () => {
    if (data.length === 0) return;
    setStatus("Exporting to Excel...");
    const result = await exportToExcel(data, "Early_Approval_Report", baseColumns);
    if (result.success) {
      setStatus(result.message);
    } else {
      setError(result.message);
    }
  }, [data]);

  return (
    <Paper sx={{ p: 1.5, height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
        <Typography variant="h6">Early Approval Report</Typography>
        <Tooltip
          title={
            <>
              <strong>Purpose:</strong> Detect timesheets approved before the shift actually started.
              <br /><br />
              This highlights potential policy violations where approvals are given ahead of time,
              before work has been completed.
              <br /><br />
              <strong>Hours Early:</strong> Shows how many hours before the shift start the approval occurred.
              <br />
              <strong>Warning icon:</strong> Approvals more than 24 hours early are flagged.
            </>
          }
          arrow
        >
          <HelpOutlineIcon fontSize="small" color="action" sx={{ cursor: "help" }} />
        </Tooltip>
        {data.length > 0 && (
          <Chip label={`${data.length} early approvals`} color="warning" size="small" variant="outlined" />
        )}
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {status || "Find timesheets that were approved before the shift started."}
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

      <DataGrid
        rows={data}
        columns={columns}
        loading={loading}
        pageSizeOptions={[25, 50, 100]}
        initialState={{
          pagination: { paginationModel: { pageSize: 50 } },
        }}
        disableRowSelectionOnClick
        sx={dataGridStylesNoPin}
      />
    </Paper>
  );
}
