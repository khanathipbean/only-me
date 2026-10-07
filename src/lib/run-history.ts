import { prisma } from "@/lib/prisma";
import type { TestResult } from "@/generated/prisma/client";

/**
 * What a Test Case's rounds say about it.
 *
 * `TestCase.testResult` holds the newest round's answer and nothing else, so
 * the rounds before it — and the note someone typed when it failed — were
 * reachable only by opening each round and finding the row. This reads them
 * back the other way round, from the case.
 *
 * Nothing here changes a row; it is the one place the three views that need
 * this history get it, so they cannot disagree about what counts.
 */

export type RunHistoryEntry = {
  testRunId: string;
  runName: string;
  phase: string | null;
  /** Where the round ended up — the latest answer recorded in it. */
  testResult: TestResult;
  /** What was written down with that latest answer. */
  notes: string | null;
  ranAt: Date | null;
  ranBy: string | null;
  /**
   * Every answer recorded in this round, oldest first.
   *
   * A round normally holds more than one: the tester records a failure,
   * somebody fixes it, the tester comes back. The round ends green and the
   * work it took is the part worth knowing.
   */
  attempts: RunAttempt[];
  /** True if any attempt in this round failed, whatever it ended on. */
  everFailed: boolean;
};

export type RunAttempt = {
  testResult: TestResult;
  notes: string | null;
  recordedAt: Date;
  recordedBy: string | null;
};


/** The attempts a row carries, oldest first, from the rows Prisma returned. */
type EventRow = {
  testResult: TestResult;
  notes: string | null;
  recordedAt: Date;
  recordedBy: { name: string } | null;
};

const EVENT_SELECT = {
  select: {
    testResult: true,
    notes: true,
    recordedAt: true,
    recordedBy: { select: { name: true } },
  },
  orderBy: { recordedAt: "asc" },
} as const;

function toAttempts(events: EventRow[]): RunAttempt[] {
  return events.map((event) => ({
    testResult: event.testResult,
    notes: event.notes,
    recordedAt: event.recordedAt,
    recordedBy: event.recordedBy?.name ?? null,
  }));
}

/**
 * Oldest round first, which is what makes a pattern legible: read left to
 * right and "passed, passed, failed" is a different story from "failed,
 * failed, passed" even though the counts match.
 *
 * Ordered by the round's `createdAt` rather than `startsOn`, which is
 * optional and often unset — the same ordering the result mirror and the
 * Dashboard's round picker already use.
 *
 * One query for every case asked about, grouped in memory: these are called
 * from pages showing dozens of rows at once, and one round trip per row is
 * how a list page becomes slow without anyone noticing which change did it.
 */
export async function listRunHistoryForCases(
  testCaseIds: string[],
): Promise<Map<string, RunHistoryEntry[]>> {
  const byCase = new Map<string, RunHistoryEntry[]>();
  if (testCaseIds.length === 0) {
    return byCase;
  }

  const rows = await prisma.testRunCase.findMany({
    where: {
      testCaseId: { in: testCaseIds },
      /* An archived round still owns its TestRunCase rows. The Dashboard was
       * bitten by exactly this once — 142 cases read as "scheduled" while the
       * rounds on screen covered 21, the difference being one archived round.
       * A history that counts rounds nobody can open would mislead the same
       * way. */
      testRun: { deletedAt: null },
    },
    select: {
      testCaseId: true,
      testResult: true,
      notes: true,
      ranAt: true,
      ranBy: { select: { name: true } },
      events: EVENT_SELECT,
      testRun: { select: { id: true, name: true, phase: true, createdAt: true } },
    },
    orderBy: { testRun: { createdAt: "asc" } },
  });

  for (const row of rows) {
    const entry: RunHistoryEntry = {
      testRunId: row.testRun.id,
      runName: row.testRun.name,
      phase: row.testRun.phase,
      testResult: row.testResult,
      notes: row.notes,
      ranAt: row.ranAt,
      ranBy: row.ranBy?.name ?? null,
      attempts: toAttempts(row.events),
      /* Whatever the round ended on. A round that went red before it went
       * green is the one worth seeing, and the row's own result cannot say
       * so — it only ever holds the last answer. */
      everFailed: row.events.some((event) => event.testResult === "FAILED"),
    };
    const existing = byCase.get(row.testCaseId);
    if (existing) {
      existing.push(entry);
    } else {
      byCase.set(row.testCaseId, [entry]);
    }
  }

  return byCase;
}

/** The counts the summary line above a history is built from. */
export function summariseHistory(entries: RunHistoryEntry[]) {
  const rounds = entries.length;
  const ran = entries.filter((entry) => entry.testResult !== "NOT_RUN").length;
  const failed = entries.filter((entry) => entry.testResult === "FAILED").length;
  /* Rounds that reported a failure at some point, whether or not they ended on
   * one. `failed` answers "how often was it left broken"; this answers "how
   * often did it cost someone a round trip", and they are different numbers. */
  const hadFailure = entries.filter((entry) => entry.everFailed || entry.testResult === "FAILED")
    .length;
  return { rounds, ran, failed, hadFailure };
}

