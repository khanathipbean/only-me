import { prisma } from "@/lib/prisma";
import { UNASSIGNED_NAME } from "@/lib/requirements";
import type { ImportRow } from "@/lib/import/parse";
import { parseTestSteps } from "@/lib/import/steps";
import { normalizePriority, validateRow, type ValidatedRow } from "@/lib/import/validate";

export const MAX_IMPORT_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export type PreviewedRow = ValidatedRow & {
  duplicate: boolean;
  existingTestCaseId?: string;
};

/**
 * Read-only: looks up potential Test Case duplicates by name under the
 * matched Scenario/Test Group. Writes nothing.
 *
 * Batched one level at a time (Scenario, then Test Group, then Test Case)
 * rather than the original per-row `findFirst` chain, which sent up to 3
 * sequential queries per row — the exact N+1 shape `confirmImport` below was
 * rewritten to avoid, but this preview step still had it. A 500-row file
 * meant up to 1,500 round trips; against this app's pooled connection
 * (`max: 1`, ~249ms/round-trip per the note on `confirmImport`) that's
 * minutes, not seconds.
 */
export async function previewImport(projectId: string, projectCode: string, rows: ImportRow[]) {
  const validated = rows.map((row) => ({ row, result: validateRow(row, projectCode) }));
  const validRows = validated.filter((v) => v.result.valid).map((v) => v.row);

  const scenarios = await prisma.scenario.findMany({
    where: {
      projectId,
      deletedAt: null,
      name: { in: [...new Set(validRows.map((row) => row.scenarioName))] },
    },
    select: { id: true, name: true },
  });
  // Matches the original `findFirst` semantics: a name that isn't unique in
  // the project resolves to an arbitrary one of its matches, same as before.
  const scenarioByName = new Map(scenarios.map((s) => [s.name, s]));

  const testGroups = scenarios.length
    ? await prisma.testGroup.findMany({
        where: {
          scenarioId: { in: scenarios.map((s) => s.id) },
          deletedAt: null,
          name: { in: [...new Set(validRows.map((row) => row.testGroupName))] },
        },
        select: { id: true, name: true, scenarioId: true },
      })
    : [];
  const testGroupByKey = new Map(testGroups.map((tg) => [`${tg.scenarioId}::${tg.name}`, tg]));

  const testCases = testGroups.length
    ? await prisma.testCase.findMany({
        where: {
          testGroupId: { in: testGroups.map((tg) => tg.id) },
          deletedAt: null,
          name: { in: [...new Set(validRows.map((row) => row.testCaseName))] },
        },
        select: { id: true, name: true, testGroupId: true },
      })
    : [];
  const testCaseByKey = new Map(testCases.map((tc) => [`${tc.testGroupId}::${tc.name}`, tc]));

  const results: PreviewedRow[] = validated.map(({ row, result }) => {
    if (!result.valid) {
      return { ...result, duplicate: false };
    }

    const scenario = scenarioByName.get(row.scenarioName);
    const testGroup = scenario ? testGroupByKey.get(`${scenario.id}::${row.testGroupName}`) : undefined;
    const existingTestCase = testGroup
      ? testCaseByKey.get(`${testGroup.id}::${row.testCaseName}`)
      : undefined;

    return {
      ...result,
      duplicate: Boolean(existingTestCase),
      existingTestCaseId: existingTestCase?.id,
    };
  });

  return {
    rows: results,
    summary: {
      total: results.length,
      valid: results.filter((r) => r.valid).length,
      invalid: results.filter((r) => !r.valid).length,
      duplicates: results.filter((r) => r.duplicate).length,
    },
  };
}

export type DuplicateResolution = "skip" | "update" | "create_new";

export type ConfirmRowInput = {
  rowNumber: number;
  data: ImportRow;
  skip?: boolean;
  duplicateResolution?: DuplicateResolution;
};

export class ImportRowFailedError extends Error {
  constructor(public rowNumber: number, public errors: { field: string; reason: string }[]) {
    super(`Row ${rowNumber} failed validation at confirm time`);
  }
}

/** Well past what a large import needs, but still bounded. Prisma's default is
 * 5s, which a multi-row import blows through the moment the database is remote
 * rather than local: every query inside an interactive transaction is its own
 * network round-trip, so the whole batch failed with P2028 and rolled back. */
const IMPORT_TRANSACTION_TIMEOUT_MS = 120_000;
const IMPORT_TRANSACTION_MAX_WAIT_MS = 15_000;

