/**
 * Shared DataGrid styling for consistent appearance across all reports
 *
 * Features:
 * - Sticky column headers with highlighting
 * - Optional sticky first column (actions) with border
 * - Horizontal scroll enabled with always-visible scrollbar
 * - Row highlighting for flagged/invalid rows
 */

import { SxProps, Theme } from "@mui/material";

/**
 * Base styles shared by all DataGrid variants
 */
const baseStyles: SxProps<Theme> = {
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
  // Enable horizontal scrolling with always-visible scrollbar
  "& .MuiDataGrid-virtualScroller": {
    overflowX: "auto",
  },
  // Ensure horizontal scrollbar is always visible at the bottom of the grid
  "& .MuiDataGrid-scrollbar--horizontal": {
    display: "block",
    position: "sticky",
    bottom: 0,
    zIndex: 2,
  },
  // Main container should allow scrollbar to be visible
  "& .MuiDataGrid-main": {
    overflow: "visible",
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
 * Standard DataGrid sx props for reports WITH an actions column
 * The first column (actions) is pinned/sticky for easy access while scrolling
 */
export const dataGridStyles: SxProps<Theme> = {
  ...baseStyles,
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
};

/**
 * DataGrid sx props for reports WITHOUT an actions column
 * No column pinning - all columns scroll together
 */
export const dataGridStylesNoPin: SxProps<Theme> = {
  ...baseStyles,
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