/**
 * What shape a case's failures make, which is the thing worth sorting by.
 *
 * "Failed 3 times" is not actionable on its own: a case that has failed every
 * round since it was written, one that passed for months and broke last
 * week, and one that cannot make up its mind need three different people to
 * look at three different things. The count is the same for all three.
 */
export type CasePattern =
  /** No round has reached a verdict on it yet. */
  | "untested"
  /** Failed every round that reached a verdict. Usually the feature isn't
   *  built, or the case describes something that was never true. */
  | "never-passed"
  /** Passed, then failed and stayed failed. Something broke, recently. */
  | "regression"
  /** Changed its mind more than once. Often the case or its data rather than
   *  the feature. */
  | "unstable"
  /** Failed, then passed and stayed passing. Here so a fix can be seen. */
  | "recovered"
  /** Every round ends green, but not on the first try. The loop of record a
   *  failure, wait for a fix, come back is work, and a case that costs it
   *  every round is worth looking at even though nothing is ever left
   *  broken — which is exactly the case the old rule could not see, because
   *  the round's own result had been written over by the time it ended. */
  | "reworked"
  /** Passed every round, first time, every time. */
  | "stable";

/**
 * Only PASSED and FAILED are verdicts.
 *
 * NOT_RUN means the round never got to it, SKIPPED that someone decided not
 * to, and BLOCKED that something stopped them — none of the three says
 * anything about whether the case works, and folding them in would read a
 * blocked round as a failure and send someone hunting a bug that was never
 * reported.
 */
function verdicts(entries: RunHistoryEntry[]) {
  return entries
    .map((entry) => entry.testResult)
    .filter((result): result is "PASSED" | "FAILED" => result === "PASSED" || result === "FAILED");
}

/**
 * Takes a case's rounds oldest-first and names the shape.
 *
 * The rule is five mutually exclusive cases and no thresholds to tune:
 * nothing to go on, all one way, more than one change of mind, or exactly
 * one change — and then which way it ended.
 *
 * `changes` rather than "failed recently" deliberately. A count of failures
 * cannot separate "passed, failed, failed" from "failed, passed, failed";
 * counting how often the answer flipped can, and that is the whole
 * distinction between something that broke and something that is unreliable.
 */
export function classifyPattern(entries: RunHistoryEntry[]): CasePattern {
  const results = verdicts(entries);
  if (results.length === 0) {
    return "untested";
  }
  if (results.every((result) => result === "FAILED")) {
    return "never-passed";
  }
  if (results.every((result) => result === "PASSED")) {
    /* Green at the end of every round is not the same as green all the way
     * through one. */
    return entries.some((entry) => entry.everFailed) ? "reworked" : "stable";
  }

  let changes = 0;
  for (let i = 1; i < results.length; i++) {
    if (results[i] !== results[i - 1]) {
      changes++;
    }
  }
  if (changes > 1) {
    return "unstable";
  }
  return results[results.length - 1] === "FAILED" ? "regression" : "recovered";
}

/**
 * The round a regression started at — the first failure after the last pass.
 *
 * Null for every other pattern: on an unstable case there is no single
 * moment to point at, and saying one would be picking a round out of several
 * and calling it the cause.
 */
export function brokeAt(entries: RunHistoryEntry[]): RunHistoryEntry | null {
  if (classifyPattern(entries) !== "regression") {
    return null;
  }
  const withVerdicts = entries.filter(
    (entry) => entry.testResult === "PASSED" || entry.testResult === "FAILED",
  );
  return withVerdicts.find((entry) => entry.testResult === "FAILED") ?? null;
}

/**
 * The last time this case was reported broken, and what was written about it.
 *
 * Deliberately not "the last round whose result is FAILED". A round where the
 * tester reported a failure, the developer fixed it and the tester came back
 * ends PASSED, and the note describing the failure is on the attempt, not on
 * the round. Reading only the round's own result would show "No note was
 * left" for precisely the cases someone came here to read about.
 */
export type FailureMoment = {
  testRunId: string;
  runName: string;
  notes: string | null;
  at: Date | null;
  by: string | null;
  /** True when the round this failure sits in went on to pass. */
  fixedInRound: boolean;
};

export function lastFailure(entries: RunHistoryEntry[]): FailureMoment | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.testResult === "FAILED") {
      return {
        testRunId: entry.testRunId,
        runName: entry.runName,
        notes: entry.notes,
        at: entry.ranAt,
        by: entry.ranBy,
        fixedInRound: false,
      };
    }
    /* The round ended on something else, but went red along the way. */
    const failed = [...entry.attempts].reverse().find((a) => a.testResult === "FAILED");
    if (failed) {
      return {
        testRunId: entry.testRunId,
        runName: entry.runName,
        notes: failed.notes,
        at: failed.recordedAt,
        by: failed.recordedBy,
        fixedInRound: entry.testResult === "PASSED",
      };
    }
  }
  return null;
}

