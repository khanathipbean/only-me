import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { notifyUser } from "@/lib/notifications";
import { WORK_DAYS_BY_PRIORITY, addWorkingDays } from "@/lib/deadlines";
import type { Prisma, Priority, TestResult, WorkState } from "@/generated/prisma/client";

export class WorkValidationError extends Error {}

/**
 * Handing a failed case to somebody, and following it until it is retested.
 *
 * `TestCase.workState` and `TestCase.assigneeId` hold where it is now;
 * `WorkEvent` holds how it got there, with whatever was said at each move.
 * That is the shape `TestRunCase.testResult` and `TestResultEvent` already
 * have in this project, so there is one idea of "current value beside its
 * history" rather than two.
 */

/** Ordered as the work moves, which is also how the page groups them. */
export const WORK_STATES: WorkState[] = ["ASSIGNED", "IN_PROGRESS", "READY_TO_RETEST"];

export const WORK_STATE_LABELS: Record<WorkState, string> = {
  ASSIGNED: "To fix",
  IN_PROGRESS: "In progress",
  READY_TO_RETEST: "Ready to retest",
};

/** The case, with the project it belongs to — which both the membership
 *  check and the audit entry need. */
async function liveCaseOrThrow(testCaseId: string) {
  const testCase = await prisma.testCase.findFirst({
    where: { id: testCaseId, deletedAt: null },
    select: {
      id: true,
      assigneeId: true,
      workState: true,
      dueAt: true,
      /* The window a repair is given comes from how bad the case is, read at
       * the moment it changes hands. */
      priority: true,
      testGroup: { select: { scenario: { select: { projectId: true } } } },
    },
  });
  if (!testCase) {
    throw new WorkValidationError("That Test Case is no longer there");
  }
  return { ...testCase, projectId: testCase.testGroup.scenario.projectId };
}

/**
 * Hands a case to somebody, or takes it back when `assigneeId` is null.
 *
 * Assigning starts the loop at `ASSIGNED`; unassigning ends it, because a
 * repair with nobody on it is not in progress by any useful definition. A
 * case already part-way through keeps the step it was on when it changes
 * hands: half-done work does not become un-started because somebody else
 * took it over.
 */
export async function assignCase(
  testCaseId: string,
  assigneeId: string | null,
  actorId: string,
  note?: string,
) {
  const before = await liveCaseOrThrow(testCaseId);

  if (assigneeId) {
    await requireMember(before.projectId, assigneeId);
  }

  const toState: WorkState | null = assigneeId ? (before.workState ?? "ASSIGNED") : null;

  /* A fresh window whenever a repair starts — which is either the case
   * changing hands, or a hand-off beginning on a case that had none running.
   *
   * The second half was missing and left work with no deadline at all. The
   * loop closes when a result is recorded, which clears the date and keeps
   * the assignee, because who looked after it is worth knowing afterwards.
   * Handing it straight back to that same person is then not a change of
   * hands by any test of the column — so the repair restarted carrying no
   * promise, and the card showed nothing where every other card showed a
   * date.
   *
   * What the guard is still for: re-saving the same name while a repair is
   * already running. A control that saves on every change makes that one
   * press, and it must not buy another week. Taking the case back clears the
   * date, because there is no promise left to keep. */
  const changedHands = assigneeId !== before.assigneeId;
  const startsRepair = before.workState === null;
  const dueAt = assigneeId
    ? changedHands || startsRepair
      ? addWorkingDays(new Date(), WORK_DAYS_BY_PRIORITY[before.priority])
      : before.dueAt
    : null;

  const [testCase] = await prisma.$transaction([
    prisma.testCase.update({
      where: { id: testCaseId },
      data: { assigneeId, workState: toState, dueAt, updatedById: actorId },
    }),
    prisma.workEvent.create({
      data: { testCaseId, actorId, toState, assigneeId, note: note ?? null },
    }),
  ]);

  await writeAuditLog({
    entityType: "TestCase",
    entityId: testCaseId,
    action: "update-assignee",
    actorId,
    projectId: before.projectId,
    oldValue: { assigneeId: before.assigneeId, workState: before.workState, dueAt: before.dueAt },
    newValue: { assigneeId, workState: toState, dueAt },
  });

  /* Only the person it was handed to, and only when it is somebody new.
   * Re-saving the same name — which the control on the row makes easy —
   * should not post the same news twice. Taking a case back tells nobody:
   * work being removed is not an errand for the person it was removed from.
   */
  if (assigneeId && assigneeId !== before.assigneeId) {
    await notifyUser({
      recipientId: assigneeId,
      projectId: before.projectId,
      type: "ASSIGNED",
      title: "A case was handed to you",
      body: note ? `"${testCase.name}" — ${note}` : `"${testCase.name}" is yours to fix.`,
      link: `/projects/${before.projectId}/my-work`,
      actorId,
    });
  }

  return testCase;
}

