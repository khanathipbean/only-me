import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/dates";
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
  /** Null when these answers were recorded outside any round. */
  testRunId: string | null;
  /** The round's name, or — outside a round — the day they were recorded. */
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

type RoundRow = {
  testCaseId: string;
  testResult: TestResult;
  notes: string | null;
  ranAt: Date | null;
  ranBy: { name: string } | null;
  events: EventRow[];
  testRun: { id: string; name: string; phase: string | null; createdAt: Date };
};

type LooseRow = EventRow & { testCaseId: string };

/** An entry with the moment it is sorted by, which is not part of the entry. */
type Placed = { entry: RunHistoryEntry; at: Date };

/**
 * When a round goes in the strip: when the round was made.
 *
 * Not when its first answer was given, which was tried and is wrong — a round
 * that has been scheduled and not yet reached has no answer to go by, so it
 * fell back to its own creation and jumped ahead of rounds that were created
 * earlier and run later. A round's place in the sequence is the sequence
 * itself, and rounds keep the order they have always had.
 *
 * A group of answers recorded outside a round is placed by when they were
 * recorded instead, which is the only thing it has. The two keys differ, and
 * in the normal shape — a sprint is made, then run — they agree. A sprint made
 * long before it is run will sit ahead of anything recorded in between.
 */
function placeRound(row: RoundRow): Placed {
  return {
    at: row.testRun.createdAt,
    entry: {
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
    },
  };
}

/** The local day an answer was given, which is what groups the loose ones. */
function dayKey(at: Date) {
  return `${at.getFullYear()}-${at.getMonth()}-${at.getDate()}`;
}

/**
 * Answers recorded outside any round, gathered into one group per day.
 *
 * A day rather than each answer on its own, so the strip reads the same way
 * for both kinds: a group is a sitting, and the squares inside it are what was
 * tried during it. Without this, somebody who records five results on a
 * Tuesday afternoon would read as five separate occasions.
 */
function placeLoose(events: LooseRow[]): Placed[] {
  const byDay = new Map<string, LooseRow[]>();
  for (const event of events) {
    const key = dayKey(event.recordedAt);
    const bucket = byDay.get(key);
    if (bucket) {
      bucket.push(event);
    } else {
      byDay.set(key, [event]);
    }
  }

  return [...byDay.values()].map((group) => {
    const last = group[group.length - 1];
    return {
      at: group[0].recordedAt,
      entry: {
        testRunId: null,
        runName: formatDate(group[0].recordedAt),
        phase: null,
        testResult: last.testResult,
        notes: last.notes,
        ranAt: last.recordedAt,
        ranBy: last.recordedBy?.name ?? null,
        attempts: toAttempts(group),
        everFailed: group.some((event) => event.testResult === "FAILED"),
      },
    };
  });
}

/**
 * Both kinds of group, per case, oldest first.
 *
 * Rounds keep coming from `TestRunCase`, not from the events, because the 152
 * rows recorded before answers were kept one by one have no events at all and
 * would vanish from every strip in the app.
 */
function buildHistories(rounds: RoundRow[], loose: LooseRow[]) {
  const placed = new Map<string, Placed[]>();
  const add = (testCaseId: string, item: Placed) => {
    const bucket = placed.get(testCaseId);
    if (bucket) {
      bucket.push(item);
    } else {
      placed.set(testCaseId, [item]);
    }
  };

  for (const row of rounds) {
    add(row.testCaseId, placeRound(row));
  }
  const looseByCase = new Map<string, LooseRow[]>();
  for (const event of loose) {
    const bucket = looseByCase.get(event.testCaseId);
    if (bucket) {
      bucket.push(event);
    } else {
      looseByCase.set(event.testCaseId, [event]);
    }
  }
  for (const [testCaseId, events] of looseByCase) {
    for (const item of placeLoose(events)) {
      add(testCaseId, item);
    }
  }

  const byCase = new Map<string, RunHistoryEntry[]>();
  for (const [testCaseId, items] of placed) {
    byCase.set(
      testCaseId,
      items.sort((a, b) => a.at.getTime() - b.at.getTime()).map((item) => item.entry),
    );
  }
  return byCase;
}

const LOOSE_EVENT_SELECT = {
  testCaseId: true,
  testResult: true,
  notes: true,
  recordedAt: true,
  recordedBy: { select: { name: true } },
} as const;

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
  if (testCaseIds.length === 0) {
    return new Map();
  }

  const [rounds, loose] = await Promise.all([
    prisma.testRunCase.findMany({
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
    }),
    prisma.testResultEvent.findMany({
      where: { testCaseId: { in: testCaseIds }, testRunCaseId: null },
      select: LOOSE_EVENT_SELECT,
      orderBy: { recordedAt: "asc" },
    }),
  ]);

  return buildHistories(rounds, loose);
}

/**
 * One mark per answer that was recorded, oldest first — the strip's unit.
 *
 * Not one per round. A round holds as many answers as the tester gave it,
 * and collapsing them to the round's last one hides the failure that caused
 * the work, which is the thing the strip exists to show. Which group a mark
 * belongs to is not lost: it is on the mark, and the tooltip says it.
 *
 * A group with no recorded answers still gets exactly one mark, from the
 * round's own result. Two cases need this and neither is an edge case:
 * a case sitting in a round nobody has reached yet, and every round recorded
 * before results were kept individually — drawing those from attempts alone
 * would empty the strip of all the history there was.
 */
export type ResultMark = {
  /** Null when this was recorded outside any round — there is nowhere to link
   *  to, and the strip draws it with an edge to say so. */
  testRunId: string | null;
  runName: string;
  testResult: TestResult;
  at: Date | null;
  by: string | null;
  notes: string | null;
  /** First mark of its group, so the groups stay visible as groups. */
  startsRound: boolean;
};