export type ProblemCase = {
  id: string;
  name: string;
  /** Module › Requirement › Scenario › Test Group, so a row can be acted on
   *  without first working out where it lives. */
  path: string;
  href: string;
  pattern: CasePattern;
  history: RunHistoryEntry[];
  brokeAt: RunHistoryEntry | null;
  lastFailure: FailureMoment | null;
};

export type ProblemCaseFilters = {
  /** One phase's rounds only. "Fails often" usually means now rather than
   *  ever, but not always, so it is the reader's filter rather than a
   *  decision taken for them. */
  phase?: string;
  moduleId?: string;
};

/**
 * Every case in a project whose rounds make a shape worth looking at.
 *
 * Two queries, not one per case. The first reads the rounds — narrow columns
 * over a table indexed by `testCaseId` — and the second reads names and
 * places only for the cases that turn out to be worth showing, which on a
 * healthy project is a small fraction of them.
 *
 * Cases nothing has reached are deliberately absent: with no verdicts there
 * is no shape, and they are the Runs column's job on the Test Cases list.
 */
export async function listProblemCases(
  projectId: string,
  filters: ProblemCaseFilters = {},
): Promise<ProblemCase[]> {
  const rows = await prisma.testRunCase.findMany({
    where: {
      testRun: {
        projectId,
        deletedAt: null,
        ...(filters.phase ? { phase: filters.phase } : {}),
      },
      testCase: {
        deletedAt: null,
        ...(filters.moduleId
          ? { testGroup: { scenario: { requirement: { moduleId: filters.moduleId } } } }
          : {}),
      },
    },
    select: {
      testCaseId: true,
      testResult: true,
      notes: true,
      ranAt: true,
      ranBy: { select: { name: true } },
      events: EVENT_SELECT,
      testRun: { select: { id: true, name: true, phase: true } },
    },
    orderBy: { testRun: { createdAt: "asc" } },
  });

  const byCase = new Map<string, RunHistoryEntry[]>();
  for (const row of rows) {
    const entry: RunHistoryEntry = {
      testRunId: row.testRun.id,
      runName: row.testRun.name,
      phase: row.testRun.phase,
      testResult: row.testResult,
      notes: row.notes,
      ranAt: row.ranAt,
      ranBy: row.ranBy?.name ?? null,
      attempts: toAttempts(row.events),
      /* Whatever the round ended on. A round that went red before it went
       * green is the one worth seeing, and the row's own result cannot say
       * so — it only ever holds the last answer. */
      everFailed: row.events.some((event) => event.testResult === "FAILED"),
    };
    const existing = byCase.get(row.testCaseId);
    if (existing) {
      existing.push(entry);
    } else {
      byCase.set(row.testCaseId, [entry]);
    }
  }

  /* `stable` and `untested` are left out: a case that has only ever passed
   * is not a problem, and one with no verdicts has no shape to show. The
   * page is a list of things to do something about, and padding it with the
   * rest would bury them. */
  const interesting = [...byCase.entries()]
    .map(([id, history]) => ({ id, history, pattern: classifyPattern(history) }))
    .filter((row) => row.pattern !== "stable" && row.pattern !== "untested");

  if (interesting.length === 0) {
    return [];
  }

  const cases = await prisma.testCase.findMany({
    where: { id: { in: interesting.map((row) => row.id) } },
    select: {
      id: true,
      name: true,
      testGroup: {
        select: {
          id: true,
          name: true,
          scenario: {
            select: {
              id: true,
              name: true,
              requirement: {
                select: { id: true, name: true, module: { select: { id: true, name: true } } },
              },
            },
          },
        },
      },
    },
  });
  const detailById = new Map(cases.map((row) => [row.id, row]));

  return interesting
    .map(({ id, history, pattern }) => {
      const detail = detailById.get(id);
      if (!detail) {
        return null;
      }
      const group = detail.testGroup;
      const scenario = group.scenario;
      const requirement = scenario.requirement;
      return {
        id,
        name: detail.name,
        path: [requirement.module.name, requirement.name, scenario.name, group.name].join(" › "),
        href:
          `/projects/${projectId}/modules/${requirement.module.id}` +
          `/requirements/${requirement.id}/scenarios/${scenario.id}` +
          `/test-groups/${group.id}/test-cases/${id}`,
        pattern,
        history,
        brokeAt: brokeAt(history),
        lastFailure: lastFailure(history),
      } satisfies ProblemCase;
    })
    .filter((row): row is ProblemCase => row !== null);
}

/** The order the page reads in: what broke first, what never worked next,
 *  what cannot be trusted after that, and what got fixed last. */
export const PROBLEM_PATTERN_ORDER = [
  "regression",
  "never-passed",
  "unstable",
  "reworked",
  "recovered",
] as const satisfies readonly CasePattern[];