/* Handing work to somebody who cannot open it is a dead end nobody finds
 * until they ask why it was never done. */
async function requireMember(projectId: string, userId: string) {
  const member = await prisma.projectMember.findFirst({
    where: { projectId, userId },
    select: { userId: true },
  });
  if (!member) {
    throw new WorkValidationError("That person is not a member of this project");
  }
}

/**
 * The same hand-off for a batch, from the panel on the Test Run page.
 *
 * Assigning twenty cases one at a time is twenty clicks, which is the shape
 * of the work after a round where twenty things failed. One membership check
 * covers the batch; the cases are then handed over one by one, so each still
 * gets its own event and its own audit entry, and a case that has been
 * archived since the page was drawn is skipped rather than taking the rest of
 * the batch down with it.
 */
export async function assignCases(
  testCaseIds: string[],
  assigneeId: string | null,
  actorId: string,
) {
  let assigned = 0;
  for (const testCaseId of testCaseIds) {
    try {
      await assignCase(testCaseId, assigneeId, actorId);
      assigned += 1;
    } catch (error) {
      if (error instanceof WorkValidationError) {
        continue;
      }
      throw error;
    }
  }
  return { assigned, skipped: testCaseIds.length - assigned };
}

/**
 * Moves a repair along. The one write a DEV is allowed, which is why it is
 * its own function rather than a field on the Test Case edit form.
 */
export async function setWorkState(
  testCaseId: string,
  toState: WorkState,
  actorId: string,
  note?: string,
) {
  const before = await liveCaseOrThrow(testCaseId);
  if (!before.assigneeId) {
    throw new WorkValidationError("Nobody is on this case yet");
  }

  const [testCase] = await prisma.$transaction([
    prisma.testCase.update({ where: { id: testCaseId }, data: { workState: toState } }),
    prisma.workEvent.create({
      data: { testCaseId, actorId, toState, assigneeId: before.assigneeId, note: note ?? null },
    }),
  ]);

  /* Logged like every other change to a case. A DEV's one write is the one
   * write by somebody outside `EDITOR_ROLES`, which is exactly the kind of
   * thing the trail exists for. */
  await writeAuditLog({
    entityType: "TestCase",
    entityId: testCaseId,
    action: "work-state",
    actorId,
    projectId: before.projectId,
    oldValue: { workState: before.workState },
    newValue: { workState: toState, note: note ?? null },
  });

  return testCase;
}

/**
 * What a freshly recorded result does to a repair in flight.
 *
 * Returns prepared writes rather than performing them, because they have to
 * join the transaction that writes the result — the two must land together,
 * or a crash between them leaves a case saying something about work that was
 * never recorded. One caller builds an array of queries and the other runs an
 * interactive block, and prepared queries suit both. The notification is
 * handed back instead of sent, because it must only go out once the
 * transaction has actually committed.
 *
 * The rule, by what the repair was doing when the answer arrived:
 *
 *   nothing in flight        nothing happens
 *   FAILED, not yet claimed  nothing happens
 *   FAILED after "fixed"     back to the same person, a fresh deadline
 *   anything else            the loop closes
 *
 * The middle case is the one that matters, and it was got wrong first time
 * round. People assign a case and then record the failure — the two are
 * seconds apart in the audit log — so treating every FAILED as "retested and
 * still broken" closed a hand-off five seconds after it was made, and the
 * case vanished from the page it had just arrived on. A failure only tells
 * anybody something new once somebody has claimed the thing is fixed.
 */
