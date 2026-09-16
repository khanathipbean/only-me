/**
 * Gives the results that already exist somewhere to live once results belong
 * to a round rather than to the Test Case itself. Without this the history
 * would start empty and every past result would look like it never happened.
 *
 * Idempotent: the Baseline round is keyed by name per project, and cases are
 * added only if they aren't in it yet.
 */
import { prisma } from "../src/lib/prisma";

const BASELINE_NAME = "Baseline";

async function main() {
  const projects = await prisma.project.findMany({ select: { id: true, name: true } });
  const actor = await prisma.user.findFirstOrThrow({ select: { id: true } });

  for (const project of projects) {
    const testCases = await prisma.testCase.findMany({
      where: {
        deletedAt: null,
        testGroup: { deletedAt: null, scenario: { projectId: project.id, deletedAt: null } },
      },
      select: { id: true, testResult: true, notes: true, updatedAt: true, updatedById: true },
    });

    if (testCases.length === 0) {
      console.log(`${project.name}: no test cases, skipped`);
      continue;
    }

    const run =
      (await prisma.testRun.findUnique({
        where: { projectId_name: { projectId: project.id, name: BASELINE_NAME } },
      })) ??
      (await prisma.testRun.create({
        data: {
          projectId: project.id,
          name: BASELINE_NAME,
          // Closed from the start: it records what was already true rather
          // than inviting more results into it.
          status: "CLOSED",
          closedAt: new Date(),
          createdById: actor.id,
        },
      }));

    const alreadyIn = await prisma.testRunCase.findMany({
      where: { testRunId: run.id },
      select: { testCaseId: true },
    });
    const have = new Set(alreadyIn.map((row) => row.testCaseId));
    const missing = testCases.filter((testCase) => !have.has(testCase.id));

    if (missing.length > 0) {
      // One insert, not one per case: a project with hundreds of cases would
      // otherwise be hundreds of round trips to a remote database.
      await prisma.testRunCase.createMany({
        data: missing.map((testCase) => ({
          testRunId: run.id,
          testCaseId: testCase.id,
          testResult: testCase.testResult,
          notes: testCase.notes,
          // Only a case with a result was actually run by someone.
          ranById: testCase.testResult === "NOT_RUN" ? null : testCase.updatedById,
          ranAt: testCase.testResult === "NOT_RUN" ? null : testCase.updatedAt,
        })),
      });
    }

    console.log(
      `${project.name}: Baseline holds ${have.size + missing.length} case(s) (${missing.length} added now)`,
    );
  }

  // The guard mirrors the selection above: a Test Case whose Scenario or Test
  // Group is archived is already invisible in the app, and pulling it into a
  // round would put it back in front of people as work to do.
  const liveChain = {
    deletedAt: null,
    testGroup: { deletedAt: null, scenario: { deletedAt: null } },
  } as const;

  const missed = await prisma.testCase.count({ where: { ...liveChain, runCases: { none: {} } } });
  if (missed > 0) {
    throw new Error(`${missed} Test Case(s) with a live chain are still in no round.`);
  }

  const underArchived = await prisma.testCase.count({
    where: {
      deletedAt: null,
      runCases: { none: {} },
      OR: [{ testGroup: { deletedAt: { not: null } } }, { testGroup: { scenario: { deletedAt: { not: null } } } }],
    },
  });
  console.log("Every Test Case with a live chain is in at least one round.");
  if (underArchived > 0) {
    console.log(
      `Left out on purpose: ${underArchived} Test Case(s) sitting under an archived Scenario or Test Group.`,
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