export function toResultMarks(entries: RunHistoryEntry[]): ResultMark[] {
  return entries.flatMap<ResultMark>((entry) => {
    const group = { testRunId: entry.testRunId, runName: entry.runName };
    if (entry.attempts.length === 0) {
      return [
        {
          ...group,
          testResult: entry.testResult,
          at: entry.ranAt,
          by: entry.ranBy,
          notes: entry.notes,
          startsRound: true,
        },
      ];
    }
    return entry.attempts.map((attempt, index) => ({
      ...group,
      testResult: attempt.testResult,
      at: attempt.recordedAt,
      by: attempt.recordedBy,
      notes: attempt.notes,
      startsRound: index === 0,
    }));
  });
}

/**
 * How many times anyone has recorded a failure for this case.
 *
 * Every failure, not every round that ended in one: a round where the tester
 * reported it broken three times before it was fixed cost three round trips,
 * and that is what "fails often" means to the person asking. A group recorded
 * before answers were kept one by one has no attempts, so its own result
 * stands in for the single answer it represents.
 */
export function failureCount(entries: RunHistoryEntry[]) {
  return entries.reduce((total, entry) => {
    if (entry.attempts.length === 0) {
      return total + (entry.testResult === "FAILED" ? 1 : 0);
    }
    return total + entry.attempts.filter((attempt) => attempt.testResult === "FAILED").length;
  }, 0);
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

/** When this case was last answered for, as a number, for ordering. */
function lastAnsweredAt(entries: RunHistoryEntry[]) {
  let latest = 0;
  for (const entry of entries) {
    for (const attempt of entry.attempts) {
      latest = Math.max(latest, attempt.recordedAt.getTime());
    }
    if (entry.ranAt) {
      latest = Math.max(latest, entry.ranAt.getTime());
    }
  }
  return latest;
}

export type ProblemCase = {
  id: string;
  name: string;
  /** Module › Requirement › Scenario › Test Group, so a row can be acted on
   *  without first working out where it lives. */
  path: string;
  /** The Requirement's feature tag, if it carries one — the label the team
   *  groups work by, so a row can be placed without reading the whole path. */
  feature: string | null;
  href: string;
  pattern: CasePattern;
  history: RunHistoryEntry[];
  brokeAt: RunHistoryEntry | null;
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
  /* Phase is a property of a round, so an answer recorded outside one has no
   * phase to match. Narrowing to a phase is asking "what happened in this
   * phase", and the honest answer leaves them out rather than letting them in
   * under a phase they were never part of. */
  const wantsLoose = !filters.phase;

  const caseWhere = {
    deletedAt: null,
    ...(filters.moduleId
      ? { testGroup: { scenario: { requirement: { moduleId: filters.moduleId } } } }
      : {}),
  };

  const [rounds, loose] = await Promise.all([
    prisma.testRunCase.findMany({
      where: {
        testRun: {
          projectId,
          deletedAt: null,
          ...(filters.phase ? { phase: filters.phase } : {}),
        },
        testCase: caseWhere,
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
    }),
    wantsLoose
      ? prisma.testResultEvent.findMany({
          where: {
            testRunCaseId: null,
            testCase: {
              ...caseWhere,
              testGroup: {
                ...(caseWhere.testGroup ?? {}),
                scenario: {
                  ...(caseWhere.testGroup?.scenario ?? {}),
                  requirement: {
                    ...(caseWhere.testGroup?.scenario?.requirement ?? {}),
                    projectId,
                  },
                },
              },
            },
          },
          select: LOOSE_EVENT_SELECT,
          orderBy: { recordedAt: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const byCase = buildHistories(rounds, loose);

  /* Only `untested` is left out: with no pass and no fail there is no shape
   * to show, and the Runs column on the Test Cases list is where a case
   * nothing has reached is found. Everything anyone has answered for is
   * here, `stable` included — the page is read to judge a case as well as to
   * fix one, and "this has passed every time for six rounds" is the answer
   * to half of those questions. The sections keep them apart. */
  const interesting = [...byCase.entries()]
    .map(([id, history]) => ({ id, history, pattern: classifyPattern(history) }))
    .filter((row) => row.pattern !== "untested");

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
                select: {
                  id: true,
                  name: true,
                  feature: true,
                  module: { select: { id: true, name: true } },
                },
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
        feature: requirement.feature,
        href:
          `/projects/${projectId}/modules/${requirement.module.id}` +
          `/requirements/${requirement.id}/scenarios/${scenario.id}` +
          `/test-groups/${group.id}/test-cases/${id}`,
        pattern,
        history,
        brokeAt: brokeAt(history),
      } satisfies ProblemCase;
    })
    .filter((row): row is ProblemCase => row !== null)
    /* Most failures first. Within one pattern the count is the only thing
     * that separates a case somebody should look at today from one that
     * slipped once a year ago, and the order used to be whatever the
     * database handed back. Ties go to whichever was answered for most
     * recently, so a long-quiet case sinks below a live one. */
    .sort((a, b) => {
      const byFailures = failureCount(b.history) - failureCount(a.history);
      if (byFailures !== 0) {
        return byFailures;
      }
      return lastAnsweredAt(b.history) - lastAnsweredAt(a.history);
    });
}

/** The order the page reads in: what broke first, what never worked next,
 *  what cannot be trusted after that, what got fixed, and what has never
 *  given anyone trouble last. */
export const PROBLEM_PATTERN_ORDER = [
  "regression",
  "never-passed",
  "unstable",
  "reworked",
  "recovered",
  "stable",
] as const satisfies readonly CasePattern[];
