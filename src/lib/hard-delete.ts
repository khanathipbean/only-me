import { prisma } from "@/lib/prisma";
import { deleteFile } from "@/lib/storage";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Deleting a level of the hierarchy for real, with everything beneath it.
 *
 * Until now "Delete" set `deletedAt` — byte for byte what "Archive" does, the
 * only difference being the word written to the audit log. The confirmation
 * said "This cannot be undone from the UI" while the row reappeared under the
 * Archived filter with a Restore button beside it.
 *
 * No `onDelete` is declared anywhere in the schema, so Prisma leaves required
 * relations on Restrict and the database refuses to delete a parent while
 * children point at it. Descendants are therefore deleted explicitly, deepest
 * first, which is also the honest way round: what is destroyed is written out
 * here rather than hidden in a migration.
 *
 * Archived descendants go too. They are part of the subtree whatever their
 * `deletedAt` says, and leaving them would strand rows under a parent that no
 * longer exists.
 *
 * AuditLog rows are deliberately untouched: `entityId` is a plain string with
 * no foreign key, so the history of a deleted entity survives it. That is the
 * only record left that it was ever there.
 */
type Tx = Prisma.TransactionClient;

export type PurgeCounts = {
  requirements: number;
  scenarios: number;
  testGroups: number;
  testCases: number;
};

const NOTHING: PurgeCounts = { requirements: 0, scenarios: 0, testGroups: 0, testCases: 0 };

/** Storage objects belonging to the deleted rows. Removed after the
 *  transaction commits — an object store is not part of it, and a failure
 *  there must not undo a delete the database has already accepted. */
type Purged = { counts: PurgeCounts; storageKeys: string[] };

async function purgeTestCases(tx: Tx, testCaseIds: string[]): Promise<Purged> {
  if (testCaseIds.length === 0) {
    return { counts: NOTHING, storageKeys: [] };
  }

  const attachments = await tx.attachment.findMany({
    where: {
      OR: [
        { testCaseId: { in: testCaseIds } },
        // A round's own evidence, attached to its TestRunCase rather than the
        // Test Case itself — about to be deleted below, and just as unreachable
        // via its own foreign key without this.
        { runCase: { testCaseId: { in: testCaseIds } } },
      ],
    },
    select: { storageKey: true },
  });

  await tx.testStep.deleteMany({ where: { testCaseId: { in: testCaseIds } } });
  await tx.attachment.deleteMany({
    where: {
      OR: [{ testCaseId: { in: testCaseIds } }, { runCase: { testCaseId: { in: testCaseIds } } }],
    },
  });
  // A Test Case's result in every round it was ever part of. Nothing else
  // holds that, so deleting the case really does discard its history.
  await tx.testRunCase.deleteMany({ where: { testCaseId: { in: testCaseIds } } });
  await tx.testCase.deleteMany({ where: { id: { in: testCaseIds } } });

  return {
    counts: { ...NOTHING, testCases: testCaseIds.length },
    storageKeys: attachments.map((attachment) => attachment.storageKey),
  };
}

async function purgeTestGroups(tx: Tx, testGroupIds: string[]): Promise<Purged> {
  if (testGroupIds.length === 0) {
    return { counts: NOTHING, storageKeys: [] };
  }

  const testCases = await tx.testCase.findMany({
    where: { testGroupId: { in: testGroupIds } },
    select: { id: true },
  });
  const below = await purgeTestCases(
    tx,
    testCases.map((testCase) => testCase.id),
  );
  await tx.testGroup.deleteMany({ where: { id: { in: testGroupIds } } });

  return {
    counts: { ...below.counts, testGroups: testGroupIds.length },
    storageKeys: below.storageKeys,
  };
}

async function purgeScenarios(tx: Tx, scenarioIds: string[]): Promise<Purged> {
  if (scenarioIds.length === 0) {
    return { counts: NOTHING, storageKeys: [] };
  }

  const testGroups = await tx.testGroup.findMany({
    where: { scenarioId: { in: scenarioIds } },
    select: { id: true },
  });
  const below = await purgeTestGroups(
    tx,
    testGroups.map((testGroup) => testGroup.id),
  );
  await tx.scenario.deleteMany({ where: { id: { in: scenarioIds } } });

  return {
    counts: { ...below.counts, scenarios: scenarioIds.length },
    storageKeys: below.storageKeys,
  };
}

async function purgeRequirements(tx: Tx, requirementIds: string[]): Promise<Purged> {
  if (requirementIds.length === 0) {
    return { counts: NOTHING, storageKeys: [] };
  }

  const scenarios = await tx.scenario.findMany({
    where: { requirementId: { in: requirementIds } },
    select: { id: true },
  });
  const below = await purgeScenarios(
    tx,
    scenarios.map((scenario) => scenario.id),
  );
  await tx.requirement.deleteMany({ where: { id: { in: requirementIds } } });

  return {
    counts: { ...below.counts, requirements: requirementIds.length },
    storageKeys: below.storageKeys,
  };
}

/**
 * Runs one of the purges above in a transaction, then clears the storage
 * objects it collected.
 *
 * The object store isn't transactional, so it is dealt with afterwards and
 * failures there are swallowed: the rows are already gone, and an orphaned
 * object is a smaller problem than an error thrown at a user whose delete
 * actually succeeded. (This app already carries orphans in the other
 * direction — rows whose objects vanished.)
 */
async function runPurge(purge: (tx: Tx) => Promise<Purged>) {
  const result = await prisma.$transaction((tx) => purge(tx));

  for (const storageKey of result.storageKeys) {
    try {
      await deleteFile(storageKey);
    } catch {
      // Already gone, or the store is unreachable. Neither changes the delete.
    }
  }

  return result.counts;
}

export function purgeTestCase(testCaseId: string) {
  return runPurge((tx) => purgeTestCases(tx, [testCaseId]));
}

export function purgeTestGroup(testGroupId: string) {
  return runPurge((tx) => purgeTestGroups(tx, [testGroupId]));
}

export function purgeScenario(scenarioId: string) {
  return runPurge((tx) => purgeScenarios(tx, [scenarioId]));
}

export function purgeRequirement(requirementId: string) {
  return runPurge((tx) => purgeRequirements(tx, [requirementId]));
}

export function purgeModule(moduleId: string) {
  return runPurge(async (tx) => {
    const requirements = await tx.requirement.findMany({
      where: { moduleId },
      select: { id: true },
    });
    const below = await purgeRequirements(
      tx,
      requirements.map((requirement) => requirement.id),
    );
    await tx.module.deleteMany({ where: { id: moduleId } });
    return below;
  });
}
