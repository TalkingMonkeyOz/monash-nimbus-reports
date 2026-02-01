import ExcelJS from "exceljs";
import { GridColDef } from "@mui/x-data-grid";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";

export interface ExportResult {
  success: boolean;
  message: string;
  filePath?: string;
}

/**
 * Export data to Excel file using Tauri's save dialog
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function exportToExcel<T extends Record<string, any>>(
  data: T[],
  filename: string,
  columns: GridColDef<T>[]
): Promise<ExportResult> {
  try {
    console.log(`[Export] Starting Excel export: ${data.length} rows, ${columns.length} columns`);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Report");

    // Add headers
    const headers = columns.map((col) => col.headerName || col.field);
    worksheet.addRow(headers);

    // Style headers
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF006DAE" }, // Monash Blue
    };
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };

    // Add data rows
    data.forEach((row) => {
      const rowData = columns.map((col) => {
        const value = row[col.field as keyof T];
        // Handle boolean values
        if (typeof value === "boolean") {
          return value ? "Yes" : "No";
        }
        return value ?? "";
      });
      worksheet.addRow(rowData);
    });

    // Auto-fit columns
    worksheet.columns.forEach((column) => {
      let maxLength = 10;
      column.eachCell?.({ includeEmpty: true }, (cell) => {
        const cellLength = cell.value ? String(cell.value).length : 0;
        if (cellLength > maxLength) {
          maxLength = Math.min(cellLength, 50);
        }
      });
      column.width = maxLength + 2;
    });

    // Generate buffer
    console.log("[Export] Generating Excel buffer...");
    const buffer = await workbook.xlsx.writeBuffer();
    console.log(`[Export] Buffer generated: ${buffer.byteLength} bytes`);

    // Use Tauri save dialog
    const defaultName = `${filename}_${new Date().toISOString().split("T")[0]}.xlsx`;
    console.log(`[Export] Opening save dialog with default: ${defaultName}`);

    const filePath = await save({
      defaultPath: defaultName,
      filters: [{ name: "Excel", extensions: ["xlsx"] }],
    });

    if (!filePath) {
      console.log("[Export] User cancelled save dialog");
      return { success: false, message: "Export cancelled" };
    }

    console.log(`[Export] Writing to: ${filePath}`);
    await writeFile(filePath, new Uint8Array(buffer));
    console.log("[Export] File written successfully");

    return {
      success: true,
      message: `Exported ${data.length} rows to ${filePath.split(/[/\\]/).pop()}`,
      filePath
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Export] Error:", message, error);
    return { success: false, message: `Export failed: ${message}` };
  }
}

export interface SheetDefinition {
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>[];
  columns: { field: string; headerName: string }[];
}

export interface UATSheetDefinition {
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>[];
  columns: { field: string; headerName: string }[];
  /** Field to use for linking (e.g., "Payroll" for user sheets) */
  linkField?: string;
}

/**
 * Export multiple sheets to a single Excel file
 */
export async function exportMultiSheetExcel(
  sheets: SheetDefinition[],
  filename: string
): Promise<ExportResult> {
  try {
    console.log(`[Export] Starting multi-sheet Excel export: ${sheets.length} sheets`);

    const workbook = new ExcelJS.Workbook();

    for (const sheet of sheets) {
      const worksheet = workbook.addWorksheet(sheet.name);

      // Add headers
      const headers = sheet.columns.map((col) => col.headerName || col.field);
      worksheet.addRow(headers);

      // Style headers
      const headerRow = worksheet.getRow(1);
      headerRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF006DAE" }, // Monash Blue
      };
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };

      // Add data rows
      sheet.data.forEach((row) => {
        const rowData = sheet.columns.map((col) => {
          const value = row[col.field];
          if (typeof value === "boolean") {
            return value ? "Yes" : "No";
          }
          return value ?? "";
        });
        worksheet.addRow(rowData);
      });

      // Auto-fit columns
      worksheet.columns.forEach((column) => {
        let maxLength = 10;
        column.eachCell?.({ includeEmpty: true }, (cell) => {
          const cellLength = cell.value ? String(cell.value).length : 0;
          if (cellLength > maxLength) {
            maxLength = Math.min(cellLength, 50);
          }
        });
        column.width = maxLength + 2;
      });

      console.log(`[Export] Added sheet "${sheet.name}" with ${sheet.data.length} rows`);
    }

    // Generate buffer
    console.log("[Export] Generating Excel buffer...");
    const buffer = await workbook.xlsx.writeBuffer();
    console.log(`[Export] Buffer generated: ${buffer.byteLength} bytes`);

    // Use Tauri save dialog
    const defaultName = `${filename}_${new Date().toISOString().split("T")[0]}.xlsx`;

    const filePath = await save({
      defaultPath: defaultName,
      filters: [{ name: "Excel", extensions: ["xlsx"] }],
    });

    if (!filePath) {
      return { success: false, message: "Export cancelled" };
    }

    await writeFile(filePath, new Uint8Array(buffer));

    const totalRows = sheets.reduce((sum, s) => sum + s.data.length, 0);
    return {
      success: true,
      message: `Exported ${totalRows} rows across ${sheets.length} sheets to ${filePath.split(/[/\\]/).pop()}`,
      filePath
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Export] Error:", message, error);
    return { success: false, message: `Export failed: ${message}` };
  }
}

