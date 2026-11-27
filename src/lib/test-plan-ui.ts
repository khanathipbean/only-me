import type { Tone } from "@/components/ui/Badge";
import type { TestPlanStatus } from "@/generated/prisma/client";

/**
 * How a plan's status is written and coloured.
 *
 * Its own file, importing nothing that reaches Prisma, so a server page and a
 * client component can both read it — the same reason `file-size.ts` exists.
 *
 * The tones are the app's own: blue for work in hand, green for finished,
 * amber for paused, grey for not started. None of them is a test result, and
 * none borrows red: a plan is never failing, only the cases under it are.
 */
export function planStatusLabel(status: TestPlanStatus): string {
  switch (status) {
    case "IN_PROGRESS":
      return "In Progress";
    case "COMPLETED":
      return "Completed";
    case "ON_HOLD":
      return "On Hold";
    default:
      return "Draft";
  }
}

export function planStatusTone(status: TestPlanStatus): Tone {
  switch (status) {
    case "IN_PROGRESS":
      return "blue";
    case "COMPLETED":
      return "green";
    case "ON_HOLD":
      return "amber";
    default:
      return "gray";
  }
}
