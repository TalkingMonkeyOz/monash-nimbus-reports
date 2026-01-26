import { useState, useCallback, useEffect, useMemo } from "react";
import { Paper, Typography, Alert, FormControlLabel, Checkbox, Chip, IconButton, Tooltip, Box, Stack, Divider } from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import { DataGrid, GridColDef, GridRenderCellParams } from "@mui/x-data-grid";
import dayjs, { Dayjs } from "dayjs";
import ReportFilters from "./ReportFilters";
import LocationGroupFilter from "../filters/LocationGroupFilter";
import PersonLookupFilter from "../filters/PersonLookupFilter";
import AgreementTypeFilter from "../filters/AgreementTypeFilter";
import { useConnectionStore } from "../../stores/connectionStore";
import { exportToExcel } from "../../core/export";
import { openNimbusSchedule } from "../../core/nimbusLinks";
import { fetchEmptyShifts } from "../../hooks/useScheduleShifts";
import {
  loadLocations,
  loadUsers,
  loadDepartments,
  loadSchedules,
  loadAgreementTypes,
  getUserDisplayName,
  getDepartment,
  getScheduleDateRange,
  getLocationViaSchedule,
  getUserFullName,
  getSchedule,
} from "../../core/lookupService";
import { fetchDeletedAgreementLinks, fetchShiftDetails, fetchAgreementDetails } from "../../core/agreementService";
import {
  loadLocationGroupHierarchy,
  resolveLocationsForGroups,
  isHierarchyLoaded,
} from "../../core/locationGroupService";

interface DeletedAgreement {
  id: number;
  shiftId: number;
  shiftStatus: "Deleted" | "Empty" | "Orphaned";
  agreementId: number | null;
  agreementDescription: string;
  syllabusPlus: string;
  allocatedUser: string;
  shiftDescription: string;
  shiftDate: string;
  shiftFrom: string;
  shiftTo: string;
  location: string;
  locationId: number | null;
  department: string;
  scheduleId: number | null;
  scheduleDateRange: string;
  deletedBy: string;
  deletedByUserId: number | null;
  deletedDate: string;
}

// Base columns without the action column (for export)
// Date columns first for easier scanning, then key identifiers, then details
const baseColumns: GridColDef<DeletedAgreement>[] = [
  { field: "shiftDate", headerName: "Date", width: 100 },
  { field: "shiftFrom", headerName: "From", width: 60 },
  { field: "shiftTo", headerName: "To", width: 60 },
  { field: "shiftId", headerName: "Shift ID", width: 85, type: "number", description: "Sort by this column to group agreements from the same shift" },
  { field: "agreementDescription", headerName: "Agreement", width: 180 },
  { field: "syllabusPlus", headerName: "Syllabus Plus", width: 140 },
  { field: "allocatedUser", headerName: "Allocated To", width: 180 },
  { field: "shiftDescription", headerName: "Shift", flex: 1, minWidth: 150 },
  { field: "location", headerName: "Location", width: 120 },
  { field: "department", headerName: "Department", width: 120 },
  { field: "scheduleId", headerName: "Schedule ID", width: 85, type: "number" },
  { field: "scheduleDateRange", headerName: "Schedule Period", width: 140 },
  { field: "deletedBy", headerName: "Deleted By", width: 200 },
  { field: "deletedDate", headerName: "Deleted Date", width: 140 },
];

