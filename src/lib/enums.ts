import type { Priority, ProjectStatus, TestResult, TestType, WorkflowStatus } from "@/generated/prisma/client";

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
  { value: "DEV", label: "Dev" },
];

/** QA_LEAD and VIEWER hidden for now: TESTER covers everything QA_LEAD did
 * (see `EDITOR_ROLES`) and ADMIN covers everything VIEWER did plus more, so
 * neither is offered for a new or changed assignment. */
export const ASSIGNABLE_PROJECT_ROLE_OPTIONS = PROJECT_ROLE_OPTIONS.filter(
  (option) => option.value === "ADMIN" || option.value === "TESTER" || option.value === "DEV",
);

export const TEST_TYPE_OPTIONS = [
  { value: "", label: "—" },
  { value: "POSITIVE", label: "Positive" },
  { value: "NEGATIVE", label: "Negative" },
  { value: "BOUNDARY", label: "Boundary" },
];

export const PROJECT_STATUS_VALUES: ProjectStatus[] = ["DRAFT", "ACTIVE", "COMPLETED"];

export const TEST_TYPE_VALUES: TestType[] = ["POSITIVE", "NEGATIVE", "BOUNDARY"];

/** What a form sent for a field it had no business sending. */
export class ChoiceError extends Error {}

/**
 * Reads one of a fixed set of values off a form.
 *
 * Every one of these fields used to be written `formData.get("status") as
 * never`, which is not a check — it silences the compiler and hands whatever
 * arrived straight to Prisma, which then throws its own
 * `Invalid project.create() invocation`. The pages catch their own
 * `ValidationError` and nothing else, so that throw went all the way out and
 * the reader got a crash page instead of a sentence.
 *
 * Nothing in the interface offers a wrong value, so reaching this needs a
 * hand-written POST or an edited dropdown. That is the point: it is the only
 * door nobody was watching.
 */
export function readChoice<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): T {
  const candidate = typeof value === "string" ? value : "";
  if ((allowed as readonly string[]).includes(candidate)) {
    return candidate as T;
  }
  throw new ChoiceError(`${label} must be one of: ${allowed.join(", ")}`);
}

/** The same, for a field that is allowed to be left empty. */
export function readOptionalChoice<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): T | null {
  const candidate = typeof value === "string" ? value : "";
  return candidate === "" ? null : readChoice(value, allowed, label);
}

/**
 * The same values read as a filter, where a wrong one is not worth an error.
 *
 * Narrowing a list is a request, not an instruction: `?status=NONSENSE` means
 * the caller asked for something that cannot exist, and the honest answer is
 * the unnarrowed list rather than a five hundred. These used to be cast
 * straight into a `where` clause, where Prisma threw on the enum and the
 * whole page went down over a mistyped URL.
 */
export function readFilterChoice<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

/**
 * The same, for a JSON body where leaving a field out means "do not change
 * it" rather than "set it to nothing".
 *
 * The distinction matters and is easy to lose: `readChoice` treats a missing
 * field as wrong, which is right for a form that always submits its select
 * and wrong for a PATCH that names only what it touches. Tightening the API
 * routes with the strict reader broke thirty-three tests in one go, all of
 * them creating something without naming a status it was happy to default.
 *
 * Absent, null and blank all mean the same thing here — not provided — and
 * anything else still has to be a value the column can hold.
 */
export function readChoiceIfPresent<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): T | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  return readChoice(value, allowed, label);
}