/**
 * The steps one row asks for, numbered.
 *
 * The sheet has a single Expected Result column, which describes the outcome
 * after the whole thing has been carried out — so it goes on the last step
 * rather than being repeated against every one of them. A one-line cell still
 * produces one step carrying it, exactly as before.
 */
function stepRows(testCaseId: string, row: { data: ImportRow }) {
  const steps = parseTestSteps(row.data.testSteps);
  return steps.map((step, index) => ({
    testCaseId,
    sequence: index + 1,
    step,
    expectedResult: index === steps.length - 1 ? row.data.expectedResult : "",
  }));
}

/**
 * Atomic: re-validates every row, then performs every write in one
 * transaction. If any non-skipped row still fails validation, the whole
 * transaction throws and rolls back — nothing is written, matching the
 * ticket's "a mid-batch failure leaves no partial rows" requirement.
 *
 * Written in phases rather than as a loop over rows, because on a remote
 * database the wall clock is made of round trips and nothing else. The per-row
 * version sent 4.3 statements per row — a duplicate check, the Test Case, its
 * step and its audit entry — which for a 58-row file measured 249 statements.
 * At the 249ms round trip this app sees against Supabase's pooler that is 62
 * seconds, and Netlify cuts a synchronous function off at 60: the import died
 * with a 504 having written nothing.
 *
 * Each phase below costs a fixed handful of statements however many rows
 * arrive. The exception is rows the user chose to `update`, which write
 * different values each and so stay one statement apiece — everything around
 * them is still batched.
 */