export function workOpsForResult(
  client: Pick<Prisma.TransactionClient, "testCase" | "workEvent">,
  before: {
    id: string;
    workState: WorkState | null;
    assigneeId: string | null;
    dueAt: Date | null;
    priority: Priority;
  },
  actorId: string,
  testResult: TestResult,
): { ops: Prisma.PrismaPromise<unknown>[]; bouncedTo: string | null } {
  /* NOT_RUN is the absence of an answer, not one: a case nobody has reached
   * carries it by default, and setting it by hand is how a result is taken
   * back. Neither says anything about the repair. */
  if (!before.workState || testResult === "NOT_RUN") {
    return { ops: [], bouncedTo: null };
  }

  if (testResult === "FAILED") {
    if (before.workState !== "READY_TO_RETEST") {
      return { ops: [], bouncedTo: null };
    }
    /* Retested, still broken. Back to the person who said it was fixed, with
     * a new window measured from now — the old one was for the attempt that
     * did not work. */
    return {
      ops: [
        client.testCase.update({
          where: { id: before.id },
          data: {
            workState: "ASSIGNED",
            dueAt: addWorkingDays(new Date(), WORK_DAYS_BY_PRIORITY[before.priority]),
          },
        }),
        client.workEvent.create({
          data: {
            testCaseId: before.id,
            actorId,
            toState: "ASSIGNED",
            assigneeId: before.assigneeId,
            note: "Retested — still failing",
          },
        }),
      ],
      bouncedTo: before.assigneeId,
    };
  }

  /* Passed, blocked or skipped: the hand-off is over either way. Blocked and
   * skipped mean "no answer yet", not "still broken", and pushing work back
   * at somebody because a test could not be run is aiming at the wrong
   * person.
   *
   * The assignee stays: who looked after it is worth knowing afterwards, and
   * the null `toState` on the event is what says the loop ended. */
  return {
    ops: [
      client.testCase.update({
        where: { id: before.id },
        data: { workState: null, dueAt: null },
      }),
      client.workEvent.create({
        data: {
          testCaseId: before.id,
          actorId,
          toState: null,
          assigneeId: before.assigneeId,
          note: null,
        },
      }),
    ],
    bouncedTo: null,
  };
}

/** What to tell somebody whose repair came back. Exported so both callers
 *  send the same thing, after their own transaction has committed. */
export async function notifyBounced(
  recipientId: string,
  projectId: string,
  testCaseName: string,
  actorId: string,
) {
  await notifyUser({
    recipientId,
    projectId,
    type: "ASSIGNED",
    title: "A case came back to you",
    body: `"${testCaseName}" was retested and is still failing.`,
    link: `/projects/${projectId}/my-work`,
    actorId,
  });
}

/** Where a case lives, which is also what identifies it in a notification. */
function testCaseHref(projectId: string, c: {
  id: string;
  testGroup: {
    id: string;
    scenario: { id: string; requirement: { id: string; moduleId: string } };
  };
}) {
  const { scenario } = c.testGroup;
  return (
    `/projects/${projectId}/modules/${scenario.requirement.moduleId}` +
    `/requirements/${scenario.requirement.id}/scenarios/${scenario.id}` +
    `/test-groups/${c.testGroup.id}/test-cases/${c.id}`
  );
}

/**
 * Tells somebody their repairs have gone past their deadline.
 *
 * Called from the endpoint the notification bell polls, which is a read path
 * that this makes write. That is a deliberate trade, not an oversight: this
 * app has no scheduled job of any kind, and the bell's poll is the only thing
 * in it that runs on a rhythm without one. The alternative that keeps the
 * read path clean — a Netlify scheduled function — is an addition to the
 * architecture, and was weighed and set aside.
 *
 * What it costs honestly: somebody who is not looking at the app is not told.
 * There is no mail here either, so "told" has always meant "sees the bell on
 * their next visit", and this delivers exactly that.
 *
 * Writing the same news twice is what would make the bell useless, so the
 * guard is the point. A deadline is reported once: a notification written
 * after it passed, for that case, means the job is done. A case that comes
 * back from a failed retest is given a new, later deadline, so when that one
 * passes there is no notification after it yet and the news is told again —
 * which is correct, because it is new news.
 */
export async function notifyOverdueWork(userId: string) {
  /* Covered by `@@index([assigneeId, dueAt])`, so the usual answer — nobody
   * has anything late — costs one indexed lookup that returns nothing. */
  const late = await prisma.testCase.findMany({
    where: {
      assigneeId: userId,
      workState: { not: null },
      deletedAt: null,
      dueAt: { lt: new Date() },
    },
    select: {
      id: true,
      name: true,
      dueAt: true,
      testGroup: {
        select: {
          id: true,
          scenario: {
            select: {
              id: true,
              projectId: true,
              requirement: { select: { id: true, moduleId: true } },
            },
          },
        },
      },
    },
  });
  if (late.length === 0) {
    return 0;
  }

  const links = late.map((c) => testCaseHref(c.testGroup.scenario.projectId, c));
  const alreadyTold = await prisma.notification.findMany({
    where: { recipientId: userId, type: "OVERDUE", link: { in: links } },
    select: { link: true, occurredAt: true },
  });

  let written = 0;
  for (const [index, testCase] of late.entries()) {
    const link = links[index];
    const told = alreadyTold.some(
      (row) => row.link === link && testCase.dueAt! < row.occurredAt,
    );
    if (told) {
      continue;
    }
    await prisma.notification.create({
      data: {
        recipientId: userId,
        projectId: testCase.testGroup.scenario.projectId,
        type: "OVERDUE",
        title: "A repair is past its date",
        body: `"${testCase.name}" was due ${testCase.dueAt!.toDateString()}.`,
        /* The case itself, not My Work: the link doubles as what says which
         * case this is about, and "this is late" is read with the thing that
         * is late in front of you. */
        link,
      },
    });
    written += 1;
  }
  return written;
}

