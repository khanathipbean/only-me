import { prisma } from "@/lib/prisma";
import type { Prisma, TestResult } from "@/generated/prisma/client";

/**
 * One result per Test Case across several rounds.
 *
 * A case can be tested more than once — in six sprints of a phase, or in the
 * rounds under one plan — and carry a different result each time. The rule is
 * the one `TestCase.testResult` itself follows: the newest round to actually
 * report wins, and a case every round left NOT_RUN stays NOT_RUN. Rounds come
 * oldest first so each later report simply overwrites the one before it.
 *
 * The keys are the membership as well as the results: a case with no entry
 * here was never scheduled into any of these rounds at all.
 *
 * Live rounds only, for the reason the coverage count learned the hard way:
 * an archived round still owns its `TestRunCase` rows, and counting those
 * once left 142 cases "scheduled" while the rounds on screen covered 21.
 *
 * Shared by the Dashboard, which asks it of a phase, and by a Test Plan,
 * which asks it of the rounds linked to it. Two copies of this rule would be
 * two answers to "did this case pass", and the pages would disagree in front
 * of whoever had both open.
 */
export async function resolveLatestResults(
  where: Prisma.TestRunWhereInput,
): Promise<Map<string, TestResult>> {
  const rows = await prisma.testRunCase.findMany({
    where: { testRun: { deletedAt: null, ...where } },
    select: { testCaseId: true, testResult: true },
    orderBy: { testRun: { createdAt: "asc" } },
  });

  const resolved = new Map<string, TestResult>();
  for (const row of rows) {
    if (!resolved.has(row.testCaseId) || row.testResult !== "NOT_RUN") {
      resolved.set(row.testCaseId, row.testResult);
    }
  }
  return resolved;
}

/** The rounds of one phase. */
export function phaseResults(projectId: string, phase: string) {
  return resolveLatestResults({ projectId, phase });
}

/** The rounds under one plan. */
export function planResults(testPlanId: string) {
  return resolveLatestResults({ testPlanId });
}