export async function confirmImport(
  projectId: string,
  projectCode: string,
  rows: ConfirmRowInput[],
  actorId: string,
) {
  return prisma.$transaction(
    async (tx) => {
      /* ---- Phase 1: validate, and work out what the file asks for. No I/O. */

      type Work = {
        rowNumber: number;
        data: ImportRow;
        resolution?: DuplicateResolution;
        priority: ReturnType<typeof normalizePriority>;
        moduleName: string;
        requirementName: string;
      };

      const plainSkips: number[] = [];
      const work: Work[] = [];

      for (const row of rows) {
        // A plain skip (invalid row, or the user just skipping a non-duplicate
        // row) never resolved a Scenario/Test Group/Test Case, so there is no
        // entity to write an AuditLog entry against.
        if (row.skip === true && row.duplicateResolution !== "skip") {
          plainSkips.push(row.rowNumber);
          continue;
        }

        const validated = validateRow(row.data, projectCode);
        if (!validated.valid) {
          throw new ImportRowFailedError(row.rowNumber, validated.errors);
        }

        work.push({
          rowNumber: row.rowNumber,
          data: row.data,
          resolution: row.duplicateResolution,
          priority: normalizePriority(row.data.priority),
          /* A Scenario cannot exist outside a Requirement, and a Requirement
           * cannot exist outside a Module. Sheets written before those levels
           * existed leave the columns blank and land under "Unassigned". */
          moduleName: row.data.moduleName || UNASSIGNED_NAME,
          requirementName: row.data.requirementName || UNASSIGNED_NAME,
        });
      }

      /* ---- Phase 2: the four container levels, one wave each.
       *
       * The order can't be collapsed: a Requirement needs its Module's id, a
       * Scenario its Requirement's, a Test Group its Scenario's. Within a wave
       * it is one findMany, one create, one audit insert. `firstSeen` keeps
       * the order the file introduced each name in, which is what decides the
       * sequence numbers below. */

      function firstSeen(items: Work[], key: (w: Work) => string) {
        const seen = new Map<string, Work>();
        for (const item of items) {
          const k = key(item);
          if (!seen.has(k)) {
            seen.set(k, item);
          }
        }
        return seen;
      }

      // Counts of newly-created rows per level, surfaced in the return value
      // for the notification the caller sends once the import is confirmed.
      const createdCounts = { modules: 0, requirements: 0, scenarios: 0, testGroups: 0, testCases: 0 };

      // Modules ------------------------------------------------------------
      const moduleIdByName = new Map<string, string>();
      const wantedModules = firstSeen(work, (w) => w.moduleName);

      if (wantedModules.size > 0) {
        const existing = await tx.module.findMany({
          where: { projectId, name: { in: [...wantedModules.keys()] } },
          select: { id: true, name: true, deletedAt: true },
        });
        for (const found of existing) {
          moduleIdByName.set(found.name, found.id);
        }

        // Importing into an archived Module would file the rows somewhere the
        // Modules list doesn't show at all.
        const archived = existing.filter((m) => m.deletedAt).map((m) => m.id);
        if (archived.length > 0) {
          await tx.module.updateMany({
            where: { id: { in: archived } },
            data: { deletedAt: null },
          });
        }

        const missing = [...wantedModules.keys()].filter((name) => !moduleIdByName.has(name));
        if (missing.length > 0) {
          const maxSequence = await tx.module.aggregate({
            where: { projectId },
            _max: { sequence: true },
          });
          let next = (maxSequence._max.sequence ?? -1) + 1;
          const created = await tx.module.createManyAndReturn({
            data: missing.map((name) => ({ projectId, name, sequence: next++ })),
          });
          createdCounts.modules = created.length;
          for (const made of created) {
            moduleIdByName.set(made.name, made.id);
          }
          await tx.auditLog.createMany({
            data: created.map((made) => ({
              entityType: "Module",
              entityId: made.id,
              action: "import-create",
              actorId,
              projectId,
              newValue: made,
            })),
          });
        }
      }

      // Requirements -------------------------------------------------------
      const requirementKey = (w: Work) =>
        `${moduleIdByName.get(w.moduleName)} ${w.requirementName}`;
      const requirementIdByKey = new Map<string, string>();
      const wantedRequirements = firstSeen(work, requirementKey);

      if (wantedRequirements.size > 0) {
        const existing = await tx.requirement.findMany({
          where: {
            projectId,
            deletedAt: null,
            OR: [...wantedRequirements.values()].map((w) => ({
              moduleId: moduleIdByName.get(w.moduleName)!,
              name: w.requirementName,
            })),
          },
          select: { id: true, moduleId: true, name: true },
        });
        for (const requirement of existing) {
          const key = `${requirement.moduleId} ${requirement.name}`;
          if (!requirementIdByKey.has(key)) {
            requirementIdByKey.set(key, requirement.id);
          }
        }

        const missing = [...wantedRequirements.entries()].filter(
          ([key]) => !requirementIdByKey.has(key),
        );
        if (missing.length > 0) {
          const created = await tx.requirement.createManyAndReturn({
            data: missing.map(([, w]) => ({
              projectId,
              moduleId: moduleIdByName.get(w.moduleName)!,
              name: w.requirementName,
              priority: w.priority,
            })),
          });
          createdCounts.requirements = created.length;
          for (const requirement of created) {
            requirementIdByKey.set(
              `${requirement.moduleId} ${requirement.name}`,
              requirement.id,
            );
          }
          await tx.auditLog.createMany({
            data: created.map((requirement) => ({
              entityType: "Requirement",
              entityId: requirement.id,
              action: "import-create",
              actorId,
              projectId,
              newValue: requirement,
            })),
          });
        }
      }

      // Scenarios ----------------------------------------------------------
      // Matched on name within the Project, the way the per-row version did.
      const scenarioIdByName = new Map<string, string>();
      const wantedScenarios = firstSeen(work, (w) => w.data.scenarioName);

      if (wantedScenarios.size > 0) {
        const existing = await tx.scenario.findMany({
          where: { projectId, deletedAt: null, name: { in: [...wantedScenarios.keys()] } },
          select: { id: true, name: true },
        });
        for (const scenario of existing) {
          if (!scenarioIdByName.has(scenario.name)) {
            scenarioIdByName.set(scenario.name, scenario.id);
          }
        }

        const missing = [...wantedScenarios.entries()].filter(
          ([name]) => !scenarioIdByName.has(name),
        );
        if (missing.length > 0) {
          const created = await tx.scenario.createManyAndReturn({
            data: missing.map(([, w]) => ({
              projectId,
              requirementId: requirementIdByKey.get(requirementKey(w))!,
              name: w.data.scenarioName,
              description: w.data.scenarioDescription || null,
              preconditions: w.data.scenarioPreconditions || null,
              // Falls back to the row's own (Test Case-level) Expected Result
              // so a CSV without the dedicated Scenario column still works.
              expectedResult: w.data.scenarioExpectedResult || w.data.expectedResult,
              priority: w.priority,
            })),
          });
          createdCounts.scenarios = created.length;
          for (const scenario of created) {
            scenarioIdByName.set(scenario.name, scenario.id);
          }
          await tx.auditLog.createMany({
            data: created.map((scenario) => ({
              entityType: "Scenario",
              entityId: scenario.id,
              action: "import-create",
              actorId,
              projectId,
              newValue: scenario,
            })),
          });
        }
      }

      // Test Groups --------------------------------------------------------
      const testGroupKey = (w: Work) =>
        `${scenarioIdByName.get(w.data.scenarioName)} ${w.data.testGroupName}`;
      const testGroupIdByKey = new Map<string, string>();
      const wantedTestGroups = firstSeen(work, testGroupKey);

      if (wantedTestGroups.size > 0) {
        const existing = await tx.testGroup.findMany({
          where: {
            deletedAt: null,
            OR: [...wantedTestGroups.values()].map((w) => ({
              scenarioId: scenarioIdByName.get(w.data.scenarioName)!,
              name: w.data.testGroupName,
            })),
          },
          select: { id: true, scenarioId: true, name: true },
        });
        for (const group of existing) {
          const key = `${group.scenarioId} ${group.name}`;
          if (!testGroupIdByKey.has(key)) {
            testGroupIdByKey.set(key, group.id);
          }
        }

        const missing = [...wantedTestGroups.entries()].filter(
          ([key]) => !testGroupIdByKey.has(key),
        );
        if (missing.length > 0) {
          // One grouped query for where each Scenario's numbering has got to,
          // rather than an aggregate per new group.
          const scenarioIds = [
            ...new Set(missing.map(([, w]) => scenarioIdByName.get(w.data.scenarioName)!)),
          ];
          const maxima = await tx.testGroup.groupBy({
            by: ["scenarioId"],
            where: { scenarioId: { in: scenarioIds } },
            _max: { sequence: true },
          });
          const nextByScenario = new Map<string, number>(
            maxima.map((m) => [m.scenarioId, (m._max.sequence ?? 0) + 1]),
          );

          const created = await tx.testGroup.createManyAndReturn({
            data: missing.map(([, w]) => {
              const scenarioId = scenarioIdByName.get(w.data.scenarioName)!;
              const sequence = nextByScenario.get(scenarioId) ?? 1;
              nextByScenario.set(scenarioId, sequence + 1);
              return {
                scenarioId,
                name: w.data.testGroupName,
                testObjective: w.data.testGroupObjective || null,
                sequence,
              };
            }),
          });
          createdCounts.testGroups = created.length;
          for (const group of created) {
            testGroupIdByKey.set(`${group.scenarioId} ${group.name}`, group.id);
          }
          await tx.auditLog.createMany({
            data: created.map((group) => ({
              entityType: "TestGroup",
              entityId: group.id,
              action: "import-create",
              actorId,
              projectId,
              newValue: group,
            })),
          });
        }
      }

      /* ---- Phase 3: every duplicate check in one query.
       *
       * The per-row version asked once per row, which also meant a row could
       * see a Test Case an earlier row in the same file had just created.
       * That difference isn't reachable from the UI: `previewImport` looks for
       * duplicates in the database only, so a resolution is only ever set for
       * a row whose match was already there before the import began. */
      type ExistingCase = Awaited<ReturnType<typeof tx.testCase.update>>;
      const caseKey = (w: Work) =>
        `${testGroupIdByKey.get(testGroupKey(w))} ${w.data.testCaseName}`;
      const duplicateByKey = new Map<string, ExistingCase>();

      if (work.length > 0) {
        const wantedCases = firstSeen(work, caseKey);
        const existing = await tx.testCase.findMany({
          where: {
            deletedAt: null,
            OR: [...wantedCases.values()].map((w) => ({
              testGroupId: testGroupIdByKey.get(testGroupKey(w))!,
              name: w.data.testCaseName,
            })),
          },
        });
        for (const testCase of existing) {
          const key = `${testCase.testGroupId} ${testCase.name}`;
          if (!duplicateByKey.has(key)) {
            duplicateByKey.set(key, testCase);
          }
        }
      }

      /* ---- Phase 4: sort the rows into three piles and write each in a
       * batch. `details` is rebuilt in the file's own row order at the end, so
       * the caller sees the outcomes in the order it sent them. */

      type Outcome = { rowNumber: number; outcome: string; testCaseId?: string };
      const outcomes = new Map<number, Outcome>();
      for (const rowNumber of plainSkips) {
        outcomes.set(rowNumber, { rowNumber, outcome: "skipped" });
      }

      const toSkip: { w: Work; existing?: ExistingCase }[] = [];
      const toUpdate: { w: Work; existing: ExistingCase }[] = [];
      const toCreate: Work[] = [];

      for (const w of work) {
        const existing = duplicateByKey.get(caseKey(w));
        if (w.resolution === "skip") {
          toSkip.push({ w, existing });
        } else if (existing && w.resolution === "update") {
          toUpdate.push({ w, existing });
        } else {
          toCreate.push(w);
        }
      }

      for (const { w, existing } of toSkip) {
        outcomes.set(w.rowNumber, {
          rowNumber: w.rowNumber,
          outcome: "skipped",
          testCaseId: existing?.id,
        });
      }
      const skippedWithRecord = toSkip.filter(
        (entry): entry is { w: Work; existing: ExistingCase } => Boolean(entry.existing),
      );
      if (skippedWithRecord.length > 0) {
        await tx.auditLog.createMany({
          data: skippedWithRecord.map(({ existing }) => ({
            entityType: "TestCase",
            entityId: existing.id,
            action: "import-skip",
            actorId,
            projectId,
            oldValue: existing,
          })),
        });
      }

      // Updates stay one statement each: every row writes different values and
      // there is no batch form of that. Their steps and audit entries are
      // still written in one go below.
      const updated: { before: ExistingCase; after: ExistingCase }[] = [];
      for (const { w, existing } of toUpdate) {
        const after = await tx.testCase.update({
          where: { id: existing.id },
          data: {
            preconditions: w.data.preconditions || null,
            expectedResult: w.data.expectedResult,
            priority: w.priority,
            updatedById: actorId,
          },
        });
        updated.push({ before: existing, after });
        outcomes.set(w.rowNumber, {
          rowNumber: w.rowNumber,
          outcome: "updated",
          testCaseId: after.id,
        });
      }

      if (updated.length > 0) {
        const updatedIds = updated.map(({ after }) => after.id);
        await tx.testStep.deleteMany({ where: { testCaseId: { in: updatedIds } } });
        await tx.testStep.createMany({
          data: toUpdate.flatMap(({ w }, index) => stepRows(updatedIds[index], w)),
        });
        await tx.auditLog.createMany({
          data: updated.map(({ before, after }) => ({
            entityType: "TestCase",
            entityId: after.id,
            action: "import-update",
            actorId,
            projectId,
            oldValue: before,
            newValue: after,
          })),
        });
      }

      if (toCreate.length > 0) {
        const created = await tx.testCase.createManyAndReturn({
          data: toCreate.map((w) => ({
            testGroupId: testGroupIdByKey.get(testGroupKey(w))!,
            name: w.data.testCaseName,
            preconditions: w.data.preconditions || null,
            expectedResult: w.data.expectedResult,
            priority: w.priority,
            testResult: "NOT_RUN" as const,
            createdById: actorId,
            updatedById: actorId,
          })),
        });
        // `createManyAndReturn` gives the rows back in the order they were
        // sent, which is what lets each be paired with the row that asked for
        // it.
        await tx.testStep.createMany({
          data: created.flatMap((testCase, index) => stepRows(testCase.id, toCreate[index])),
        });
        await tx.auditLog.createMany({
          data: created.map((testCase) => ({
            entityType: "TestCase",
            entityId: testCase.id,
            action: "import-create",
            actorId,
            projectId,
            newValue: testCase,
          })),
        });
        created.forEach((testCase, index) => {
          outcomes.set(toCreate[index].rowNumber, {
            rowNumber: toCreate[index].rowNumber,
            outcome: "created",
            testCaseId: testCase.id,
          });
        });
      }

      const details = rows
        .map((row) => outcomes.get(row.rowNumber))
        .filter((outcome): outcome is Outcome => Boolean(outcome));
      const succeededCount = toCreate.length + toUpdate.length;
      const skippedCount = plainSkips.length + toSkip.length;
      createdCounts.testCases = toCreate.length;

      const importLog = await tx.importLog.create({
        data: {
          projectId,
          performedById: actorId,
          succeededCount,
          failedCount: 0,
          skippedCount,
          details: details as object,
        },
      });

      return {
        succeededCount,
        failedCount: 0,
        skippedCount,
        createdCounts,
        importLogId: importLog.id,
      };
    },
    { timeout: IMPORT_TRANSACTION_TIMEOUT_MS, maxWait: IMPORT_TRANSACTION_MAX_WAIT_MS },
  );
}
