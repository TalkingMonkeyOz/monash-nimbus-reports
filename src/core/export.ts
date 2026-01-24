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
