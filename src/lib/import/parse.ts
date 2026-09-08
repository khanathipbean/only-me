import { parse as parseCsvSync } from "csv-parse/sync";
import ExcelJS from "exceljs";

export const IMPORT_COLUMNS = [
  "Project Code",
  "Scenario Name",
  "Test Group Name",
  "Test Case Name",
  "Preconditions",
  "Test Steps",
  "Expected Result",
  "Priority",
] as const;

export type ImportRow = {
  rowNumber: number;
  projectCode: string;
  scenarioName: string;
  testGroupName: string;
  testCaseName: string;
  preconditions: string;
  testSteps: string;
  expectedResult: string;
  priority: string;
};

function toRow(rowNumber: number, record: Record<string, unknown>): ImportRow {
  const get = (key: string) => String(record[key] ?? "").trim();
  return {
    rowNumber,
    projectCode: get("Project Code"),
    scenarioName: get("Scenario Name"),
    testGroupName: get("Test Group Name"),
    testCaseName: get("Test Case Name"),
    preconditions: get("Preconditions"),
    testSteps: get("Test Steps"),
    expectedResult: get("Expected Result"),
    priority: get("Priority"),
  };
}

function parseCsvBuffer(buffer: Buffer): ImportRow[] {
  const records: Record<string, unknown>[] = parseCsvSync(buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
  return records.map((record, index) => toRow(index + 1, record));
}

async function parseXlsxBuffer(buffer: Buffer): Promise<ImportRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return [];
  }

  const headers: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber - 1] = cell.text.trim();
  });

  const rows: ImportRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowIndex) => {
    if (rowIndex === 1) {
      return;
    }
    const record: Record<string, unknown> = {};
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const header = headers[colNumber - 1];
      if (header) {
        record[header] = cell.text;
      }
    });
    rows.push(toRow(rows.length + 1, record));
  });
  return rows;
}

export function isSupportedImportFile(fileName: string) {
  return /\.(csv|xlsx)$/i.test(fileName);
}

export async function parseImportFile(buffer: Buffer, fileName: string): Promise<ImportRow[]> {
  if (/\.xlsx$/i.test(fileName)) {
    return parseXlsxBuffer(buffer);
  }
  return parseCsvBuffer(buffer);
}

export function generateImportTemplateCsv(): string {
  const header = IMPORT_COLUMNS.join(",");
  const example = [
    "PRJ-001",
    "Login Flow",
    "Functional",
    "Valid login redirects to dashboard",
    "User has a valid account",
    "Enter valid credentials and click Login",
    "User is redirected to the dashboard",
    "HIGH",
  ]
    .map((value) => (value.includes(",") ? `"${value}"` : value))
    .join(",");
  return `${header}\n${example}\n`;
}
