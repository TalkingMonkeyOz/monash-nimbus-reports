import { useState, useCallback, useEffect, useMemo } from "react";
import { Paper, Typography, Alert, Chip, IconButton, Tooltip, Box, Stack, Divider, CircularProgress } from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import { DataGrid, GridColDef, GridRenderCellParams } from "@mui/x-data-grid";
import dayjs, { Dayjs } from "dayjs";
import ReportFilters from "./ReportFilters";
import { dataGridStyles } from "./dataGridStyles";
import LocationGroupFilter from "../filters/LocationGroupFilter";
import PersonLookupFilter from "../filters/PersonLookupFilter";
import { useConnectionStore } from "../../stores/connectionStore";
import { exportToExcel } from "../../core/export";
import { openNimbusSchedule } from "../../core/nimbusLinks";
import {
  loadLocations,
  loadUsers,
  loadDepartments,
  loadSchedules,
  getUserDisplayName,
  getLocationViaSchedule,
  getSchedule,
} from "../../core/lookupService";
import { fetchDeletedAgreementsWithShifts, fetchAgreementDetails } from "../../core/agreementService";
import {
  loadLocationGroupHierarchy,
  resolveLocationsForGroups,
  isHierarchyLoaded,
} from "../../core/locationGroupService";

interface DeletedAgreement {
  id: number;  // ScheduleShiftAgreement.Id (the link record ID)
  shiftId: number;
  ssaId: number;  // Same as id, for display column "SSA ID"
  agreementId: number | null;  // Agreement.Id (FK to Agreement table)
  sequence: number;  // Sequence within the shift (1, 2, 3...)
  shiftDate: string;
  shiftFrom: string;
  shiftTo: string;
  agreementDescription: string;
  location: string;
  locationId: number | null;
  shiftDescription: string;
  deletedBy: string;
  deletedByUserId: number | null;
  deletedDate: string;
  deletedDateRaw: string;  // ISO format for sorting
  scheduleId: number | null;
  isOrphaned: boolean;  // Shift was hard-deleted
}

// Column order per user spec: Shift ID, SSA ID, Sequence, Date, From, To, Agreement, Location, Shift, Deleted By, Deleted Date
const baseColumns: GridColDef<DeletedAgreement>[] = [
  { field: "shiftId", headerName: "Shift ID", width: 90 },
  { field: "ssaId", headerName: "SSA ID", width: 90, description: "ScheduleShiftAgreement ID (the deleted link record)" },
  { field: "sequence", headerName: "Seq", width: 50, description: "Sequence within the shift (deletion order)" },
  { field: "shiftDate", headerName: "Date", width: 110 },
  { field: "shiftFrom", headerName: "From", width: 80 },
  { field: "shiftTo", headerName: "To", width: 80 },
  { field: "agreementDescription", headerName: "Agreement", width: 180 },
  { field: "location", headerName: "Location", width: 140 },
  { field: "shiftDescription", headerName: "Shift", flex: 1, minWidth: 200 },
  { field: "deletedBy", headerName: "Deleted By", width: 180 },
  { field: "deletedDate", headerName: "Deleted Date", width: 140 },
];

