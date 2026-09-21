import { prisma } from "@/lib/prisma";
import { getFileKind } from "@/lib/project-files";

const RECENT_TAKE = 5;

/**
 * Everything the Overview tab's summary needs for a project that already has
 * data — counts for the stat tiles, and the 5 most recent rows for each of
 * Notes/Test Runs/Files/activity. Not built on `getProjectDashboard`: that
 * function's counts are derived from its filtered scenario tree (so a Module
 * with no Requirements yet wouldn't show up), which is the right shape for
 * the Dashboard tab but not a plain "how many are there" total.
 */
export async function getProjectOverviewSummary(projectId: string) {
  const [
    moduleCount,
    noteCount,
    testRunCount,
    fileCount,
    memberCount,
    recentNotes,
    recentRuns,
    recentFiles,
    recentActivity,
  ] = await Promise.all([
    prisma.module.count({ where: { projectId, deletedAt: null } }),
    prisma.note.count({ where: { projectId, deletedAt: null } }),
    prisma.testRun.count({ where: { projectId, deletedAt: null } }),
    prisma.projectFile.count({ where: { projectId, deletedAt: null } }),
    prisma.projectMember.count({ where: { projectId } }),
    /* Notes rather than Modules. A project's Modules are drawn once and
     * then sit still — this one has seventeen, all created inside three
     * days, so "recent" among them is a timestamp difference of seconds and
     * the same five names for months. A Note is written whenever something
     * is decided, which is what the word is for. Modules keep their stat
     * tile, which is the link into them. */
    prisma.note.findMany({
      where: { projectId, deletedAt: null },
      include: { module: { select: { name: true } } },
      orderBy: [{ occurredOn: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
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
      notes: noteCount,
      testRuns: testRunCount,
      files: fileCount,
      members: memberCount,
    },
    recentNotes: recentNotes.map((note) => ({
      id: note.id,
      title: note.title,
      module: note.module.name,
      feature: note.feature,
      /* The date it is about, falling back to when it was written — the same
       * pair the Notes list orders by, so the two agree. */
      on: note.occurredOn ?? note.createdAt,
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
