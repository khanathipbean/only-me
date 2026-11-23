import { prisma } from "@/lib/prisma";
import { formatSize } from "@/lib/file-size";
import { getFileKind } from "@/lib/project-files";
import { ATTENTION_PATTERNS, failureCount, listProblemCases } from "@/lib/run-history";
import type { CapabilityKey } from "@/lib/permissions";
import type {
  AuditPreview,
  TestRunsPreview,
  DashboardPreview,
  FilesPreview,
  LinksPreview,
  MenuPreview,
  NotesPreview,
  ProblemsPreview,
  SummaryPreview,
} from "@/lib/menu-preview-types";

/**
 * The figures and rows behind the nav menus' previews.
 *
 * Deliberately not built on the pages' own functions. `getProjectDashboard`
 * answers a filtered question with a whole scenario tree attached, and
 * `listNotesForProjectPage` paginates; a menu that opens on hover can afford
 * neither. Each query here fetches one section's worth and stops, and nothing
 * runs for a section the reader cannot open — a DEV holds `reading.dashboard`
 * and none of the other three in that menu, so three of these never fire.
 *
 * The whole thing is one round trip, asked for the first time a menu opens
 * and not before: a reader who never opens one pays nothing at all.
 */

/** How many modules the Summary bar draws before the rest are folded into
 *  one. Three segments can be told apart at 300px; nine cannot. */
const MODULES_DRAWN = 4;
const RECENT_TAKE = 4;
const WEEK_DAYS = 7;
/** How many of the worst cases the Problem Cases pane names. Two: the pane
 *  is a reason to open the page, not the page. */
const WORST_DRAWN = 2;

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const PROBLEM_LABELS: Record<string, string> = {
  regression: "Regression",
  "never-passed": "Never passed",
  unstable: "Unstable",
  reworked: "Reworked",
};

const FILE_KIND_LABELS: Record<string, string> = {
  pdf: "PDF",
  word: "Document",
  excel: "Spreadsheet",
  csv: "Spreadsheet",
  image: "Image",
  text: "Text",
  video: "Video",
  audio: "Audio",
  generic: "Other",
};

/**
 * Each value as a percentage of the largest, so a row of bars is read against
 * itself rather than against a total nobody can see.
 *
 * Zero everywhere gives zero rather than a division by nothing, which is what
 * a project with no data has and is drawn as an empty track.
 */
export function sharesOfLargest(values: readonly number[]): number[] {
  const largest = Math.max(0, ...values);
  return values.map((value) => (largest === 0 ? 0 : (value / largest) * 100));
}

/** Each value as a percentage of the total, for a single bar split into
 *  segments that have to add up. */
export function sharesOfTotal(values: readonly number[]): number[] {
  const total = values.reduce((sum, value) => sum + value, 0);
  return values.map((value) => (total === 0 ? 0 : (value / total) * 100));
}

/**
 * Seven days of counts, oldest first, the last being the day `now` falls in.
 *
 * Bucketed by local calendar day rather than by 24-hour blocks back from the
 * moment of asking: a reader comparing "today" with "yesterday" means the
 * days on their calendar, and an entry from this morning belongs to today
 * whatever time the menu is opened.
 */
export function weekBuckets(
  occurrences: readonly Date[],
  now: Date,
): { day: string; count: number; share: number }[] {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const counts = new Array<number>(WEEK_DAYS).fill(0);

  for (const at of occurrences) {
    const startOfThatDay = new Date(at.getFullYear(), at.getMonth(), at.getDate());
    /* Whole days back from today. Built from the two midnights rather than
       from the raw difference, so a clock change inside the week cannot move
       an entry into the wrong column. */
    const daysBack = Math.round(
      (startOfToday.getTime() - startOfThatDay.getTime()) / (24 * 60 * 60 * 1000),
    );
    const slot = WEEK_DAYS - 1 - daysBack;
    if (slot >= 0 && slot < WEEK_DAYS) {
      counts[slot] += 1;
    }
  }

  const shares = sharesOfLargest(counts);
  return counts.map((count, index) => {
    const day = new Date(startOfToday);
    day.setDate(day.getDate() - (WEEK_DAYS - 1 - index));
    return { day: DAY_NAMES[day.getDay()], count, share: shares[index] };
  });
}