/**
 * Export data to CSV file using Tauri's save dialog
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function exportToCSV<T extends Record<string, any>>(
  data: T[],
  filename: string,
  columns: GridColDef<T>[]
): Promise<ExportResult> {
  try {
    console.log(`[Export] Starting CSV export: ${data.length} rows`);

    const headers = columns.map((col) => col.headerName || col.field);

    const rows = data.map((row) => {
      return columns.map((col) => {
        const value = row[col.field as keyof T];
        // Handle values with commas or quotes
        const stringValue = value === null || value === undefined ? "" : String(value);
        if (stringValue.includes(",") || stringValue.includes('"') || stringValue.includes("\n")) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      });
    });

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.join(",")),
    ].join("\n");

    // Use Tauri save dialog
    const defaultName = `${filename}_${new Date().toISOString().split("T")[0]}.csv`;
    console.log(`[Export] Opening save dialog with default: ${defaultName}`);

    const filePath = await save({
      defaultPath: defaultName,
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });

    if (!filePath) {
      console.log("[Export] User cancelled save dialog");
      return { success: false, message: "Export cancelled" };
    }

    console.log(`[Export] Writing to: ${filePath}`);
    const encoder = new TextEncoder();
    await writeFile(filePath, encoder.encode(csvContent));
    console.log("[Export] File written successfully");

    return {
      success: true,
      message: `Exported ${data.length} rows to ${filePath.split(/[/\\]/).pop()}`,
      filePath
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Export] Error:", message, error);
    return { success: false, message: `Export failed: ${message}` };
  }
}

/**
 * Secondary sheet names for UAT Extract navigation links
 */
const UAT_SECONDARY_SHEETS = [
  "Location",
  "Employment Hours",
  "Employment Type",
  "Role",
  "Pay",
  "Variation",
  "Agreements",
  "Skill",
  "Cycle",
  "Cycle Details",
  "Security",
];

/**
 * Export UAT Extract with hyperlinks between sheets
 * - Staff Profile sheet has navigation columns linking to secondary sheets
 * - Secondary sheets have back links to Staff Profile
 * - Uses Payroll ID as the key for linking (column A on secondary sheets)
 */
