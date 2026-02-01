import { useState, useCallback, useMemo } from "react";
import { Paper, Typography, Alert, Chip, Box, Tooltip, FormControlLabel, Switch } from "@mui/material";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import WarningIcon from "@mui/icons-material/Warning";
import BlockIcon from "@mui/icons-material/Block";
import { DataGrid, GridColDef } from "@mui/x-data-grid";
import ReportFilters from "./ReportFilters";
import { dataGridStyles } from "./dataGridStyles";
import { useConnectionStore } from "../../stores/connectionStore";
import { exportToExcel } from "../../core/export";
import { fetchCostCodes, getCostCodeStats, type CostCentre } from "../../hooks/useCostCodes";

interface CostCodeRow {
  id: number;
  code: string;
  description: string;
  active: boolean;
  hasDelimiter: boolean;
  validFrom: string;
  validTo: string;
  isExpired: boolean;
  isNotYetValid: boolean;
  validationStatus: string;
}

// Columns for export (simpler format)
const exportColumns: GridColDef<CostCodeRow>[] = [
  { field: "code", headerName: "Cost Code", width: 150 },
  { field: "description", headerName: "Description", flex: 1, minWidth: 200 },
  { field: "active", headerName: "Active", width: 80, type: "boolean" },
  { field: "hasDelimiter", headerName: "Has /", width: 80, type: "boolean" },
  { field: "validFrom", headerName: "Valid From", width: 120 },
  { field: "validTo", headerName: "Valid To", width: 120 },
  { field: "validationStatus", headerName: "Status", width: 130 },
];