/** Two letters for the avatar on an audit line: a person's initials, or the
 *  first of their address when that is all there is. */
export function initialsFor(name: string | null, email: string | null): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  }
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return (email ?? "?").slice(0, 2).toUpperCase();
}

/**
 * The short tag on a link row.
 *
 * Built from the title, not the address: the addresses a tester keeps are
 * usually bare IPs, where every one of them would read `10`. A title's
 * trailing part after a dash is where this team puts the environment —
 * "PROM — Developer" — so that is what is read when it is there.
 */
export function linkMark(title: string): string {
  const tail = title.split(/[—–-]/).pop()?.trim() ?? "";
  const words = (tail || title).trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return "LN";
  }
  if (words.length === 1) {
    return words[0].slice(0, 3).toUpperCase();
  }
  return words
    .slice(0, 3)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

/** The badge on a file row: its extension, or the first letters of its kind
 *  when it has none. */
export function fileMark(fileName: string, kind: string): string {
  const dot = fileName.lastIndexOf(".");
  const ext = dot > 0 ? fileName.slice(dot + 1) : "";
  if (ext && ext.length <= 4) {
    return ext.toUpperCase();
  }
  return kind.slice(0, 3).toUpperCase();
}

/** A note's first line, with the blank ones skipped, for the card under its
 *  title. */
export function firstLine(body: string): string {
  return body.split("\n").map((line) => line.trim()).find(Boolean) ?? "";
}

/** The same live-case rule the Dashboard counts by: not deleted, and in a
 *  group and scenario that are not either. */
function liveCaseInProject(projectId: string) {
  return {
    deletedAt: null,
    testGroup: { deletedAt: null, scenario: { deletedAt: null, projectId } },
  };
}

/**
 * Every live test group in the project with its module and how many cases it
 * holds.
 *
 * One query serving two sections — the Summary's split by module and the
 * Dashboard's "how many modules the failures are spread over" — because a
 * reader usually holds both and asking twice for the same rows would be the
 * expensive part of this whole file.
 */
async function readGroupsByModule(projectId: string) {
  return prisma.testGroup.findMany({
    where: { deletedAt: null, scenario: { deletedAt: null, projectId } },
    select: {
      id: true,
      scenario: { select: { requirement: { select: { moduleId: true } } } },
      _count: { select: { testCases: { where: { deletedAt: null } } } },
    },
  });
}

type GroupRow = Awaited<ReturnType<typeof readGroupsByModule>>[number];

