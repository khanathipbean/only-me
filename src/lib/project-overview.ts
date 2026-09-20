import { prisma } from "@/lib/prisma";
import { getFileKind } from "@/lib/project-files";

const RECENT_TAKE = 5;

/* Live Requirements only, same shape `listModulesForProjectPage` already
 * uses — so a module's count here matches what the Modules list shows. */
const WITH_REQUIREMENT_COUNT = {
  _count: { select: { requirements: { where: { deletedAt: null } } } },
} as const;

/**
 * Everything the Overview tab's summary needs for a project that already has
 * data — counts for the stat tiles, and the 5 most recent rows for each of
 * Modules/Test Runs/Files/activity. Not built on `getProjectDashboard`: that
 * function's counts are derived from its filtered scenario tree (so a Module
 * with no Requirements yet wouldn't show up), which is the right shape for
 * the Dashboard tab but not a plain "how many are there" total.
 */
export async function getProjectOverviewSummary(projectId: string) {
  const [
    moduleCount,
    requirementCount,
    testRunCount,
    fileCount,
    memberCount,
    recentModules,
    recentRuns,
    recentFiles,
    recentActivity,
  ] = await Promise.all([
    prisma.module.count({ where: { projectId, deletedAt: null } }),
    prisma.requirement.count({ where: { projectId, deletedAt: null } }),
    prisma.testRun.count({ where: { projectId, deletedAt: null } }),
    prisma.projectFile.count({ where: { projectId, deletedAt: null } }),
    prisma.projectMember.count({ where: { projectId } }),
    prisma.module.findMany({
      where: { projectId, deletedAt: null },
      include: WITH_REQUIREMENT_COUNT,
      orderBy: { createdAt: "desc" },
      take: RECENT_TAKE,
    }),
    prisma.testRun.findMany({
      where: { projectId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: RECENT_TAKE,
    }),
    prisma.projectFile.findMany({
      where: { projectId, deletedAt: null },
      orderBy: { uploadedAt: "desc" },
      take: RECENT_TAKE,
    }),
    // Fanned out one row per recipient by `notifyProject` — every row from
    // one event shares the same `occurredAt` (one Postgres statement), so
    // this collapses the fan-out back to one row per event.
    prisma.notification.findMany({
      where: { projectId },
      orderBy: { occurredAt: "desc" },
      distinct: ["title", "body", "occurredAt"],
      take: RECENT_TAKE,
    }),
  ]);

  // Pass/total per run, in one grouped query rather than one per row.
  const runIds = recentRuns.map((run) => run.id);
  const resultRows =
    runIds.length > 0
      ? await prisma.testRunCase.groupBy({
          by: ["testRunId", "testResult"],
          where: { testRunId: { in: runIds } },
          _count: { _all: true },
        })
      : [];
  const runsWithProgress = recentRuns.map((run) => {
    const rows = resultRows.filter((row) => row.testRunId === run.id);
    const total = rows.reduce((sum, row) => sum + row._count._all, 0);
    const passed = rows.find((row) => row.testResult === "PASSED")?._count._all ?? 0;
    return {
      ...run,
      total,
      passed,
      percent: total > 0 ? Math.round((passed / total) * 100) : 0,
    };
  });

  return {
    counts: {
      modules: moduleCount,
      requirements: requirementCount,
      testRuns: testRunCount,
      files: fileCount,
      members: memberCount,
    },
    recentModules: recentModules.map((module) => ({
      id: module.id,
      name: module.name,
      requirementCount: module._count.requirements,
    })),
    recentRuns: runsWithProgress,
    recentFiles: recentFiles.map((file) => ({
      id: file.id,
      fileName: file.fileName,
      module: file.module,
      uploadedAt: file.uploadedAt,
      kind: getFileKind(file.contentType, file.fileName),
    })),
    recentActivity,
  };
}
