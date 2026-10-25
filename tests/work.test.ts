import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createScenario } from "@/lib/scenarios";
import { findOrCreateUnassignedRequirement } from "@/lib/requirements";
import { createTestGroup } from "@/lib/test-groups";
import { createTestCase, updateTestResultAndNotes } from "@/lib/test-cases";
import { addCasesToRun, createRun, setRunCaseResult } from "@/lib/test-runs";
import { addWorkingDays } from "@/lib/deadlines";
import {
  countWorkByAssignee,
  WorkValidationError,
  assignCase,
  assignCases,
  listFinishedWork,
  listMyWork,
  listWorkHistory,
  notifyOverdueWork,
  setWorkState,
} from "@/lib/work";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import { POST as createProjectRoute } from "@/app/api/projects/route";
import {
  createUser,
  jsonRequest,
  sessionFor,
  uniqueCode,
  uniqueEmail,
  uniqueName,
} from "./support/fixtures";

const mockAuth = vi.mocked(auth);

/** A project with one Test Case and a Dev on the team, ready to be handed work. */
async function seed() {
  const code = uniqueCode("prj-work");
  const owner = await createUser(uniqueEmail("work-owner"));
  mockAuth.mockResolvedValue(sessionFor(owner.id) as never);

  const project = await (
    await createProjectRoute(
      jsonRequest("http://test/api/projects", "POST", {
        code,
        name: `Project ${code}`,
        status: "DRAFT",
      }),
    )
  ).json();

  const requirementId = await findOrCreateUnassignedRequirement(project.id, owner.id);
  const scenario = await createScenario(
    project.id,
    { name: `Scenario ${code}`, requirementId, expectedResult: "ok", priority: "MEDIUM" },
    owner.id,
  );
  const group = await createTestGroup(scenario.id, { name: `Group ${code}` }, owner.id);
  const testCase = await createTestCase(
    group.id,
    {
      name: `Case ${code}`,
      expectedResult: "ok",
      priority: "MEDIUM",
      steps: [{ step: "s", expectedResult: "r" }],
    },
    owner.id,
  );

  const dev = await createUser(uniqueEmail("work-dev"));
  await prisma.projectMember.create({
    data: { projectId: project.id, userId: dev.id, role: "DEV" },
  });

  return { owner, dev, project, testCase };
}

describe("handing a case out", () => {
  beforeEach(() => {
    mockAuth.mockReset();
  });

  it("starts the loop at ASSIGNED and records who gave it to whom", async () => {
    const { owner, dev, testCase } = await seed();

    await assignCase(testCase.id, dev.id, owner.id, "cannot log in");

    const after = await prisma.testCase.findUniqueOrThrow({ where: { id: testCase.id } });
    expect(after.assigneeId).toBe(dev.id);
    expect(after.workState).toBe("ASSIGNED");

    const history = await listWorkHistory(testCase.id);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      actorId: owner.id,
      assigneeId: dev.id,
      toState: "ASSIGNED",
      note: "cannot log in",
    });
  });

  it("refuses somebody who is not on the project", async () => {
    const { owner, testCase } = await seed();
    const stranger = await createUser(uniqueEmail("work-stranger"));

    await expect(assignCase(testCase.id, stranger.id, owner.id)).rejects.toThrow(
      WorkValidationError,
    );

    const after = await prisma.testCase.findUniqueOrThrow({ where: { id: testCase.id } });
    expect(after.assigneeId).toBeNull();
    expect(after.workState).toBeNull();
  });

  it("ends the loop when the case is taken back", async () => {
    const { owner, dev, testCase } = await seed();
    await assignCase(testCase.id, dev.id, owner.id);

    await assignCase(testCase.id, null, owner.id);

    const after = await prisma.testCase.findUniqueOrThrow({ where: { id: testCase.id } });
    expect(after.assigneeId).toBeNull();
    expect(after.workState).toBeNull();
  });

  it("keeps the step it was on when the case is handed to somebody else", async () => {
    const { owner, dev, project, testCase } = await seed();
    await assignCase(testCase.id, dev.id, owner.id);
    await setWorkState(testCase.id, "IN_PROGRESS", dev.id);

    const other = await createUser(uniqueEmail("work-dev2"));
    await prisma.projectMember.create({
      data: { projectId: project.id, userId: other.id, role: "DEV" },
    });
    await assignCase(testCase.id, other.id, owner.id);

    const after = await prisma.testCase.findUniqueOrThrow({ where: { id: testCase.id } });
    expect(after.assigneeId).toBe(other.id);
    // Half-done work does not become un-started because somebody else took it over.
    expect(after.workState).toBe("IN_PROGRESS");
  });
});

