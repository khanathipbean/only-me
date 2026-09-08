import { prisma } from "@/lib/prisma";
import type { ImportRow } from "@/lib/import/parse";
import { normalizePriority, validateRow, type ValidatedRow } from "@/lib/import/validate";

export const MAX_IMPORT_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export type PreviewedRow = ValidatedRow & {
  duplicate: boolean;
  existingTestCaseId?: string;
};

/** Read-only: looks up potential Test Case duplicates by name under the matched Scenario/Test Group. Writes nothing. */
export async function previewImport(projectId: string, projectCode: string, rows: ImportRow[]) {
  const results: PreviewedRow[] = await Promise.all(
    rows.map(async (row): Promise<PreviewedRow> => {
      const validated = validateRow(row, projectCode);
      if (!validated.valid) {
        return { ...validated, duplicate: false };
      }

      const scenario = await prisma.scenario.findFirst({
        where: { projectId, name: row.scenarioName, deletedAt: null },
      });
      const testGroup = scenario
        ? await prisma.testGroup.findFirst({
            where: { scenarioId: scenario.id, name: row.testGroupName, deletedAt: null },
          })
        : null;
      const existingTestCase = testGroup
        ? await prisma.testCase.findFirst({
            where: { testGroupId: testGroup.id, name: row.testCaseName, deletedAt: null },
          })
        : null;

      return {
        ...validated,
        duplicate: Boolean(existingTestCase),
        existingTestCaseId: existingTestCase?.id,
      };
    }),
  );

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

/**
 * Atomic: re-validates every row, then performs every write in one
 * transaction. If any non-skipped row still fails validation, the whole
 * transaction throws and rolls back — nothing is written, matching the
 * ticket's "a mid-batch failure leaves no partial rows" requirement.
 */
export async function confirmImport(
  projectId: string,
  projectCode: string,
  rows: ConfirmRowInput[],
  actorId: string,
) {
  return prisma.$transaction(async (tx) => {
    let succeededCount = 0;
    let skippedCount = 0;
    const details: Array<Record<string, unknown>> = [];

    for (const row of rows) {
      const isPlainSkip = row.skip === true && row.duplicateResolution !== "skip";

      // A plain skip (invalid row, or the user just skipping a non-duplicate
      // row) never resolved a Scenario/Test Group/Test Case, so there is no
      // entity to write an AuditLog entry against.
      if (isPlainSkip) {
        skippedCount += 1;
        details.push({ rowNumber: row.rowNumber, outcome: "skipped" });
        continue;
      }

      const validated = validateRow(row.data, projectCode);
      if (!validated.valid) {
        throw new ImportRowFailedError(row.rowNumber, validated.errors);
      }

      const priority = normalizePriority(row.data.priority);

      let scenario = await tx.scenario.findFirst({
        where: { projectId, name: row.data.scenarioName, deletedAt: null },
      });
      if (!scenario) {
        scenario = await tx.scenario.create({
          data: {
            projectId,
            name: row.data.scenarioName,
            expectedResult: row.data.expectedResult,
            priority,
          },
        });
        await tx.auditLog.create({
          data: {
            entityType: "Scenario",
            entityId: scenario.id,
            action: "import-create",
            actorId,
            projectId,
            newValue: scenario,
          },
        });
      }

      let testGroup = await tx.testGroup.findFirst({
        where: { scenarioId: scenario.id, name: row.data.testGroupName, deletedAt: null },
      });
      if (!testGroup) {
        const maxSequence = await tx.testGroup.aggregate({
          where: { scenarioId: scenario.id },
          _max: { sequence: true },
        });
        testGroup = await tx.testGroup.create({
          data: {
            scenarioId: scenario.id,
            name: row.data.testGroupName,
            sequence: (maxSequence._max.sequence ?? 0) + 1,
          },
        });
        await tx.auditLog.create({
          data: {
            entityType: "TestGroup",
            entityId: testGroup.id,
            action: "import-create",
            actorId,
            projectId,
            newValue: testGroup,
          },
        });
      }

      const existingTestCase = await tx.testCase.findFirst({
        where: { testGroupId: testGroup.id, name: row.data.testCaseName, deletedAt: null },
      });

      if (row.duplicateResolution === "skip") {
        skippedCount += 1;
        if (existingTestCase) {
          await tx.auditLog.create({
            data: {
              entityType: "TestCase",
              entityId: existingTestCase.id,
              action: "import-skip",
              actorId,
              projectId,
              oldValue: existingTestCase,
            },
          });
        }
        details.push({
          rowNumber: row.rowNumber,
          outcome: "skipped",
          testCaseId: existingTestCase?.id,
        });
        continue;
      }

      if (existingTestCase && row.duplicateResolution === "update") {
        const after = await tx.testCase.update({
          where: { id: existingTestCase.id },
          data: {
            preconditions: row.data.preconditions || null,
            expectedResult: row.data.expectedResult,
            priority,
            updatedById: actorId,
          },
        });
        await tx.testStep.deleteMany({ where: { testCaseId: after.id } });
        await tx.testStep.create({
          data: {
            testCaseId: after.id,
            sequence: 1,
            step: row.data.testSteps,
            expectedResult: row.data.expectedResult,
          },
        });
        await tx.auditLog.create({
          data: {
            entityType: "TestCase",
            entityId: after.id,
            action: "import-update",
            actorId,
            projectId,
            oldValue: existingTestCase,
            newValue: after,
          },
        });
        succeededCount += 1;
        details.push({ rowNumber: row.rowNumber, outcome: "updated", testCaseId: after.id });
        continue;
      }

      const created = await tx.testCase.create({
        data: {
          testGroupId: testGroup.id,
          name: row.data.testCaseName,
          preconditions: row.data.preconditions || null,
          expectedResult: row.data.expectedResult,
          priority,
          testResult: "NOT_RUN",
          createdById: actorId,
          updatedById: actorId,
        },
      });
      await tx.testStep.create({
        data: {
          testCaseId: created.id,
          sequence: 1,
          step: row.data.testSteps,
          expectedResult: row.data.expectedResult,
        },
      });
      await tx.auditLog.create({
        data: {
          entityType: "TestCase",
          entityId: created.id,
          action: "import-create",
          actorId,
          projectId,
          newValue: created,
        },
      });
      succeededCount += 1;
      details.push({ rowNumber: row.rowNumber, outcome: "created", testCaseId: created.id });
    }

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
      importLogId: importLog.id,
    };
  });
}
