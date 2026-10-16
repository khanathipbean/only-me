import { parse as parseCsvSync } from "csv-parse/sync";
import ExcelJS from "exceljs";

export const IMPORT_COLUMNS = [
  "Project Code",
  "Module",
  "Requirement Name",
  "Scenario Name",
  "Test Group Name",
  "Test Case Name",
  "Preconditions",
  "Test Steps",
  "Expected Result",
  "Priority",
  "Scenario Description",
  "Scenario Preconditions",
  "Scenario Expected Result",
  "Test Group Objective",
  "Requirement Code",
  "Requirement Description",
  "Requirement Feature",
] as const;

export type ImportRow = {
  /** The line this came from in the file the reader is looking at, counting
   *  the header row and any blank lines. It used to be the position among the
   *  rows that survived parsing, so a sheet with a header and one blank line
   *  reported "Row 2" for what the reader would find on line 4 — and this
   *  number is what every error message and the remove-row button point at. */
  rowNumber: number;
  projectCode: string;
  /** Optional: the Module and Requirement the Scenario is filed under. A
   * sheet written before those levels existed leaves them blank and the
   * import parks the rows under "Unassigned", the same name the backfill
   * used, rather than refusing a CSV that used to be valid. */
  moduleName: string;
  requirementName: string;
  scenarioName: string;
  testGroupName: string;
  testCaseName: string;
  preconditions: string;
  testSteps: string;
  expectedResult: string;
  priority: string;
  /** Only applied when this row is the one that creates a new Scenario/Test Group
   * (find-or-create) — ignored once that container already exists, same as
   * Scenario Name/Test Group Name being redundantly repeated across every row. */
  scenarioDescription: string;
  scenarioPreconditions: string;
  scenarioExpectedResult: string;
  testGroupObjective: string;
  /** Unlike the Scenario/Test Group fields above, these are applied to an
   * existing Requirement too, not only to the row that creates one: a sheet is
   * how these are maintained, so a second import is how a correction arrives.
   * A blank cell still means "leave it alone" — an older sheet without these
   * columns reads as three empty strings, and must not wipe what is there. */
  requirementCode: string;
  requirementDescription: string;
  requirementFeature: string;
};

/**
 * Source spreadsheets often type a numbered list ("1. Do X 2. Do Y 3. Do Z")
 * into a single cell with no line breaks at all — Excel only inserts a real
 * newline on Alt+Enter, which most people typing a quick list don't use. Left
 * as-is, that renders as one run-on line ("...Do X2. Do Y3. Do Z..."). If the
 * cell has no newlines already, split it into one line per detected "N."
 * marker; a cell that already has real line breaks is left untouched.
 */
function splitNumberedSteps(text: string): string {
  if (!text || text.includes("\n")) {
    return text;
  }
  const parts = text.split(/(?=\d+\.\s*)/g).filter((part) => part.trim());
  return parts.length > 1 ? parts.map((part) => part.trim()).join("\n") : text;
}

function toRow(rowNumber: number, record: Record<string, unknown>): ImportRow {
  const get = (key: string) => String(record[key] ?? "").trim();
  return {
    rowNumber,
    projectCode: get("Project Code"),
    moduleName: get("Module"),
    requirementName: get("Requirement Name"),
    scenarioName: get("Scenario Name"),
    testGroupName: get("Test Group Name"),
    testCaseName: get("Test Case Name"),
    preconditions: get("Preconditions"),
    testSteps: splitNumberedSteps(get("Test Steps")),
    expectedResult: get("Expected Result"),
    priority: get("Priority"),
    scenarioDescription: get("Scenario Description"),
    scenarioPreconditions: get("Scenario Preconditions"),
    scenarioExpectedResult: get("Scenario Expected Result"),
    testGroupObjective: get("Test Group Objective"),
    requirementCode: get("Requirement Code"),
    requirementDescription: get("Requirement Description"),
    requirementFeature: get("Requirement Feature"),
  };
}

function parseCsvBuffer(buffer: Buffer): ImportRow[] {
  /* `info: true` so each record carries the line it was read from. Without it
   * all we have is the index among the records that survived, which is not
   * the number the reader can act on. */
  const records: Array<{ record: Record<string, unknown>; info: { lines: number } }> = parseCsvSync(
    buffer,
    { columns: true, skip_empty_lines: true, trim: true, info: true },
  );
  return records.map(({ record, info }) => toRow(info.lines, record));
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
    /* `rowIndex` is the sheet's own row number, which is what the reader sees
     * down the side of the spreadsheet. */
    rows.push(toRow(rowIndex, record));
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

/* A comma, a quote or a newline in a value all break a bare CSV field. The
 * old version quoted on a comma alone and left an embedded quote to corrupt
 * the row — nothing in the example trips that today, which is the moment to
 * fix it rather than the moment after. */
const NEEDS_QUOTING = /["\r\n,]/;

export function generateImportTemplateCsv(): string {
  const header = IMPORT_COLUMNS.join(",");
  // Positional: this row must line up with IMPORT_COLUMNS above.
  /* One value per column, checked by a test rather than by counting them
   * here: three were missing, and the three missing ones were exactly the
   * Requirement fields that a sheet is the way to maintain. */
  const example = [
    "PRJ-001",
    "Authentication",
    "REQ-001 Users can sign in",
    "Login Flow",
    "Functional",
    "Valid login redirects to dashboard",
    "User has a valid account",
    "Enter valid credentials and click Login",
    "User is redirected to the dashboard",
    "HIGH",
    "User can log in and is denied access appropriately when credentials are invalid",
    "User is on the Login page",
    "Valid credentials reach the dashboard; invalid or missing credentials are rejected with a clear message",
    "Covers the Login page's core functional flow",
    "REQ-001",
    "Signing in is the gate to everything else, so it is covered first",
    "Authentication",
  ]
    .map((value) =>
      NEEDS_QUOTING.test(value) ? `"${value.replaceAll('"', '""')}"` : value,
    )
    .join(",");
  return `${header}\n${example}\n`;
}

/* `parseTestSteps` lives in `./steps` rather than here: the import preview in
 * the browser needs it, and this module imports `exceljs` and `csv-parse`,
 * which a client component has no business pulling in. */