export default function DeletedAgreementsReport() {
  const { session } = useConnectionStore();

  // State with sensible defaults (no auto-restore to avoid infinite loops)
  const [fromDate, setFromDate] = useState<Dayjs | null>(dayjs().subtract(30, "day"));
  const [toDate, setToDate] = useState<Dayjs | null>(dayjs());
  const [data, setData] = useState<DeletedAgreement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [includeEmptyShifts, setIncludeEmptyShifts] = useState(false);

  // Location group filter state
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);
  const [selectedLocationIds, setSelectedLocationIds] = useState<number[]>([]);
  const [hierarchyLoaded, setHierarchyLoaded] = useState(false);

  // Person filter state (filter by who deleted)
  const [deletedByUserId, setDeletedByUserId] = useState<number | null>(null);

  // Agreement type filter state
  const [selectedAgreementTypeIds, setSelectedAgreementTypeIds] = useState<number[]>([]);
  const [excludedAgreementTypeIds, setExcludedAgreementTypeIds] = useState<number[]>([]);
  const [agreementTypesLoaded, setAgreementTypesLoaded] = useState(false);

  // Note: Auto-save removed to prevent infinite loops. Use Report Preferences for persistent settings.

  // Load location group hierarchy and agreement types
  useEffect(() => {
    if (session && !hierarchyLoaded) {
      const sessionData = {
        base_url: session.base_url,
        user_id: session.user_id,
        auth_token: session.auth_token,
      };
      loadLocationGroupHierarchy(sessionData, setStatus).then(() => {
        setHierarchyLoaded(true);
      });
    }
  }, [session, hierarchyLoaded]);

  useEffect(() => {
    if (session && !agreementTypesLoaded) {
      const sessionData = {
        base_url: session.base_url,
        user_id: session.user_id,
        auth_token: session.auth_token,
      };
      loadAgreementTypes(sessionData).then(() => {
        setAgreementTypesLoaded(true);
      });
    }
  }, [session, agreementTypesLoaded]);

  // Handle location group selection change
  const handleLocationSelectionChange = useCallback((groupIds: number[], locationIds: number[]) => {
    setSelectedGroupIds(groupIds);
    setSelectedLocationIds(locationIds);
  }, []);

  // Build columns with action column that uses session for Nimbus links
  const columns: GridColDef<DeletedAgreement>[] = useMemo(() => [
    {
      field: "actions",
      headerName: "",
      width: 50,
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
      field: "shiftStatus",
      headerName: "Status",
      width: 110,
      type: "singleSelect",
      valueOptions: ["Deleted", "Empty", "Orphaned"],
      renderCell: (params: GridRenderCellParams<DeletedAgreement>) => {
        const status = params.value as string;
        const color = status === "Orphaned" ? "secondary" : status === "Deleted" ? "error" : "warning";
        const tooltip = status === "Orphaned"
          ? "Agreement link exists but the shift was hard-deleted from the database"
          : status === "Deleted"
          ? "Agreement was removed from this shift"
          : "Shift has no person allocated";
        return (
          <Tooltip title={tooltip}>
            <Chip label={status} color={color} size="small" />
          </Tooltip>
        );
      },
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
        user_id: session.user_id,
        auth_token: session.auth_token,
      };

      // Fetch DELETED ScheduleShiftAgreement records (agreements removed from shifts)
      setStatus("Fetching deleted agreements...");
      const deletedLinks = await fetchDeletedAgreementLinks(
        sessionData,
        fromDate,
        toDate,
        setStatus
      );

      console.log(`Found ${deletedLinks.length} deleted agreement links in date range`);
      if (deletedLinks.length > 0) {
        console.log(`Sample link:`, deletedLinks[0]);
      }

      // Optionally fetch empty/unallocated shifts
      let emptyShifts: Awaited<ReturnType<typeof fetchEmptyShifts>> = [];
      if (includeEmptyShifts) {
        setStatus("Fetching empty shifts...");
        emptyShifts = await fetchEmptyShifts({
          session: sessionData,
          fromDate,
          toDate,
          onProgress: setStatus,
        });
        console.log(`Found ${emptyShifts.length} empty shifts in date range`);
      }

      // Collect unique IDs for batch lookups
      const shiftIds = [...new Set(deletedLinks.map(l => l.scheduleShiftId).filter(id => id > 0))];
      const agreementIds = [...new Set(deletedLinks.map(l => l.agreementId).filter(id => id > 0))];
      console.log(`Unique shift IDs: ${shiftIds.length}, first 5:`, shiftIds.slice(0, 5));
      console.log(`Unique agreement IDs: ${agreementIds.length}, first 5:`, agreementIds.slice(0, 5));
      const emptyShiftScheduleIds = [...new Set(emptyShifts.map(s => s.ScheduleID).filter((id): id is number => id != null && id > 0))];

      // Load lookup data
      setStatus("Loading users...");
      await loadUsers(sessionData);
      setStatus("Loading locations...");
      await loadLocations(sessionData);
      setStatus("Loading departments...");
      await loadDepartments(sessionData);

      // Fetch shift details for the deleted agreement links
      const shiftDetailsMap = await fetchShiftDetails(sessionData, shiftIds, setStatus);

      // Fetch agreement details
      const agreementDetailsMap = await fetchAgreementDetails(sessionData, agreementIds, setStatus);

      // Collect schedule IDs for schedule lookups
      const scheduleIdsFromShifts = [...shiftDetailsMap.values()]
        .map(s => s.scheduleId)
        .filter((id): id is number => id != null && id > 0);
      const allScheduleIds = [...new Set([...scheduleIdsFromShifts, ...emptyShiftScheduleIds])];

      if (allScheduleIds.length > 0) {
        setStatus("Loading schedules...");
        await loadSchedules(sessionData, allScheduleIds);
      }

      // Resolve location IDs from selected groups
      const resolvedLocationIds = new Set<number>();
      if (selectedGroupIds.length > 0 && isHierarchyLoaded()) {
        const fromGroups = resolveLocationsForGroups(selectedGroupIds);
        fromGroups.forEach(lid => resolvedLocationIds.add(lid));
      }
      // Add individually selected locations
      selectedLocationIds.forEach(lid => resolvedLocationIds.add(lid));

      // Transform deleted agreement links - ONE ROW PER DELETED AGREEMENT
      const transformedDeleted: DeletedAgreement[] = deletedLinks.map((link, index) => {
        const shift = shiftDetailsMap.get(link.scheduleShiftId);
        const agreement = agreementDetailsMap.get(link.agreementId);

        // Get location ID via schedule
        const schedule = getSchedule(shift?.scheduleId);
        const locationId = schedule?.locationId || null;

        // Detect orphaned records - agreement link exists but shift was hard-deleted
        const isOrphaned = !shift;

        return {
          id: link.id || index,
          shiftId: link.scheduleShiftId,
          shiftStatus: isOrphaned ? "Orphaned" as const : "Deleted" as const,
          agreementId: link.agreementId,
          agreementDescription: agreement?.description || `Agreement ${link.agreementId}`,
          syllabusPlus: shift?.syllabusPlus || "",
          allocatedUser: isOrphaned ? "(Shift deleted)" : getUserFullName(shift?.userId),
          shiftDescription: isOrphaned ? `[Shift ID: ${link.scheduleShiftId}]` : (shift?.description || ""),
          shiftDate: shift?.startTime ? dayjs(shift.startTime).format("DD/MM/YYYY") : "",
          shiftFrom: shift?.startTime ? dayjs(shift.startTime).format("HH:mm") : "",
          shiftTo: shift?.finishTime ? dayjs(shift.finishTime).format("HH:mm") : "",
          location: getLocationViaSchedule(shift?.scheduleId),
          locationId,
          department: getDepartment(shift?.departmentId),
          scheduleId: shift?.scheduleId || null,
          scheduleDateRange: getScheduleDateRange(shift?.scheduleId),
          deletedBy: getUserDisplayName(link.updatedBy),
          deletedByUserId: link.updatedBy || null,
          deletedDate: link.updatedDate ? dayjs(link.updatedDate).format("DD/MM/YYYY HH:mm") : "",
        };
      });

      // Transform empty shifts
      const transformedEmpty: DeletedAgreement[] = emptyShifts.map((item, index) => {
        const schedule = getSchedule(item.ScheduleID);
        return {
          id: item.Id || (index + 100000),
          shiftId: item.Id,
          shiftStatus: "Empty" as const,
          agreementId: null,
          agreementDescription: "",
          syllabusPlus: item.adhoc_SyllabusPlus || "",
          allocatedUser: "",
          shiftDescription: item.Description || "",
          shiftDate: item.StartTime ? dayjs(item.StartTime).format("DD/MM/YYYY") : "",
          shiftFrom: item.StartTime ? dayjs(item.StartTime).format("HH:mm") : "",
          shiftTo: item.FinishTime ? dayjs(item.FinishTime).format("HH:mm") : "",
          location: getLocationViaSchedule(item.ScheduleID),
          locationId: schedule?.locationId || null,
          department: getDepartment(item.DepartmentID),
          scheduleId: item.ScheduleID || null,
          scheduleDateRange: getScheduleDateRange(item.ScheduleID),
          deletedBy: "",
          deletedByUserId: null,
          deletedDate: "",
        };
      });

      // Combine both
      let combined = [...transformedDeleted, ...transformedEmpty];

      // Apply filters
      // 1. Location filter (using resolved location IDs from groups)
      if (resolvedLocationIds.size > 0) {
        combined = combined.filter(item =>
          item.locationId !== null && resolvedLocationIds.has(item.locationId)
        );
      }

      // 2. Deleted by person filter
      if (deletedByUserId !== null) {
        combined = combined.filter(item => item.deletedByUserId === deletedByUserId);
      }

      // 3. Agreement type filter (include only selected types)
      if (selectedAgreementTypeIds.length > 0) {
        combined = combined.filter(item =>
          item.agreementId !== null && selectedAgreementTypeIds.includes(item.agreementId)
        );
      }

      // 4. Excluded agreement types
      if (excludedAgreementTypeIds.length > 0) {
        combined = combined.filter(item =>
          item.agreementId === null || !excludedAgreementTypeIds.includes(item.agreementId)
        );
      }

      setData(combined);
      const deletedCount = combined.filter(f => f.shiftStatus === "Deleted").length;
      const orphanedCount = combined.filter(f => f.shiftStatus === "Orphaned").length;
      const emptyCount = combined.filter(f => f.shiftStatus === "Empty").length;

      let statusMsg = `Found ${deletedCount} deleted agreements`;
      if (orphanedCount > 0) {
        statusMsg += `, ${orphanedCount} orphaned (shift hard-deleted)`;
      }
      if (includeEmptyShifts) {
        statusMsg += `, ${emptyCount} empty shifts`;
      }
      if (resolvedLocationIds.size > 0) {
        statusMsg += ` (filtered by ${resolvedLocationIds.size} locations)`;
      }
      setStatus(statusMsg);
    } catch (err) {
      console.error("Search failed:", err);
      const message = err instanceof Error ? err.message : String(err);
      setError(message || "Failed to load report data");
    } finally {
      setLoading(false);
    }
  }, [session, fromDate, toDate, selectedGroupIds, selectedLocationIds, deletedByUserId, selectedAgreementTypeIds, excludedAgreementTypeIds, includeEmptyShifts]);

  // Columns for export (exclude action buttons, include status)
  const exportColumns: GridColDef<DeletedAgreement>[] = useMemo(() => [
    { field: "shiftStatus", headerName: "Status", width: 100 },
    ...baseColumns,
  ], []);

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
              <strong>Problem it solves:</strong> "Who removed this agreement from a shift? Was it a mistake or fraud?"
              <br /><br />
              Tracks when agreements are removed from shifts. This helps identify potential payroll issues where someone might remove an agreement that pays more and replace it with one that pays less.
              <br /><br />
              <strong>Note:</strong> One row per deleted agreement. A shift may appear multiple times if multiple agreements were removed.
              <br /><br />
              <strong>Tip:</strong> Click the arrow icon to open the schedule in Nimbus.
            </>
          }
          arrow
        >
          <HelpOutlineIcon fontSize="small" color="action" sx={{ cursor: "help" }} />
        </Tooltip>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {status || "Track agreement deletions and identify who performed them."}
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

      {/* Advanced Filters */}
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
        <AgreementTypeFilter
          selectedIds={selectedAgreementTypeIds}
          onChange={setSelectedAgreementTypeIds}
          excludedIds={excludedAgreementTypeIds}
          onExcludedChange={setExcludedAgreementTypeIds}
          vacantShiftId={1} // Vacant Shift agreement ID (confirmed from DB)
          disabled={loading || !agreementTypesLoaded}
          loaded={agreementTypesLoaded}
          size="small"
          minWidth={280}
          label="Agreement Types"
          mode="include"
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
          pagination: { paginationModel: { pageSize: 25 } },
        }}
        disableRowSelectionOnClick
        sx={{
          flex: 1,
          minHeight: 400,
          // Fix horizontal scroll - ensure scrollbar is always visible
          "& .MuiDataGrid-virtualScroller": {
            overflowX: "auto",
          },
          "& .MuiDataGrid-scrollbar--horizontal": {
            display: "block",
          },
        }}
      />
    </Paper>
  );
}
