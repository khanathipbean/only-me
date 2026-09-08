import type { ImportRow } from "@/lib/import/parse";

export type RowValidationError = { field: string; reason: string };

export type ValidatedRow = {
  rowNumber: number;
  data: ImportRow;
  errors: RowValidationError[];
  valid: boolean;
};

const REQUIRED_FIELDS: { key: keyof ImportRow; label: string }[] = [
  { key: "projectCode", label: "Project Code" },
  { key: "scenarioName", label: "Scenario Name" },
  { key: "testGroupName", label: "Test Group Name" },
  { key: "testCaseName", label: "Test Case Name" },
  { key: "testSteps", label: "Test Steps" },
  { key: "expectedResult", label: "Expected Result" },
];

export const VALID_PRIORITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;

/** Pure: no I/O. Field-presence and format checks only — no DB duplicate lookup. */
export function validateRow(row: ImportRow, expectedProjectCode: string): ValidatedRow {
  const errors: RowValidationError[] = [];

  for (const { key, label } of REQUIRED_FIELDS) {
    if (!row[key]) {
      errors.push({ field: label, reason: `${label} is required` });
    }
  }

  if (row.projectCode && row.projectCode !== expectedProjectCode) {
    errors.push({
      field: "Project Code",
      reason: `"${row.projectCode}" does not match the selected project ("${expectedProjectCode}")`,
    });
  }

  if (row.priority && !VALID_PRIORITIES.includes(row.priority.toUpperCase() as never)) {
    errors.push({
      field: "Priority",
      reason: `must be one of ${VALID_PRIORITIES.join(", ")}`,
    });
  }

  return { rowNumber: row.rowNumber, data: row, errors, valid: errors.length === 0 };
}

export function normalizePriority(priority: string): (typeof VALID_PRIORITIES)[number] {
  const upper = priority.toUpperCase();
  return (VALID_PRIORITIES as readonly string[]).includes(upper)
    ? (upper as (typeof VALID_PRIORITIES)[number])
    : "MEDIUM";
}