describe("how long the repair is given", () => {
  beforeEach(() => {
    mockAuth.mockReset();
  });

  /** The same date the library would work out, to the minute. */
  function expectedDue(days: number) {
    return addWorkingDays(new Date(), days);
  }

  it.each([
    ["CRITICAL", 1],
    ["HIGH", 3],
    ["MEDIUM", 5],
    ["LOW", 7],
  ] as const)("gives a %s case %i working days", async (priority, days) => {
    const { owner, dev, testCase } = await seed();
    await prisma.testCase.update({ where: { id: testCase.id }, data: { priority } });

    await assignCase(testCase.id, dev.id, owner.id);

    const after = await prisma.testCase.findUniqueOrThrow({ where: { id: testCase.id } });
    expect(after.dueAt).not.toBeNull();
    // To the minute: both go through the same working-day walk from now.
    expect(Math.abs(after.dueAt!.getTime() - expectedDue(days).getTime())).toBeLessThan(60_000);
  });

  it("gives a new window when the same person is handed it again later", async () => {
    /* The sequence that showed up in use: handed over, a result recorded —
       which closes the loop, clearing the date and keeping the assignee —
       and then handed straight back to the same person. That is a new repair
       starting, and it was arriving with no deadline at all, because the
       assignee column had not changed. */
    const { owner, dev, testCase } = await seed();
    await assignCase(testCase.id, dev.id, owner.id);
    await updateTestResultAndNotes(testCase.id, { testResult: "PASSED" }, owner.id);

    const closed = await prisma.testCase.findUniqueOrThrow({ where: { id: testCase.id } });
    expect(closed.dueAt).toBeNull();
    expect(closed.assigneeId).toBe(dev.id);

    await assignCase(testCase.id, dev.id, owner.id);

    const after = await prisma.testCase.findUniqueOrThrow({ where: { id: testCase.id } });
    expect(after.workState).toBe("ASSIGNED");
    expect(after.dueAt).not.toBeNull();
  });

  it("does not extend the window when the same person is saved again", async () => {
    const { owner, dev, testCase } = await seed();
    await assignCase(testCase.id, dev.id, owner.id);
    const first = (await prisma.testCase.findUniqueOrThrow({ where: { id: testCase.id } })).dueAt;

    /* A control that saves on every change makes this one click. If it reset
     * the window, pressing it again would be a way to buy another week. */
    await assignCase(testCase.id, dev.id, owner.id);

    const after = await prisma.testCase.findUniqueOrThrow({ where: { id: testCase.id } });
    expect(after.dueAt!.getTime()).toBe(first!.getTime());
  });

  it("starts the window again for a new person", async () => {
    const { owner, dev, project, testCase } = await seed();
    await assignCase(testCase.id, dev.id, owner.id);

    const other = await createUser(uniqueEmail("work-dev3"));
    await prisma.projectMember.create({
      data: { projectId: project.id, userId: other.id, role: "DEV" },
    });
    await prisma.testCase.update({
      where: { id: testCase.id },
      data: { dueAt: new Date("2020-01-01") },
    });

    await assignCase(testCase.id, other.id, owner.id);

    const after = await prisma.testCase.findUniqueOrThrow({ where: { id: testCase.id } });
    expect(after.dueAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it("has no deadline once nobody is on it", async () => {
    const { owner, dev, testCase } = await seed();
    await assignCase(testCase.id, dev.id, owner.id);

    await assignCase(testCase.id, null, owner.id);

    const after = await prisma.testCase.findUniqueOrThrow({ where: { id: testCase.id } });
    expect(after.dueAt).toBeNull();
  });
});

describe("handing out a batch", () => {
  beforeEach(() => {
    mockAuth.mockReset();
  });

  /** Two more cases beside the one `seed` makes, in the same Test Group. */
  async function moreCases(testCaseId: string, owner: { id: string }, count: number) {
    const { testGroupId } = await prisma.testCase.findUniqueOrThrow({
      where: { id: testCaseId },
      select: { testGroupId: true },
    });
    const made = [];
    for (let index = 0; index < count; index += 1) {
      made.push(
        await createTestCase(
          testGroupId,
          {
            name: uniqueName(`Batch ${index}`),
            expectedResult: "ok",
            priority: "MEDIUM",
            steps: [{ step: "s", expectedResult: "r" }],
          },
          owner.id,
        ),
      );
    }
    return made;
  }

  it("gives every case its own event", async () => {
    const { owner, dev, testCase } = await seed();
    const rest = await moreCases(testCase.id, owner, 2);
    const ids = [testCase.id, ...rest.map((row) => row.id)];

    expect(await assignCases(ids, dev.id, owner.id)).toEqual({ assigned: 3, skipped: 0 });

    for (const id of ids) {
      const after = await prisma.testCase.findUniqueOrThrow({ where: { id } });
      expect(after.assigneeId).toBe(dev.id);
      expect(after.workState).toBe("ASSIGNED");
      expect(await listWorkHistory(id)).toHaveLength(1);
    }
  });

  it("skips a case that has gone, and hands over the rest", async () => {
    const { owner, dev, testCase } = await seed();
    const rest = await moreCases(testCase.id, owner, 1);
    await prisma.testCase.update({
      where: { id: testCase.id },
      data: { deletedAt: new Date() },
    });

    const result = await assignCases([testCase.id, rest[0].id], dev.id, owner.id);

    expect(result).toEqual({ assigned: 1, skipped: 1 });
    const survivor = await prisma.testCase.findUniqueOrThrow({ where: { id: rest[0].id } });
    expect(survivor.assigneeId).toBe(dev.id);
  });

  it("takes a batch back", async () => {
    const { owner, dev, testCase } = await seed();
    await assignCases([testCase.id], dev.id, owner.id);

    await assignCases([testCase.id], null, owner.id);

    const after = await prisma.testCase.findUniqueOrThrow({ where: { id: testCase.id } });
    expect(after.assigneeId).toBeNull();
    expect(after.workState).toBeNull();
  });
});

describe("telling the person it is theirs", () => {
  beforeEach(() => {
    mockAuth.mockReset();
  });

  it("writes one notification, to the person and nobody else", async () => {
    const { owner, dev, testCase } = await seed();

    await assignCase(testCase.id, dev.id, owner.id, "it never finishes loading");

    const sent = await prisma.notification.findMany({
      where: { type: "ASSIGNED", recipientId: dev.id },
    });
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toContain("it never finishes loading");
    expect(sent[0].link).toContain("/my-work");

    // Not fanned out: the rest of the project has no errand here.
    expect(
      await prisma.notification.count({
        where: { type: "ASSIGNED", recipientId: owner.id },
      }),
    ).toBe(0);
  });

  it("says nothing when the same person is saved again", async () => {
    const { owner, dev, testCase } = await seed();
    await assignCase(testCase.id, dev.id, owner.id);

    await assignCase(testCase.id, dev.id, owner.id);

    expect(
      await prisma.notification.count({ where: { type: "ASSIGNED", recipientId: dev.id } }),
    ).toBe(1);
  });

  it("says nothing when somebody takes a case themselves", async () => {
    const { owner, testCase } = await seed();

    await assignCase(testCase.id, owner.id, owner.id);

    expect(
      await prisma.notification.count({ where: { type: "ASSIGNED", recipientId: owner.id } }),
    ).toBe(0);
  });
});

describe("telling somebody a repair is late", () => {
  beforeEach(() => {
    mockAuth.mockReset();
  });

  /** Hands the case over and drags its deadline into the past. */
  async function overdue(testCaseId: string, devId: string, ownerId: string) {
    await assignCase(testCaseId, devId, ownerId);
    await prisma.testCase.update({
      where: { id: testCaseId },
      data: { dueAt: new Date(Date.now() - 86_400_000) },
    });
  }

  it("writes one notification however often it is asked", async () => {
    /* The bell polls every thirty seconds. If this were not idempotent it
       would produce a row a minute, which is the one way to make a
       notification list worth less than no notification list at all. */
    const { owner, dev, testCase } = await seed();
    await overdue(testCase.id, dev.id, owner.id);

    expect(await notifyOverdueWork(dev.id)).toBe(1);
    expect(await notifyOverdueWork(dev.id)).toBe(0);
    expect(await notifyOverdueWork(dev.id)).toBe(0);

    expect(
      await prisma.notification.count({ where: { recipientId: dev.id, type: "OVERDUE" } }),
    ).toBe(1);
  });

  it("says nothing about a repair that is still in time", async () => {
    const { owner, dev, testCase } = await seed();
    await assignCase(testCase.id, dev.id, owner.id);

    expect(await notifyOverdueWork(dev.id)).toBe(0);
  });

  it("says nothing once the loop has closed", async () => {
    const { owner, dev, testCase } = await seed();
    await overdue(testCase.id, dev.id, owner.id);
    await updateTestResultAndNotes(testCase.id, { testResult: "PASSED" }, owner.id);

    // Passing clears both the state and the deadline, so there is no promise
    // left to be late for.
    expect(await notifyOverdueWork(dev.id)).toBe(0);
  });

  it("speaks again when a case comes back with a new date", async () => {
    const { owner, dev, testCase } = await seed();
    await overdue(testCase.id, dev.id, owner.id);
    expect(await notifyOverdueWork(dev.id)).toBe(1);

    /* Aged, so the sequence is the real one: told last week, handed back,
       and the new deadline has now passed in its turn. Leaving the first
       notification at "a moment ago" would put it after the second deadline,
       which is an order the clock cannot produce. */
    await prisma.notification.updateMany({
      where: { recipientId: dev.id, type: "OVERDUE" },
      data: { occurredAt: new Date(Date.now() - 7 * 86_400_000) },
    });

    /* Retested, still broken: a new window, so when that one passes the news
       is new too. */
    await setWorkState(testCase.id, "READY_TO_RETEST", dev.id);
    await updateTestResultAndNotes(testCase.id, { testResult: "FAILED" }, owner.id);
    await prisma.testCase.update({
      where: { id: testCase.id },
      data: { dueAt: new Date(Date.now() - 1000) },
    });

    expect(await notifyOverdueWork(dev.id)).toBe(1);
    expect(
      await prisma.notification.count({ where: { recipientId: dev.id, type: "OVERDUE" } }),
    ).toBe(2);
  });

  it("tells the person holding it, nobody else", async () => {
    const { owner, dev, testCase } = await seed();
    await overdue(testCase.id, dev.id, owner.id);
    await notifyOverdueWork(dev.id);

    expect(
      await prisma.notification.count({ where: { recipientId: owner.id, type: "OVERDUE" } }),
    ).toBe(0);
  });
});

describe("moving a repair along", () => {
  beforeEach(() => {
    mockAuth.mockReset();
  });

  it("records each step with whatever was said", async () => {
    const { owner, dev, testCase } = await seed();
    await assignCase(testCase.id, dev.id, owner.id);

    await setWorkState(testCase.id, "IN_PROGRESS", dev.id);
    await setWorkState(testCase.id, "READY_TO_RETEST", dev.id, "fixed in abc123");

    const after = await prisma.testCase.findUniqueOrThrow({ where: { id: testCase.id } });
    expect(after.workState).toBe("READY_TO_RETEST");

    const history = await listWorkHistory(testCase.id);
    expect(history.map((event) => event.toState)).toEqual([
      "READY_TO_RETEST",
      "IN_PROGRESS",
      "ASSIGNED",
    ]);
    expect(history[0].note).toBe("fixed in abc123");
    expect(history[0].actorId).toBe(dev.id);
  });

  it("refuses a case nobody is on", async () => {
    const { dev, testCase } = await seed();

    await expect(setWorkState(testCase.id, "IN_PROGRESS", dev.id)).rejects.toThrow(
      WorkValidationError,
    );
  });
});

describe("the hand-offs that are over", () => {
  beforeEach(() => {
    mockAuth.mockReset();
  });

  /** Hands the case over and ends the loop with `result`. */
  async function roundTrip(
    testCaseId: string,
    devId: string,
    ownerId: string,
    result: "PASSED" | "BLOCKED" | "SKIPPED",
  ) {
    await assignCase(testCaseId, devId, ownerId);
    await setWorkState(testCaseId, "READY_TO_RETEST", devId);
    await updateTestResultAndNotes(testCaseId, { testResult: result }, ownerId);
  }

  it("lists a hand-off once it has ended", async () => {
    const { owner, dev, project, testCase } = await seed();
    await roundTrip(testCase.id, dev.id, owner.id, "PASSED");

    const finished = await listFinishedWork(project.id, dev.id, "me", {});
    expect(finished.items).toHaveLength(1);
    expect(finished.items[0].testCase.id).toBe(testCase.id);
    expect(finished.items[0].assignee?.id).toBe(dev.id);
    expect(finished.items[0].closedBy).toBe("PASSED");
  });

  it("lists the ones a pass did not end", async () => {
    /* The loop ends on blocked and skipped too. Showing only passes would
       take those out of this list while they are already out of the open
       one — the hole this page exists to close, moved down a floor. */
    const { owner, dev, project, testCase } = await seed();
    await roundTrip(testCase.id, dev.id, owner.id, "BLOCKED");

    const finished = await listFinishedWork(project.id, dev.id, "me", {});
    expect(finished.items).toHaveLength(1);
    expect(finished.items[0].closedBy).toBe("BLOCKED");
  });

  it("keeps saying what ended it after the case breaks again", async () => {
    /* The row is about a moment, and the moment does not change. Read off
       the case's own column instead and this row would start claiming the
       hand-off ended in a failure it has nothing to do with. */
    const { owner, dev, project, testCase } = await seed();
    await roundTrip(testCase.id, dev.id, owner.id, "PASSED");

    await updateTestResultAndNotes(testCase.id, { testResult: "FAILED" }, owner.id);

    const finished = await listFinishedWork(project.id, dev.id, "me", {});
    expect(finished.items[0].closedBy).toBe("PASSED");
  });

  it("does not list a repair that came back instead of ending", async () => {
    const { owner, dev, project, testCase } = await seed();
    await assignCase(testCase.id, dev.id, owner.id);
    await setWorkState(testCase.id, "READY_TO_RETEST", dev.id);
    await updateTestResultAndNotes(testCase.id, { testResult: "FAILED" }, owner.id);

    // Retested and still broken: the repair did not finish, it carried on.
    expect((await listFinishedWork(project.id, dev.id, "me", {})).items).toHaveLength(0);
    expect(await listMyWork(project.id, dev.id)).toHaveLength(1);
  });

  it("shows a case handed out twice once, at its latest ending", async () => {
    /* The tab answers "have I worked on this before", not "what did the
       state do". Three hand-offs on one case is still one case anybody is
       looking for. */
    const { owner, dev, project, testCase } = await seed();
    await roundTrip(testCase.id, dev.id, owner.id, "BLOCKED");
    await roundTrip(testCase.id, dev.id, owner.id, "PASSED");

    const finished = await listFinishedWork(project.id, dev.id, "me", {});
    expect(finished.items).toHaveLength(1);
    expect(finished.total).toBe(1);
    // The newest ending, not the first.
    expect(finished.items[0].closedBy).toBe("PASSED");
  });

  it("pages over cases rather than over events", async () => {
    const { owner, dev, project, testCase } = await seed();
    await roundTrip(testCase.id, dev.id, owner.id, "PASSED");
    await roundTrip(testCase.id, dev.id, owner.id, "PASSED");
    await roundTrip(testCase.id, dev.id, owner.id, "PASSED");

    /* Counting the events would say three and hand back a page with one row
       on it, which is the shape of "page 2 of 1" bugs. */
    const finished = await listFinishedWork(project.id, dev.id, "me", { pageSize: 10 });
    expect(finished.total).toBe(1);
    expect(finished.totalPages).toBe(1);
  });

  it("reads 'handed out by me' from who handed it over, not who retested it", async () => {
    /* The actor on a closing event is the tester who recorded the result.
       Asking for `actorId = me` would turn this list into "retested by me",
       which is a different question with the same shape. */
    const { owner, dev, project, testCase } = await seed();
    await roundTrip(testCase.id, dev.id, owner.id, "PASSED");

    // The owner handed it over and also recorded the result.
    expect(
      (await listFinishedWork(project.id, owner.id, "handed-out", {})).items,
    ).toHaveLength(1);
    // The Dev never handed anything to anybody.
    expect(
      (await listFinishedWork(project.id, dev.id, "handed-out", {})).items,
    ).toHaveLength(0);
  });

  it("does not call taking a case back a finished repair", async () => {
    /* Both write an event with no next state. One is "a tester answered and
       the loop closed", the other is "never mind, give it here" — and the
       tab listed the second as finished work with a dash where the person
       should be. */
    const { owner, dev, project, testCase } = await seed();
    await assignCase(testCase.id, dev.id, owner.id);
    await assignCase(testCase.id, null, owner.id);

    expect((await listFinishedWork(project.id, dev.id, "me", {})).items).toHaveLength(0);
    expect((await listFinishedWork(project.id, owner.id, "handed-out", {})).items).toHaveLength(
      0,
    );
  });

  it("narrows to one person when asked, and counts the rest for the strip", async () => {
    /* The strip said two people had work and the page offered no way to look
       at either on their own. */
    const { owner, dev, project, testCase } = await seed();
    const other = await createUser(uniqueEmail("work-dev4"));
    await prisma.projectMember.create({
      data: { projectId: project.id, userId: other.id, role: "DEV" },
    });
    const second = await prisma.testCase.create({
      data: {
        testGroupId: (
          await prisma.testCase.findUniqueOrThrow({
            where: { id: testCase.id },
            select: { testGroupId: true },
          })
        ).testGroupId,
        name: uniqueName("Second"),
        expectedResult: "ok",
        priority: "MEDIUM",
        createdById: owner.id,
      },
    });
    await roundTrip(testCase.id, dev.id, owner.id, "PASSED");
    await roundTrip(second.id, other.id, owner.id, "PASSED");

    const everyone = await listFinishedWork(project.id, owner.id, "handed-out", {});
    expect(everyone.items).toHaveLength(2);

    const justOne = await listFinishedWork(project.id, owner.id, "handed-out", {}, dev.id);
    expect(justOne.items).toHaveLength(1);
    expect(justOne.items[0].assignee?.id).toBe(dev.id);

    /* The strip keeps both, so the way back to the other person is still on
       screen once one of them is chosen. And on this tab it counts finished
       cases, not open ones — it used to say "6 in hand" over a table of
       three finished rows. */
    const strip = await countWorkByAssignee(project.id, owner.id, "handed-out", true);
    expect(strip.map((row) => row.count).sort()).toEqual([1, 1]);
  });

  it("stops at the project it was asked about", async () => {
    const { owner, dev, testCase } = await seed();
    await roundTrip(testCase.id, dev.id, owner.id, "PASSED");
    const elsewhere = await seed();

    expect(
      (await listFinishedWork(elsewhere.project.id, dev.id, "me", {})).items,
    ).toHaveLength(0);
  });
});

describe("whose repairs the page shows", () => {
  beforeEach(() => {
    mockAuth.mockReset();
  });

  it("shows the person their own by default", async () => {
    const { owner, dev, project, testCase } = await seed();
    await assignCase(testCase.id, dev.id, owner.id);

    expect((await listMyWork(project.id, dev.id)).map((row) => row.id)).toEqual([testCase.id]);
    expect(await listMyWork(project.id, owner.id)).toHaveLength(0);
  });

  it("shows the person what they handed to somebody else", async () => {
    const { owner, dev, project, testCase } = await seed();
    await assignCase(testCase.id, dev.id, owner.id);

    const handedOut = await listMyWork(project.id, owner.id, "handed-out");
    expect(handedOut.map((row) => row.id)).toEqual([testCase.id]);
  });

  it("does not count a Dev moving their own card as handing it out", async () => {
    /* Every move writes an event, and "To fix" writes one reading ASSIGNED
       with the Dev as both actor and assignee. Counting that as a hand-off
       filled their "handed out by me" view with their own work. */
    const { owner, dev, project, testCase } = await seed();
    await assignCase(testCase.id, dev.id, owner.id);
    await setWorkState(testCase.id, "IN_PROGRESS", dev.id);
    await setWorkState(testCase.id, "ASSIGNED", dev.id);

    expect(await listMyWork(project.id, dev.id, "handed-out")).toHaveLength(0);
  });

  it("shows everybody's when asked", async () => {
    const { owner, dev, project, testCase } = await seed();
    await assignCase(testCase.id, dev.id, owner.id);

    const everyone = await listMyWork(project.id, owner.id, "all");
    expect(everyone.map((row) => row.id)).toEqual([testCase.id]);
  });

  it("stops at the project it was asked about", async () => {
    const { owner, dev, testCase } = await seed();
    await assignCase(testCase.id, dev.id, owner.id);
    const elsewhere = await seed();

    expect(await listMyWork(elsewhere.project.id, dev.id, "all")).toHaveLength(0);
  });
});

describe("closing the loop", () => {
  beforeEach(() => {
    mockAuth.mockReset();
  });

  it("clears the work state when the case is retested in a run", async () => {
    const { owner, dev, project, testCase } = await seed();
    await assignCase(testCase.id, dev.id, owner.id);
    await setWorkState(testCase.id, "READY_TO_RETEST", dev.id);

    const run = await createRun(project.id, { name: "Sprint 1" }, owner.id);
    await addCasesToRun(run.id, [testCase.id], owner.id);
    await setRunCaseResult(run.id, testCase.id, { testResult: "PASSED" }, owner.id);

    const after = await prisma.testCase.findUniqueOrThrow({ where: { id: testCase.id } });
    expect(after.workState).toBeNull();
    // Who looked after it is still worth knowing after it is closed.
    expect(after.assigneeId).toBe(dev.id);

    const history = await listWorkHistory(testCase.id);
    expect(history[0]).toMatchObject({ toState: null, actorId: owner.id, assigneeId: dev.id });
  });

  it("leaves a fresh hand-off alone when the failure is only now written down", async () => {
    /* The sequence people actually work in, five seconds apart in the audit
     * log: hand the case over, then record the Fail in the round. Treating
     * that as "retested and still broken" closed the hand-off the moment it
     * was made and the case disappeared from the page it had just reached. */
    const { owner, dev, project, testCase } = await seed();
    await assignCase(testCase.id, dev.id, owner.id);

    const run = await createRun(project.id, { name: "Sprint 1" }, owner.id);
    await addCasesToRun(run.id, [testCase.id], owner.id);
    await setRunCaseResult(run.id, testCase.id, { testResult: "FAILED" }, owner.id);

    const after = await prisma.testCase.findUniqueOrThrow({ where: { id: testCase.id } });
    expect(after.workState).toBe("ASSIGNED");
    expect(after.assigneeId).toBe(dev.id);
    // And nothing was written about it: the failure was not news.
    expect(await listWorkHistory(testCase.id)).toHaveLength(1);
  });

  it("sends it back when a retest finds it still broken", async () => {
    const { owner, dev, testCase } = await seed();
    await assignCase(testCase.id, dev.id, owner.id);
    await setWorkState(testCase.id, "READY_TO_RETEST", dev.id);

    await updateTestResultAndNotes(testCase.id, { testResult: "FAILED" }, owner.id);

    const after = await prisma.testCase.findUniqueOrThrow({ where: { id: testCase.id } });
    expect(after.workState).toBe("ASSIGNED");
    expect(after.assigneeId).toBe(dev.id);

    const history = await listWorkHistory(testCase.id);
    expect(history[0]).toMatchObject({ toState: "ASSIGNED", note: "Retested — still failing" });

    // And the person who said it was fixed is told it came back.
    const told = await prisma.notification.findFirst({
      where: { recipientId: dev.id, title: "A case came back to you" },
    });
    expect(told).not.toBeNull();
  });

  it("gives a case that came back a fresh window", async () => {
    const { owner, dev, testCase } = await seed();
    await assignCase(testCase.id, dev.id, owner.id);
    const firstDue = (
      await prisma.testCase.findUniqueOrThrow({ where: { id: testCase.id } })
    ).dueAt;
    await setWorkState(testCase.id, "READY_TO_RETEST", dev.id);

    await updateTestResultAndNotes(testCase.id, { testResult: "FAILED" }, owner.id);

    const after = await prisma.testCase.findUniqueOrThrow({ where: { id: testCase.id } });
    // The old window was for the attempt that did not work.
    expect(after.dueAt).not.toBeNull();
    expect(after.dueAt!.getTime()).toBeGreaterThan(firstDue!.getTime());
  });

  it("closes rather than bounces when a retest is blocked", async () => {
    /* BLOCKED means "no answer yet", not "still broken". Pushing the work
     * back at the Dev because a tester could not run it aims at the wrong
     * person. */
    const { owner, dev, testCase } = await seed();
    await assignCase(testCase.id, dev.id, owner.id);
    await setWorkState(testCase.id, "READY_TO_RETEST", dev.id);

    await updateTestResultAndNotes(testCase.id, { testResult: "BLOCKED" }, owner.id);

    const after = await prisma.testCase.findUniqueOrThrow({ where: { id: testCase.id } });
    expect(after.workState).toBeNull();
    expect(after.dueAt).toBeNull();
  });

  it("leaves it alone when nobody has looked yet", async () => {
    const { owner, dev, project, testCase } = await seed();
    await assignCase(testCase.id, dev.id, owner.id);
    await setWorkState(testCase.id, "IN_PROGRESS", dev.id);

    const run = await createRun(project.id, { name: "Sprint 1" }, owner.id);
    await addCasesToRun(run.id, [testCase.id], owner.id);
    await setRunCaseResult(run.id, testCase.id, { testResult: "NOT_RUN" }, owner.id);

    const after = await prisma.testCase.findUniqueOrThrow({ where: { id: testCase.id } });
    expect(after.workState).toBe("IN_PROGRESS");
  });

  it("writes nothing for a case nobody was fixing", async () => {
    const { owner, project, testCase } = await seed();

    const run = await createRun(project.id, { name: "Sprint 1" }, owner.id);
    await addCasesToRun(run.id, [testCase.id], owner.id);
    await setRunCaseResult(run.id, testCase.id, { testResult: "PASSED" }, owner.id);

    expect(await listWorkHistory(testCase.id)).toHaveLength(0);
  });

  it("does not touch a hand-off from an older round that no longer speaks", async () => {
    const { owner, dev, project, testCase } = await seed();

    const first = await createRun(project.id, { name: "Sprint 1" }, owner.id);
    await addCasesToRun(first.id, [testCase.id], owner.id);
    await setRunCaseResult(first.id, testCase.id, { testResult: "FAILED" }, owner.id);

    const second = await createRun(project.id, { name: "Sprint 2" }, owner.id);
    await addCasesToRun(second.id, [testCase.id], owner.id);
    await setRunCaseResult(second.id, testCase.id, { testResult: "PASSED" }, owner.id);

    // The repair was handed out after Sprint 2 spoke, so an answer typed into
    // Sprint 1 is not the retest — and must not say it is.
    await assignCase(testCase.id, dev.id, owner.id);
    await setWorkState(testCase.id, "READY_TO_RETEST", dev.id);
    await setRunCaseResult(first.id, testCase.id, { testResult: "PASSED" }, owner.id);

    const after = await prisma.testCase.findUniqueOrThrow({ where: { id: testCase.id } });
    expect(after.workState).toBe("READY_TO_RETEST");
  });
});
