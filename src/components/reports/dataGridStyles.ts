/**
 * Shared DataGrid styling for consistent appearance across all reports
 *
 * Features:
 * - Sticky column headers with highlighting
 * - Sticky first column (actions) with border
 * - Horizontal scroll enabled
 * - Row highlighting for flagged/invalid rows
 */

import { SxProps, Theme } from "@mui/material";

/**
 * Standard DataGrid sx props for all reports
 * Includes:
 * - Column header styling (grey background, blue border, bold text)
 * - Sticky first column for action buttons
 * - Proper horizontal scroll handling
 * - Support for row highlighting classes
 */
export const dataGridStyles: SxProps<Theme> = {
  flex: 1,
  minHeight: 400,
  // Column header styling - sticky with visual distinction
  "& .MuiDataGrid-columnHeaders": {
    backgroundColor: "#f5f5f5",
    borderBottom: "2px solid #1976d2",
    position: "sticky",
    top: 0,
    zIndex: 2,
  },
  "& .MuiDataGrid-columnHeaderTitle": {
    fontWeight: 600,
  },
  // Enable horizontal scrolling
  "& .MuiDataGrid-virtualScroller": {
    overflowX: "auto",
  },
  "& .MuiDataGrid-scrollbar--horizontal": {
    display: "block",
  },
  // Pin first column (actions) - sticky with border
  "& .MuiDataGrid-cell:first-of-type, & .MuiDataGrid-columnHeader:first-of-type": {
    position: "sticky",
    left: 0,
    backgroundColor: "#fff",
    zIndex: 1,
    borderRight: "1px solid rgba(224, 224, 224, 1)",
  },
  // Ensure pinned header cell stays on top
  "& .MuiDataGrid-columnHeader:first-of-type": {
    zIndex: 3,
    backgroundColor: "#f5f5f5",
  },
  // Row highlighting classes
  "& .flagged-row": {
    backgroundColor: "rgba(211, 47, 47, 0.08)",
  },
  "& .warning-row": {
    backgroundColor: "rgba(237, 108, 2, 0.08)",
  },
  "& .row-invalid": {
    backgroundColor: "rgba(211, 47, 47, 0.04)",
  },
};

/**
 * Standard column widths for consistency across reports
 */
export const columnWidths = {
  /** Action buttons column */
  actions: 50,
  /** Date field (DD/MM/YYYY) */
  date: 110,
  /** Time field (HH:mm) */
  time: 80,
  /** Location name */
  location: 140,
  /** Person name */
  personName: 180,
  /** Department name */
  department: 140,
  /** ID fields (no comma formatting) */
  id: 90,
  /** Status chips */
  status: 100,
  /** Description/notes - use flex for these */
  descriptionMinWidth: 150,
  /** Short code fields */
  shortCode: 100,
  /** Date + time combined (DD/MM/YYYY HH:mm) */
  dateTime: 140,
};

/**
 * Standard pagination configuration
 */
export const paginationConfig = {
  pageSizeOptions: [25, 50, 100],
  initialPageSize: 50,
};