async function buildSummary(projectId: string, groups: GroupRow[]): Promise<SummaryPreview> {
  const [modules, requirements, scenarios] = await Promise.all([
    prisma.module.findMany({
      where: { projectId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.requirement.count({ where: { projectId, deletedAt: null } }),
    prisma.scenario.count({ where: { projectId, deletedAt: null } }),
  ]);

  const casesByModule = new Map<string, number>();
  for (const group of groups) {
    const moduleId = group.scenario.requirement.moduleId;
    casesByModule.set(moduleId, (casesByModule.get(moduleId) ?? 0) + group._count.testCases);
  }

  const withCounts = modules
    .map((module) => ({ ...module, testCases: casesByModule.get(module.id) ?? 0 }))
    /* Largest first: the bar reads left to right and the biggest part of the
       project should be the first thing on it. */
    .sort((a, b) => b.testCases - a.testCases);

  const drawn = withCounts.slice(0, MODULES_DRAWN);
  const rest = withCounts.slice(MODULES_DRAWN);
  const otherCases = rest.reduce((sum, module) => sum + module.testCases, 0);
  /* Shares are worked out over the folded-in modules too, so the drawn
     segments plus the remainder still describe the whole project. */
  const shares = sharesOfTotal([...drawn.map((module) => module.testCases), otherCases]);

  return {
    modules: drawn.map((module, index) => ({ ...module, share: shares[index] })),
    otherModules: rest.length,
    requirements,
    scenarios,
    testGroups: groups.length,
    testCases: withCounts.reduce((sum, module) => sum + module.testCases, 0),
  };
}

async function buildDashboard(projectId: string, groups: GroupRow[]): Promise<DashboardPreview> {
  const [byResult, failedRows, latestRun] = await Promise.all([
    prisma.testCase.groupBy({
      by: ["testResult"],
      where: liveCaseInProject(projectId),
      _count: { _all: true },
    }),
    /* Which groups hold a failure, so the modules behind them can be counted
       from the rows already in hand rather than with a second join. */
    prisma.testCase.groupBy({
      by: ["testGroupId"],
      where: { ...liveCaseInProject(projectId), testResult: "FAILED" },
      _count: { _all: true },
    }),
    /* The round in progress, or the last one there was. The ring above is
       the project's whole life; this is the sitting somebody is actually
       in, which is the question the Dashboard is usually opened with. */
    prisma.testRun.findFirst({
      where: { projectId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true },
    }),
  ]);

  const runRows = latestRun
    ? await prisma.testRunCase.groupBy({
        by: ["testResult"],
        where: { testRunId: latestRun.id },
        _count: { _all: true },
      })
    : [];
  const runTotal = runRows.reduce((sum, row) => sum + row._count._all, 0);
  const runNotRun = runRows.find((row) => row.testResult === "NOT_RUN")?._count._all ?? 0;

  const count = (result: string) =>
    byResult.find((row) => row.testResult === result)?._count._all ?? 0;
  const passed = count("PASSED");
  const failed = count("FAILED");
  const skipped = count("SKIPPED");
  const blocked = count("BLOCKED");
  const notRun = count("NOT_RUN");
  const testCases = passed + failed + skipped + blocked + notRun;

  const moduleOf = new Map(groups.map((group) => [group.id, group.scenario.requirement.moduleId]));
  const failedModules = new Set(
    failedRows.map((row) => moduleOf.get(row.testGroupId)).filter(Boolean),
  ).size;

  return {
    testCases,
    /* The Dashboard's own Test Progress: cases with any verdict recorded,
       over the total. `calculateTestProgress` is the same sum; it is not
       imported because that module pulls the whole dashboard query in. */
    progress: testCases === 0 ? 0 : ((testCases - notRun) / testCases) * 100,
    passed,
    failed,
    skipped,
    blocked,
    notRun,
    failedModules,
    latestRun: latestRun
      ? { name: latestRun.name, answered: runTotal - runNotRun, total: runTotal }
      : null,
  };
}

/**
 * The project's last few rounds, with how far each got.
 *
 * Two queries whatever the number of rounds: the rows for every round in one
 * grouped count, split up here. The Dashboard's own run progress is built the
 * same way, for the same reason.
 */
async function buildTestRuns(projectId: string): Promise<TestRunsPreview> {
  const [total, recent] = await Promise.all([
    prisma.testRun.count({ where: { projectId, deletedAt: null } }),
    prisma.testRun.findMany({
      where: { projectId, deletedAt: null },
      select: { id: true, name: true, status: true },
      orderBy: { createdAt: "desc" },
      take: RECENT_TAKE,
    }),
  ]);

  const ids = recent.map((run) => run.id);
  const rows =
    ids.length === 0
      ? []
      : await prisma.testRunCase.groupBy({
          by: ["testRunId", "testResult"],
          where: { testRunId: { in: ids } },
          _count: { _all: true },
        });

  return {
    total,
    recent: recent.map((run) => {
      const mine = rows.filter((row) => row.testRunId === run.id);
      const count = (result: string) =>
        mine.find((row) => row.testResult === result)?._count._all ?? 0;
      const cases = mine.reduce((sum, row) => sum + row._count._all, 0);
      return {
        id: run.id,
        name: run.name,
        open: run.status === "OPEN",
        cases,
        recorded: cases - count("NOT_RUN"),
        passed: count("PASSED"),
        failed: count("FAILED"),
      };
    }),
  };
}

async function buildProblems(projectId: string): Promise<ProblemsPreview> {
  /* The report rather than the count beside it. `countCasesNeedingAttention`
     stops before it reads a single name, which is right for the Dashboard's
     one number and wrong here: the pane has room for the cases themselves,
     and reading the rounds twice to get them would cost more than the names
     do. The patterns counted are the same four either way, classified from
     the same histories, so the figure cannot disagree with the Dashboard's.
     A case whose row has since been deleted drops out here and would have
     been counted there — which is the better of the two answers. */
  const cases = await listProblemCases(projectId);
  const attention = cases.filter((problem) =>
    (ATTENTION_PATTERNS as readonly string[]).includes(problem.pattern),
  );

  const counted = ATTENTION_PATTERNS.map((key) => ({
    key,
    label: PROBLEM_LABELS[key] ?? key,
    count: attention.filter((problem) => problem.pattern === key).length,
  })).sort((a, b) => b.count - a.count);
  const shares = sharesOfLargest(counted.map((entry) => entry.count));

  return {
    total: attention.length,
    patterns: counted.map((entry, index) => ({ ...entry, share: shares[index] })),
    /* Already most-failures-first: that is the order the page itself reads
       in, so the two cannot name different worst offenders. */
    worst: attention.slice(0, WORST_DRAWN).map((problem) => ({
      id: problem.id,
      name: problem.name,
      failures: failureCount(problem.history),
    })),
  };
}

async function buildAudit(projectId: string, now: Date): Promise<AuditPreview> {
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  weekStart.setDate(weekStart.getDate() - (WEEK_DAYS - 1));

  const [week, recent] = await Promise.all([
    prisma.auditLog.findMany({
      where: { projectId, occurredAt: { gte: weekStart } },
      select: { occurredAt: true },
    }),
    prisma.auditLog.findMany({
      where: { projectId },
      select: {
        id: true,
        action: true,
        entityType: true,
        occurredAt: true,
        actor: { select: { name: true, email: true } },
      },
      orderBy: { occurredAt: "desc" },
      take: RECENT_TAKE,
    }),
  ]);

  return {
    week: weekBuckets(
      week.map((entry) => entry.occurredAt),
      now,
    ),
    total: week.length,
    recent: recent.map((entry) => ({
      id: entry.id,
      initials: initialsFor(entry.actor?.name ?? null, entry.actor?.email ?? null),
      /* The page's own words for an entry, which is `action` and the kind of
         thing it happened to. Inventing a sentence here would be a second
         vocabulary for the same log. */
      what: `${entry.action} ${entry.entityType}`,
      when: shortWhen(entry.occurredAt, now),
    })),
  };
}

/** How long ago, in as few characters as a menu row can spare. */
export function shortWhen(at: Date, now: Date): string {
  const minutes = Math.max(0, Math.round((now.getTime() - at.getTime()) / 60000));
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }
  const days = Math.round(hours / 24);
  return days < 7 ? `${days}d` : DAY_NAMES[at.getDay()];
}

async function buildNotes(projectId: string): Promise<NotesPreview> {
  const [total, recent] = await Promise.all([
    prisma.note.count({ where: { projectId, deletedAt: null } }),
    prisma.note.findMany({
      where: { projectId, deletedAt: null },
      select: { id: true, title: true, body: true, occurredOn: true, createdAt: true },
      /* The pair the Notes list itself orders by, so the newest three here
         are the top three there. */
      orderBy: [{ occurredOn: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      take: RECENT_TAKE,
    }),
  ]);

  return {
    total,
    recent: recent.map((note) => ({
      id: note.id,
      title: note.title,
      line: firstLine(note.body),
      on: shortDate(note.occurredOn ?? note.createdAt),
    })),
  };
}

/** "17 Nov" — the day and the month, which is as much as a row this size can
 *  carry and as much as a reader needs to place a note. */
export function shortDate(at: Date): string {
  return at.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

async function buildFiles(projectId: string): Promise<FilesPreview> {
  const files = await prisma.projectFile.findMany({
    where: { projectId, deletedAt: null },
    select: {
      id: true,
      fileName: true,
      contentType: true,
      size: true,
      uploadedAt: true,
    },
    orderBy: { uploadedAt: "desc" },
  });

  const byKind = new Map<string, { count: number; bytes: number }>();
  let bytes = 0;
  for (const file of files) {
    bytes += file.size;
    const kind = getFileKind(file.contentType, file.fileName);
    /* CSV and Excel are one thing to a reader looking at a bar, and two
       one-slice segments say less than one three-slice one. */
    const label = FILE_KIND_LABELS[kind] ?? kind;
    const seen = byKind.get(label) ?? { count: 0, bytes: 0 };
    byKind.set(label, { count: seen.count + 1, bytes: seen.bytes + file.size });
  }

  const kinds = Array.from(byKind.entries())
    .map(([label, totals]) => ({ key: label, label, ...totals }))
    .sort((a, b) => b.bytes - a.bytes);
  const shares = sharesOfTotal(kinds.map((kind) => kind.bytes));

  return {
    total: files.length,
    size: formatSize(bytes),
    kinds: kinds.map((kind, index) => ({
      key: kind.key,
      label: kind.label,
      count: kind.count,
      share: shares[index],
    })),
    recent: files.slice(0, RECENT_TAKE).map((file) => {
      const kind = getFileKind(file.contentType, file.fileName);
      return {
        id: file.id,
        name: file.fileName,
        size: formatSize(file.size),
        mark: fileMark(file.fileName, kind),
        kind,
      };
    }),
  };
}

async function buildLinks(projectId: string): Promise<LinksPreview> {
  const [total, recent] = await Promise.all([
    prisma.link.count({ where: { projectId, deletedAt: null } }),
    prisma.link.findMany({
      where: { projectId, deletedAt: null },
      select: { id: true, title: true, url: true },
      orderBy: { createdAt: "desc" },
      take: RECENT_TAKE,
    }),
  ]);

  return {
    total,
    recent: recent.map((link) => ({
      id: link.id,
      title: link.title,
      url: link.url,
      mark: linkMark(link.title),
    })),
  };
}

/**
 * Builds only the sections this membership may open.
 *
 * The capability each section names is the one its own page checks, so the
 * preview can never show a figure from a page the reader would be refused —
 * and a section that is simply absent is what the menu draws nothing for.
 */
export async function getMenuPreview(
  projectId: string,
  allowed: readonly CapabilityKey[],
  now: Date = new Date(),
): Promise<MenuPreview> {
  const holds = (capability: CapabilityKey) => allowed.includes(capability);

  const needsGroups =
    holds("reading.overview") || holds("reading.dashboard") || holds("authoring.view");
  const groups = needsGroups ? await readGroupsByModule(projectId) : [];

  /* Built once where both are held: the Overview's Summary and the Testing
     menu's Test Cases ask the same question, and asking it twice would be
     two of the same queries for one menu. */
  const summary =
    holds("reading.overview") || holds("authoring.view")
      ? await buildSummary(projectId, groups)
      : undefined;

  const [dashboard, problems, audit, notes, files, links, testRuns] = await Promise.all([
    holds("reading.dashboard") ? buildDashboard(projectId, groups) : undefined,
    holds("reading.problems") ? buildProblems(projectId) : undefined,
    holds("project.audit") ? buildAudit(projectId, now) : undefined,
    holds("notes.view") ? buildNotes(projectId) : undefined,
    holds("files.view") ? buildFiles(projectId) : undefined,
    holds("notes.view") ? buildLinks(projectId) : undefined,
    holds("runs.view") ? buildTestRuns(projectId) : undefined,
  ]);

  return {
    summary: holds("reading.overview") ? summary : undefined,
    testCases: holds("authoring.view") ? summary : undefined,
    testRuns,
    dashboard,
    problems,
    audit,
    notes,
    files,
    links,
  };
}