export default function CostCodeReport() {
  const [data, setData] = useState<CostCodeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [showInvalidOnly, setShowInvalidOnly] = useState(false);
  const [stats, setStats] = useState<ReturnType<typeof getCostCodeStats> | null>(null);

  const { session } = useConnectionStore();

  // Build columns with validation status rendering
  const columns: GridColDef<CostCodeRow>[] = useMemo(() => [
    { field: "code", headerName: "Cost Code", width: 150 },
    { field: "description", headerName: "Description", flex: 1, minWidth: 200 },
    {
      field: "validationStatus",
      headerName: "Status",
      width: 160,
      renderCell: (params) => {
        const status = params.value as string;
        let color: "success" | "error" | "warning" | "default" = "default";
        let icon = null;
        let label = status;

        switch (status) {
          case "valid":
            color = "success";
            icon = <CheckCircleIcon fontSize="small" />;
            label = "Valid";
            break;
          case "expired":
            color = "error";
            icon = <ErrorIcon fontSize="small" />;
            label = "Expired";
            break;
          case "not_yet_valid":
            color = "warning";
            icon = <WarningIcon fontSize="small" />;
            label = "Not Yet Valid";
            break;
          case "missing_delimiter":
            color = "error";
            icon = <BlockIcon fontSize="small" />;
            label = "Missing /";
            break;
          case "inactive":
            color = "default";
            icon = <BlockIcon fontSize="small" />;
            label = "Inactive";
            break;
        }

        return (
          <Chip
            icon={icon || undefined}
            label={label}
            color={color}
            size="small"
            variant="outlined"
          />
        );
      },
    },
    {
      field: "hasDelimiter",
      headerName: "Has /",
      width: 90,
      renderCell: (params) => (
        <Chip
          label={params.value ? "Yes" : "No"}
          color={params.value ? "success" : "error"}
          size="small"
          variant="outlined"
        />
      ),
    },
    { field: "validFrom", headerName: "Valid From", width: 120 },
    { field: "validTo", headerName: "Valid To", width: 120 },
    {
      field: "active",
      headerName: "Active",
      width: 80,
      renderCell: (params) => (
        <Chip
          label={params.value ? "Yes" : "No"}
          color={params.value ? "success" : "default"}
          size="small"
          variant="outlined"
        />
      ),
    },
  ], []);

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

      // Fetch all cost codes (including inactive to show full picture)
      const costCodes = await fetchCostCodes({
        session: sessionData,
        activeOnly: false,
        onProgress: setStatus,
      });

      // Calculate stats
      const costCodeStats = getCostCodeStats(costCodes);
      setStats(costCodeStats);

      setStatus(`Processing ${costCodes.length} cost codes...`);

      // Transform to row format
      const rows: CostCodeRow[] = costCodes.map((cc: CostCentre) => ({
        id: cc.Id,
        code: cc.Code || "",
        description: cc.Description || "",
        active: cc.Active,
        hasDelimiter: cc.hasDelimiter ?? false,
        validFrom: cc.adhoc_From ? new Date(cc.adhoc_From).toLocaleDateString() : "",
        validTo: cc.adhoc_To ? new Date(cc.adhoc_To).toLocaleDateString() : "",
        isExpired: cc.isExpired ?? false,
        isNotYetValid: cc.isNotYetValid ?? false,
        validationStatus: cc.validationStatus || "valid",
      }));

      // Sort: invalid first, then by code
      rows.sort((a, b) => {
        // Invalid statuses first
        const aInvalid = a.validationStatus !== "valid";
        const bInvalid = b.validationStatus !== "valid";
        if (aInvalid !== bInvalid) return aInvalid ? -1 : 1;
        return a.code.localeCompare(b.code);
      });

      setData(rows);
      setStatus(`Found ${costCodes.length} cost codes (${costCodeStats.valid} valid, ${costCodes.length - costCodeStats.valid} with issues)`);
    } catch (err) {
      console.error("Search failed:", err);
      const message = err instanceof Error ? err.message : String(err);
      setError(message || "Failed to load cost codes");
    } finally {
      setLoading(false);
    }
  }, [session]);

  const handleExport = useCallback(async () => {
    const exportData = showInvalidOnly ? data.filter(r => r.validationStatus !== "valid") : data;
    if (exportData.length === 0) return;
    setStatus("Exporting to Excel...");
    const result = await exportToExcel(exportData, "Cost_Code_Validation_Report", exportColumns);
    if (result.success) {
      setStatus(result.message);
    } else {
      setError(result.message);
    }
  }, [data, showInvalidOnly]);

  // Filter data based on toggle
  const filteredData = useMemo(() => {
    if (showInvalidOnly) {
      return data.filter(r => r.validationStatus !== "valid");
    }
    return data;
  }, [data, showInvalidOnly]);

  return (
    <Paper sx={{ p: 1.5, height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
        <Typography variant="h6">Cost Code Validation Report</Typography>
        <Tooltip
          title={
            <>
              <strong>Purpose:</strong> Validate cost codes for payroll extraction.
              <br /><br />
              Checks that cost codes:
              <br />• Have "/" delimiter (required for SAP payroll)
              <br />• Are within their validity dates (adhoc_From/adhoc_To)
              <br />• Are marked as active
              <br /><br />
              <strong>Tip:</strong> Use "Show invalid only" to focus on issues.
            </>
          }
          arrow
        >
          <HelpOutlineIcon fontSize="small" color="action" sx={{ cursor: "help" }} />
        </Tooltip>
        {stats && (
          <>
            <Chip label={`${stats.total} total`} size="small" variant="outlined" />
            {stats.valid > 0 && (
              <Chip label={`${stats.valid} valid`} color="success" size="small" variant="outlined" />
            )}
            {stats.missingDelimiter > 0 && (
              <Chip label={`${stats.missingDelimiter} missing /`} color="error" size="small" variant="outlined" />
            )}
            {stats.expired > 0 && (
              <Chip label={`${stats.expired} expired`} color="error" size="small" variant="outlined" />
            )}
            {stats.notYetValid > 0 && (
              <Chip label={`${stats.notYetValid} not yet valid`} color="warning" size="small" variant="outlined" />
            )}
            {stats.inactive > 0 && (
              <Chip label={`${stats.inactive} inactive`} size="small" variant="outlined" />
            )}
          </>
        )}
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {status || "Validate cost codes for SAP payroll extraction."}
      </Typography>

      <ReportFilters
        onSearch={handleSearch}
        onExport={handleExport}
        loading={loading}
        hideDateFilters
      >
        <FormControlLabel
          control={
            <Switch
              checked={showInvalidOnly}
              onChange={(e) => setShowInvalidOnly(e.target.checked)}
              size="small"
            />
          }
          label="Show invalid only"
        />
      </ReportFilters>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <DataGrid
        rows={filteredData}
        columns={columns}
        loading={loading}
        pageSizeOptions={[25, 50, 100]}
        initialState={{
          pagination: { paginationModel: { pageSize: 50 } },
        }}
        disableRowSelectionOnClick
        getRowClassName={(params) => {
          if (params.row.validationStatus !== "valid") {
            return "row-invalid";
          }
          return "";
        }}
        sx={dataGridStyles}
      />
    </Paper>
  );
}
