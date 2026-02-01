import { useState, useCallback, useMemo } from "react";
import { Paper, Typography, Alert, Chip, Box, Tooltip, FormControlLabel, Switch } from "@mui/material";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import { DataGrid, GridColDef } from "@mui/x-data-grid";
import ReportFilters from "./ReportFilters";
import { dataGridStylesNoPin } from "./dataGridStyles";
import { useConnectionStore } from "../../stores/connectionStore";
import { exportToExcel } from "../../core/export";
import { fetchUsersWithSecurityRoles, UserSecurityRoleData } from "../../hooks/useUserSecurityRoles";

interface UserSecurityRoleRow {
  id: number;
  username: string;
  fullName: string;
  payroll: string;
  active: boolean;
  rosterable: boolean;
  securityRole: string;
  securityRoleLocation: string;
  securityRoleLocationGroup: string;
}

// Columns for display and export
const baseColumns: GridColDef<UserSecurityRoleRow>[] = [
  { field: "username", headerName: "Username", width: 140 },
  { field: "fullName", headerName: "Name", width: 180 },
  { field: "payroll", headerName: "Payroll", width: 100 },
  { field: "securityRole", headerName: "Security Role", flex: 1, minWidth: 150 },
  { field: "securityRoleLocation", headerName: "Location", width: 150 },
  { field: "securityRoleLocationGroup", headerName: "Location Group", width: 160 },
  { field: "rosterable", headerName: "Rosterable", width: 100, type: "boolean" },
  { field: "active", headerName: "Active", width: 80, type: "boolean" },
];

export default function UserSecurityRolesReport() {
  const [data, setData] = useState<UserSecurityRoleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [activeOnly, setActiveOnly] = useState(true);
  const [rosterableOnly, setRosterableOnly] = useState(false);

  const { session } = useConnectionStore();

  // Build columns with chip rendering for boolean fields
  const columns: GridColDef<UserSecurityRoleRow>[] = useMemo(() => [
    ...baseColumns.slice(0, 6), // All columns before rosterable
    {
      field: "rosterable",
      headerName: "Rosterable",
      width: 100,
      renderCell: (params) => (
        <Chip
          label={params.value ? "Yes" : "No"}
          color={params.value ? "success" : "default"}
          size="small"
          variant="outlined"
        />
      ),
    },
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

      // Fetch security roles (single OData query with $expand)
      const securityRoles = await fetchUsersWithSecurityRoles({
        session: sessionData,
        activeOnly,
        onProgress: setStatus,
      });

      setStatus(`Processing ${securityRoles.length} security role assignments...`);

      // Transform to row format - one row per security role assignment
      let rows: UserSecurityRoleRow[] = securityRoles.map((sr: UserSecurityRoleData) => ({
        id: sr.Id,
        username: sr.UserObject?.Username || "",
        fullName: `${sr.UserObject?.Forename || ""} ${sr.UserObject?.Surname || ""}`.trim(),
        payroll: sr.UserObject?.Payroll || "",
        active: sr.UserObject?.Active ?? false,
        rosterable: sr.UserObject?.Rosterable ?? false,
        securityRole: sr.SecurityRole?.Description || "",
        securityRoleLocation: sr.LocationObject?.Description || "",
        securityRoleLocationGroup: sr.LocationGroupObject?.Description || "",
      }));

      // Apply rosterable filter if enabled
      if (rosterableOnly) {
        rows = rows.filter(r => r.rosterable);
      }

      // Sort by username, then security role
      rows.sort((a, b) => {
        const usernameCompare = a.username.localeCompare(b.username);
        if (usernameCompare !== 0) return usernameCompare;
        return a.securityRole.localeCompare(b.securityRole);
      });

      setData(rows);
      const uniqueUsers = new Set(rows.map(r => r.username)).size;
      setStatus(`Found ${rows.length} security role assignments for ${uniqueUsers} users`);
    } catch (err) {
      console.error("Search failed:", err);
      const message = err instanceof Error ? err.message : String(err);
      setError(message || "Failed to load report data");
    } finally {
      setLoading(false);
    }
  }, [session, activeOnly, rosterableOnly]);

  const handleExport = useCallback(async () => {
    if (data.length === 0) return;
    setStatus("Exporting to Excel...");
    const result = await exportToExcel(data, "User_Security_Roles_Report", baseColumns);
    if (result.success) {
      setStatus(result.message);
    } else {
      setError(result.message);
    }
  }, [data]);

  const uniqueUserCount = new Set(data.map(r => r.username)).size;

  return (
    <Paper sx={{ p: 1.5, height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
        <Typography variant="h6">User Security Roles Report</Typography>
        <Tooltip
          title={
            <>
              <strong>Purpose:</strong> View user security role assignments.
              <br /><br />
              Shows which security roles each user has, including the location/location group
              scope for each role.
              <br /><br />
              <strong>Tip:</strong> Use filters to focus on active or rosterable users only.
            </>
          }
          arrow
        >
          <HelpOutlineIcon fontSize="small" color="action" sx={{ cursor: "help" }} />
        </Tooltip>
        {uniqueUserCount > 0 && (
          <Chip label={`${uniqueUserCount} users`} color="primary" size="small" variant="outlined" />
        )}
        {data.length > 0 && (
          <Chip label={`${data.length} roles`} size="small" variant="outlined" />
        )}
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {status || "View user security roles and their location scope."}
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
              checked={activeOnly}
              onChange={(e) => setActiveOnly(e.target.checked)}
              size="small"
            />
          }
          label="Active users only"
        />
        <FormControlLabel
          control={
            <Switch
              checked={rosterableOnly}
              onChange={(e) => setRosterableOnly(e.target.checked)}
              size="small"
            />
          }
          label="Rosterable only"
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
        sx={dataGridStylesNoPin}
      />
    </Paper>
  );
}