export default function DeletedAgreementsReport() {
  const { session } = useConnectionStore();

  // State
  const [fromDate, setFromDate] = useState<Dayjs | null>(dayjs().subtract(30, "day"));
  const [toDate, setToDate] = useState<Dayjs | null>(dayjs());
  const [data, setData] = useState<DeletedAgreement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");

  // Location group filter state
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);
  const [selectedLocationIds, setSelectedLocationIds] = useState<number[]>([]);
  const [hierarchyLoaded, setHierarchyLoaded] = useState(false);

  // Person filter state (filter by who deleted)
  const [deletedByUserId, setDeletedByUserId] = useState<number | null>(null);

  // Load location group hierarchy
  useEffect(() => {
    if (session && !hierarchyLoaded) {
      const sessionData = {
        base_url: session.base_url,
        auth_mode: session.auth_mode,
        user_id: session.user_id,
        auth_token: session.auth_token,
        app_token: session.app_token,
        username: session.username,
      };
      loadLocationGroupHierarchy(sessionData, setStatus).then(() => {
        setHierarchyLoaded(true);
      });
    }
  }, [session, hierarchyLoaded]);

  // Handle location group selection change
  const handleLocationSelectionChange = useCallback((groupIds: number[], locationIds: number[]) => {
    setSelectedGroupIds(groupIds);
    setSelectedLocationIds(locationIds);
  }, []);

  // Build columns with action column
  const columns: GridColDef<DeletedAgreement>[] = useMemo(() => [
    {
      field: "actions",
      headerName: "",
      width: 40,
      sortable: false,
      filterable: false,
      disableColumnMenu: true,
      renderCell: (params: GridRenderCellParams<DeletedAgreement>) => (
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
    {
      field: "status",
      headerName: "",
      width: 80,
      sortable: false,
      renderCell: (params: GridRenderCellParams<DeletedAgreement>) => (
        params.row.isOrphaned ? (
          <Tooltip title="Agreement link exists but the shift was hard-deleted from the database">
            <Chip label="Orphan" color="warning" size="small" />
          </Tooltip>
        ) : null
      ),
    },
    ...baseColumns,
  ], [session]);

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

      // Resolve location IDs from selected groups
      const resolvedLocationIds = new Set<number>();
      if (selectedGroupIds.length > 0 && isHierarchyLoaded()) {
        const fromGroups = resolveLocationsForGroups(selectedGroupIds);
        fromGroups.forEach(lid => resolvedLocationIds.add(lid));
      }
      selectedLocationIds.forEach(lid => resolvedLocationIds.add(lid));
      const locationIdsArray = [...resolvedLocationIds];

      console.log(`[DEBUG] Resolved ${locationIdsArray.length} location IDs:`, locationIdsArray);

      // SINGLE CALL: Fetch shifts with $expand=Agreements($filter=Deleted eq true)
      // Returns both deleted agreement links AND shift details in one request!
      setStatus("Fetching deleted agreements...");
      const { deletedLinks, shiftDetails: shiftDetailsMap } = await fetchDeletedAgreementsWithShifts(
        sessionData,
        fromDate,
        toDate,
        setStatus,
        locationIdsArray.length > 0 ? locationIdsArray : undefined
      );

      console.log(`Found ${deletedLinks.length} deleted agreement links`);

      if (deletedLinks.length === 0) {
        setData([]);
        setStatus("No deleted agreements found for the selected criteria");
        return;
      }

      // Load lookup data for user names and locations
      setStatus("Loading lookup data...");
      await loadUsers(sessionData);
      await loadLocations(sessionData);
      await loadDepartments(sessionData);

      // Fetch agreement descriptions (still needed separately)
      const agreementIds = [...new Set(deletedLinks.map(l => l.agreementId).filter(id => id > 0))];
      const agreementDetailsMap = await fetchAgreementDetails(sessionData, agreementIds, setStatus);

      // Load schedules for location lookup
      const scheduleIds = [...shiftDetailsMap.values()]
        .map(s => s.scheduleId)
        .filter((id): id is number => id != null && id > 0);
      if (scheduleIds.length > 0) {
        await loadSchedules(sessionData, [...new Set(scheduleIds)]);
      }

      // Transform to display format
      let transformed: DeletedAgreement[] = deletedLinks.map((link, index) => {
        const shift = shiftDetailsMap.get(link.scheduleShiftId);
        const agreement = agreementDetailsMap.get(link.agreementId);
        const schedule = getSchedule(shift?.scheduleId);

        return {
          id: link.id || index,
          shiftId: link.scheduleShiftId,
          ssaId: link.id,  // ScheduleShiftAgreement.Id for display
          agreementId: link.agreementId,
          sequence: 0, // Will be set per-shift below
          shiftDate: shift?.startTime ? dayjs(shift.startTime).format("DD/MM/YYYY") : "",
          shiftFrom: shift?.startTime ? dayjs(shift.startTime).format("HH:mm") : "",
          shiftTo: shift?.finishTime ? dayjs(shift.finishTime).format("HH:mm") : "",
          agreementDescription: agreement?.description || `Agreement ${link.agreementId}`,
          location: getLocationViaSchedule(shift?.scheduleId),
          locationId: schedule?.locationId || null,
          shiftDescription: shift?.description || `[Shift ${link.scheduleShiftId}]`,
          deletedBy: getUserDisplayName(link.updatedBy),
          deletedByUserId: link.updatedBy || null,
          deletedDate: link.updatedDate ? dayjs(link.updatedDate).format("DD/MM/YYYY HH:mm") : "",
          deletedDateRaw: link.updatedDate || "",
          scheduleId: shift?.scheduleId || null,
          isOrphaned: !shift,
        };
      });

      // Apply client-side filters
      if (resolvedLocationIds.size > 0) {
        transformed = transformed.filter(item =>
          item.locationId !== null && resolvedLocationIds.has(item.locationId)
        );
      }
      if (deletedByUserId !== null) {
        transformed = transformed.filter(item => item.deletedByUserId === deletedByUserId);
      }

      // Group by shiftId and assign sequence numbers within each shift
      // Sort by shiftId first, then by deletedDateRaw within each shift
      transformed.sort((a, b) => {
        if (a.shiftId !== b.shiftId) return a.shiftId - b.shiftId;
        if (!a.deletedDateRaw && !b.deletedDateRaw) return 0;
        if (!a.deletedDateRaw) return 1;
        if (!b.deletedDateRaw) return -1;
        return a.deletedDateRaw.localeCompare(b.deletedDateRaw);
      });

      // Assign sequence numbers per shift
      let currentShiftId = -1;
      let sequenceInShift = 0;
      transformed.forEach(item => {
        if (item.shiftId !== currentShiftId) {
          currentShiftId = item.shiftId;
          sequenceInShift = 1;
        } else {
          sequenceInShift++;
        }
        item.sequence = sequenceInShift;
      });

      setData(transformed);
      const orphanedCount = transformed.filter(t => t.isOrphaned).length;
      let statusMsg = `Found ${transformed.length} deleted agreements`;
      if (orphanedCount > 0) {
        statusMsg += ` (${orphanedCount} orphaned)`;
      }
      if (resolvedLocationIds.size > 0) {
        statusMsg += ` for ${resolvedLocationIds.size} location(s)`;
      }
      setStatus(statusMsg);
    } catch (err) {
      console.error("Search failed:", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [session, fromDate, toDate, selectedGroupIds, selectedLocationIds, deletedByUserId]);

  // Columns for export
  const exportColumns: GridColDef<DeletedAgreement>[] = useMemo(() => baseColumns, []);

  const handleExport = useCallback(async () => {
    if (data.length === 0) return;
    setStatus("Exporting to Excel...");
    const result = await exportToExcel(data, "Deleted_Agreements_Report", exportColumns);
    if (result.success) {
      setStatus(result.message);
    } else {
      setError(result.message);
    }
  }, [data, exportColumns]);

  return (
    <Paper sx={{ p: 1.5, height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
        <Typography variant="h6">
          Deleted Agreements Report
        </Typography>
        <Tooltip
          title={
            <>
              <strong>Purpose:</strong> Track when agreements are removed from shifts.
              <br /><br />
              Helps identify potential payroll issues where someone might remove a higher-paying agreement.
              <br /><br />
              <strong>Sequence #:</strong> Order of deletion within each shift (1 = first deleted).
            </>
          }
          arrow
        >
          <HelpOutlineIcon fontSize="small" color="action" sx={{ cursor: "help" }} />
        </Tooltip>
      </Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2, minHeight: 24 }}>
        {loading && <CircularProgress size={16} />}
        <Typography variant="body2" color={loading ? "primary" : "text.secondary"}>
          {status || "Track agreement deletions and identify who performed them."}
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
      />

      {/* Filters */}
      <Stack direction="row" spacing={2} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
        <LocationGroupFilter
          selectedGroupIds={selectedGroupIds}
          selectedLocationIds={selectedLocationIds}
          onSelectionChange={handleLocationSelectionChange}
          disabled={loading || !hierarchyLoaded}
          loaded={hierarchyLoaded}
          showLocations
          size="small"
          minWidth={320}
          label="Filter by Location/Group"
        />
        <PersonLookupFilter
          value={deletedByUserId}
          onChange={setDeletedByUserId}
          label="Deleted By"
          placeholder="Search who deleted..."
          disabled={loading}
          size="small"
          minWidth={280}
        />
      </Stack>

      <Divider sx={{ mb: 1 }} />

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
          sorting: { sortModel: [{ field: "shiftId", sort: "asc" }] },
        }}
        disableRowSelectionOnClick
        sx={dataGridStyles}
      />
    </Paper>
  );
}