/** The handing-over, newest first, for the card that shows one case. */
export async function listWorkHistory(testCaseId: string) {
  return prisma.workEvent.findMany({
    where: { testCaseId },
    include: {
      actor: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true } },
    },
    orderBy: { occurredAt: "desc" },
  });
}

/**
 * Everything handed to one person in one project, grouped by what has to
 * happen to it next.
 *
 * Scoped to a project on purpose. A Dev reaches this page from inside a
 * project, every link into the app already carries one, and a cross-project
 * list would have to answer "which project is this case in" on every row
 * before it could be read at all.
 *
 * The card has to say enough that nobody has to go and ask: what happened,
 * what should have happened, the steps, how many times it has failed, and
 * what is attached. All of it is on the case or one relation away, so it is
 * one query rather than one per card.
 */
export const WORK_SCOPES = ["me", "handed-out", "all"] as const;
export type WorkScope = (typeof WORK_SCOPES)[number];

export const WORK_SCOPE_OPTIONS: { value: WorkScope; label: string }[] = [
  { value: "me", label: "Assigned to me" },
  { value: "handed-out", label: "Handed out by me" },
  { value: "all", label: "Everyone" },
];

/** Which repairs the page is asking about. `me` is the default for every
 *  role, including the people who hand work out rather than do it: a page
 *  called My Work that opens on somebody else's is a page lying about its
 *  own name. */
function scopeFilter(userId: string, scope: WorkScope) {
  if (scope === "me") {
    return { assigneeId: userId };
  }
  if (scope === "handed-out") {
    /* Cases this person put into *somebody else's* hands. Read from the
     * events rather than from a column, because handing over is a thing that
     * happened rather than a property the case carries — and the case may
     * have changed hands twice since.
     *
     * The last clause is what makes it mean what it says. Every move writes
     * an event, and a Dev pressing "To fix" on their own card writes one
     * reading `ASSIGNED` with themselves as both actor and assignee — which
     * is not handing anything to anybody, and showed up here as work they
     * had given out until this was added. */
    return {
      workEvents: {
        some: { actorId: userId, toState: "ASSIGNED" as const, assigneeId: { not: userId } },
      },
    };
  }
  return {};
}

export async function listMyWork(
  projectId: string,
  userId: string,
  scope: WorkScope = "me",
) {
  return prisma.testCase.findMany({
    where: {
      ...scopeFilter(userId, scope),
      workState: { not: null },
      deletedAt: null,
      testGroup: { scenario: { projectId } },
    },
    select: {
      id: true,
      name: true,
      workState: true,
      dueAt: true,
      priority: true,
      expectedResult: true,
      condition: true,
      preconditions: true,
      testData: true,
      /* The tester's words about the failure — the single most useful line
       * on the card, and the reason a Dev can start without asking. */
      notes: true,
      testResult: true,
      steps: { orderBy: { sequence: "asc" }, select: { step: true, expectedResult: true } },
      _count: { select: { attachments: true } },
      /* Who is on it. Only ever printed when the list is somebody else's as
       * well as your own — on your own page it would say your name on every
       * card. */
      assignee: { select: { id: true, name: true, email: true } },
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
      /* Who said it was broken, so a question has somewhere to go. The last
       * failure rather than the last answer: a case handed over has failed,
       * and whoever recorded that failure is the person to ask. */
      resultEvents: {
        where: { testResult: "FAILED" },
        orderBy: { recordedAt: "desc" },
        take: 1,
        select: { recordedAt: true, notes: true, recordedBy: { select: { name: true } } },
      },
      /* How the case got here — the hand-off history, on the card rather
       * than behind a link, because "who gave me this and what did they say"
       * is asked about the case in front of you. Ten is every move a repair
       * realistically makes; a case with more than that has a problem the
       * list is not going to solve. */
      workEvents: {
        orderBy: { occurredAt: "desc" },
        take: 10,
        select: {
          id: true,
          occurredAt: true,
          note: true,
          toState: true,
          actor: { select: { name: true } },
          assignee: { select: { name: true } },
        },
      },
    },
    /* Soonest deadline first, which puts anything already late at the very
     * top without a separate rule for it — a date in the past sorts before
     * every date in the future. Cases handed out before deadlines existed
     * carry none and go last, then worst priority first among them. */
    orderBy: [
      { dueAt: { sort: "asc", nulls: "last" } },
      { priority: "asc" },
      { updatedAt: "asc" },
    ],
  });
}

export type MyWorkCase = Awaited<ReturnType<typeof listMyWork>>[number];
