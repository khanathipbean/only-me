import type { TestStepInput } from "@/lib/test-cases";

/** Parses the TestStepEditor's hidden JSON field, dropping fully-empty rows. */
export function parseStepsJson(raw: string): TestStepInput[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed
    .filter(
      (item): item is TestStepInput =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as TestStepInput).step === "string" &&
        typeof (item as TestStepInput).expectedResult === "string",
    )
    .filter((item) => item.step.trim() !== "" || item.expectedResult.trim() !== "");
}