export async function exportUATExtractExcel(
  sheets: UATSheetDefinition[],
  filename: string
): Promise<ExportResult> {
  try {
    console.log(`[Export] Starting UAT Extract Excel export: ${sheets.length} sheets`);

    const workbook = new ExcelJS.Workbook();
    const staffProfileSheet = sheets.find((s) => s.name === "Staff Profile");
    const payrollColIndex = staffProfileSheet?.columns.findIndex((c) => c.field === "Payroll") ?? -1;
    const payrollColLetter = payrollColIndex >= 0 ? String.fromCharCode(65 + payrollColIndex) : "F"; // Default to F

    // Process each sheet
    for (let sheetIndex = 0; sheetIndex < sheets.length; sheetIndex++) {
      const sheet = sheets[sheetIndex];
      const isStaffProfile = sheet.name === "Staff Profile";
      const worksheet = workbook.addWorksheet(sheet.name);

      if (isStaffProfile) {
        // Staff Profile: Headers in row 1, data starts row 2
        // Add navigation columns for linking to other sheets
        const navColumns = UAT_SECONDARY_SHEETS.map((name) => ({
          field: `nav_${name.replace(/\s+/g, "")}`,
          headerName: `→ ${name}`,
        }));

        const allColumns = [...sheet.columns, ...navColumns];
        const headers = allColumns.map((col) => col.headerName || col.field);
        worksheet.addRow(headers);

        // Style headers
        const headerRow = worksheet.getRow(1);
        headerRow.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF006DAE" }, // Monash Blue
        };
        headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };

        // Add data rows with hyperlink formulas
        sheet.data.forEach((row, rowIndex) => {
          const excelRow = rowIndex + 2; // Row 1 is headers
          const rowData: (string | number | { formula: string })[] = sheet.columns.map((col) => {
            const value = row[col.field];
            if (typeof value === "boolean") {
              return value ? "Yes" : "No";
            }
            return value ?? "";
          });

          // Add navigation formula cells
          UAT_SECONDARY_SHEETS.forEach((targetSheet) => {
            // Create HYPERLINK formula using MATCH to find Payroll ID
            // Formula: =IFERROR(HYPERLINK("#'Sheet'!A"&MATCH($F2,'Sheet'!$A:$A,0),"→"),"")
            rowData.push({
              formula: `IFERROR(HYPERLINK("#'${targetSheet}'!A"&MATCH($${payrollColLetter}${excelRow},'${targetSheet}'!$A:$A,0),"→"),"")`,
            });
          });

          worksheet.addRow(rowData);
        });

        // Style navigation columns
        const navStartCol = sheet.columns.length + 1;
        for (let i = 0; i < UAT_SECONDARY_SHEETS.length; i++) {
          const col = worksheet.getColumn(navStartCol + i);
          col.width = 12;
          col.eachCell((cell, rowNum) => {
            if (rowNum > 1) {
              cell.font = { color: { argb: "FF0066CC" }, underline: true };
            }
          });
        }
      } else {
        // Secondary sheets: Row 1 = back link, Row 2 = blank, Row 3 = headers, Data starts row 4

        // Row 1: Back navigation link
        const backCell = worksheet.getCell("A1");
        backCell.value = { formula: 'HYPERLINK("#\'Staff Profile\'!A1","← Back to Staff Profile")' };
        backCell.font = { color: { argb: "FF0066CC" }, underline: true };

        // Row 2: Blank separator (implicit)

        // Row 3: Headers - ensure Payroll/UserID is first column for MATCH
        const reorderedColumns = reorderColumnsWithPayrollFirst(sheet.columns, sheet.linkField || "UserID");
        const headers = reorderedColumns.map((col) => col.headerName || col.field);
        const headerRow = worksheet.getRow(3);
        headers.forEach((header, index) => {
          headerRow.getCell(index + 1).value = header;
        });
        headerRow.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF006DAE" },
        };
        headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };

        // Row 4+: Data
        sheet.data.forEach((row, rowIndex) => {
          const excelRow = worksheet.getRow(rowIndex + 4);
          reorderedColumns.forEach((col, colIndex) => {
            let value = row[col.field];
            if (typeof value === "boolean") {
              value = value ? "Yes" : "No";
            }
            excelRow.getCell(colIndex + 1).value = value ?? "";
          });
        });
      }

      // Auto-fit columns (with reasonable max width)
      worksheet.columns.forEach((column) => {
        let maxLength = 10;
        column.eachCell?.({ includeEmpty: true }, (cell) => {
          const cellLength = cell.value ? String(cell.value).length : 0;
          if (cellLength > maxLength) {
            maxLength = Math.min(cellLength, 40);
          }
        });
        column.width = maxLength + 2;
      });

      console.log(`[Export] Added sheet "${sheet.name}" with ${sheet.data.length} rows`);
    }

    // Generate buffer
    console.log("[Export] Generating Excel buffer...");
    const buffer = await workbook.xlsx.writeBuffer();
    console.log(`[Export] Buffer generated: ${buffer.byteLength} bytes`);

    // Use Tauri save dialog
    const defaultName = `${filename}_${new Date().toISOString().split("T")[0]}.xlsx`;

    const filePath = await save({
      defaultPath: defaultName,
      filters: [{ name: "Excel", extensions: ["xlsx"] }],
    });

    if (!filePath) {
      return { success: false, message: "Export cancelled" };
    }

    await writeFile(filePath, new Uint8Array(buffer));

    const totalRows = sheets.reduce((sum, s) => sum + s.data.length, 0);
    return {
      success: true,
      message: `Exported ${totalRows} rows across ${sheets.length} sheets to ${filePath.split(/[/\\]/).pop()}`,
      filePath,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Export] Error:", message, error);
    return { success: false, message: `Export failed: ${message}` };
  }
}

/**
 * Reorder columns to put the link field (Payroll or UserID) first
 * This ensures MATCH formula works correctly on secondary sheets
 */
function reorderColumnsWithPayrollFirst(
  columns: { field: string; headerName: string }[],
  linkField: string
): { field: string; headerName: string }[] {
  // Find Payroll column or fall back to UserID
  const payrollIndex = columns.findIndex(
    (c) => c.field === "Payroll" || c.field.toLowerCase() === "payroll"
  );
  const linkIndex = columns.findIndex((c) => c.field === linkField);

  const primaryIndex = payrollIndex >= 0 ? payrollIndex : linkIndex;

  if (primaryIndex <= 0) {
    return columns; // Already first or not found
  }

  // Move the link column to first position
  const reordered = [...columns];
  const [linkCol] = reordered.splice(primaryIndex, 1);
  reordered.unshift(linkCol);
  return reordered;
}
