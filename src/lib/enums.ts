import type { Priority, TestResult, WorkflowStatus } from "@/generated/prisma/client";

/**
 * Pure enum-value lists, deliberately kept in a module with no server-only
 * imports (no `@/lib/prisma`) so client components can safely import from
 * here without pulling the `pg` driver into the browser bundle.
 */
export const TEST_RESULT_VALUES: TestResult[] = [
  "NOT_RUN",
  "PASSED",
  "FAILED",
  "BLOCKED",
  "SKIPPED",
];

export const PRIORITY_VALUES: Priority[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

export const WORKFLOW_STATUS_VALUES: WorkflowStatus[] = [
  "DRAFT",
  "READY",
  "IN_PROGRESS",
  "COMPLETED",
];

/**
 * The same lists with display labels, shaped for `Select`'s `options` prop —
 * one source of truth for every dropdown instead of each form repeating its
 * own <option> list. Filters prepend their own "All" entry; the forms use
 * these as-is.
 */
export const TEST_RESULT_OPTIONS = [
  { value: "NOT_RUN", label: "Not Run" },
  { value: "PASSED", label: "Passed" },
  { value: "FAILED", label: "Failed" },
  { value: "BLOCKED", label: "Blocked" },
  { value: "SKIPPED", label: "Skipped" },
];

export const PRIORITY_OPTIONS = [
  { value: "CRITICAL", label: "Critical" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
];

export const WORKFLOW_STATUS_OPTIONS = [
  { value: "DRAFT", label: "Draft" },
  { value: "READY", label: "Ready" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "COMPLETED", label: "Completed" },
];

/** Projects have their own narrower status set (no IN_PROGRESS/READY). */
export const PROJECT_STATUS_OPTIONS = [
  { value: "DRAFT", label: "Draft" },
  { value: "ACTIVE", label: "Active" },
  { value: "COMPLETED", label: "Completed" },
];

/** Every role the enum still allows — kept around only so a Project Member
 * already holding QA_LEAD or VIEWER still renders and stays selectable on
 * their own row. New assignments pick from `ASSIGNABLE_PROJECT_ROLE_OPTIONS`
 * instead. */
export const PROJECT_ROLE_OPTIONS = [
  { value: "ADMIN", label: "Admin" },
  { value: "QA_LEAD", label: "QA Lead" },
  { value: "TESTER", label: "Tester" },
  { value: "VIEWER", label: "Viewer" },
];

/** QA_LEAD and VIEWER hidden for now: TESTER covers everything QA_LEAD did
 * (see `EDITOR_ROLES`) and ADMIN covers everything VIEWER did plus more, so
 * neither is offered for a new or changed assignment. */
export const ASSIGNABLE_PROJECT_ROLE_OPTIONS = PROJECT_ROLE_OPTIONS.filter(
  (option) => option.value === "ADMIN" || option.value === "TESTER",
);

export const TEST_TYPE_OPTIONS = [
  { value: "", label: "—" },
  { value: "POSITIVE", label: "Positive" },
  { value: "NEGATIVE", label: "Negative" },
  { value: "BOUNDARY", label: "Boundary" },
];
