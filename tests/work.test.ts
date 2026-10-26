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

  it("says which round ended it, or that no round did", async () => {
    /* "It passed in Sprint 3" and "somebody marked it passed on Tuesday" are
       different claims, and the app already draws that line on the Test Case
       page and in Problem Cases. Here it is the evidence that closed
       somebody's work. */
    const { owner, dev, project, testCase } = await seed();
    await roundTrip(testCase.id, dev.id, owner.id, "PASSED");

    // Recorded straight on the case, which is what `roundTrip` does.
    const loose = await listFinishedWork(project.id, dev.id, "me", {});
    expect(loose.items[0].closedIn).toBeNull();

    // And again, this time answered inside a round.
    await assignCase(testCase.id, dev.id, owner.id);
    await setWorkState(testCase.id, "READY_TO_RETEST", dev.id);
    const run = await createRun(project.id, { name: "Sprint 9" }, owner.id);
    await addCasesToRun(run.id, [testCase.id], owner.id);
    await setRunCaseResult(run.id, testCase.id, { testResult: "PASSED" }, owner.id);

    const inRound = await listFinishedWork(project.id, dev.id, "me", {});
    expect(inRound.items[0].closedIn).toBe("Sprint 9");
  });

  it("counts how many times a case has been round", async () => {
    /* One row per case is right for "have I worked on this", and it hides
       the thing worth knowing about a case that keeps coming back. */
    const { owner, dev, project, testCase } = await seed();
    await roundTrip(testCase.id, dev.id, owner.id, "PASSED");
    await roundTrip(testCase.id, dev.id, owner.id, "BLOCKED");
    await roundTrip(testCase.id, dev.id, owner.id, "PASSED");

    const finished = await listFinishedWork(project.id, dev.id, "me", {});
    expect(finished.items).toHaveLength(1);
    expect(finished.items[0].handOffs).toBe(3);
  });

  it("does not count a Dev moving their own card as a hand-off", async () => {
    /* "To fix" writes an event reading ASSIGNED with the Dev at both ends.
       Counting those made the number whatever the week's clicking added up
       to — one fixture row reached 116. */
    const { owner, dev, project, testCase } = await seed();
    await assignCase(testCase.id, dev.id, owner.id);
    await setWorkState(testCase.id, "IN_PROGRESS", dev.id);
    await setWorkState(testCase.id, "ASSIGNED", dev.id);
    await setWorkState(testCase.id, "READY_TO_RETEST", dev.id);
    await updateTestResultAndNotes(testCase.id, { testResult: "PASSED" }, owner.id);

    const finished = await listFinishedWork(project.id, dev.id, "me", {});
    expect(finished.items[0].handOffs).toBe(1);
  });

  it("counts the hand-off that is still open too", async () => {
    const { owner, dev, project, testCase } = await seed();
    await roundTrip(testCase.id, dev.id, owner.id, "PASSED");
    // Handed straight back out: three endings would be a lie, three
    // hand-offs is not.
    await assignCase(testCase.id, dev.id, owner.id);

    const finished = await listFinishedWork(project.id, dev.id, "me", {});
    expect(finished.items[0].handOffs).toBe(2);
  });

  it("keeps a case that was only just handed out on one tab", async () => {
    /* The question asked in plain words: a failed case is handed to a Dev —
       it shows up as open. Hand it to the same Dev again. Does it now show
       on both? */
    const { owner, dev, project, testCase } = await seed();
    await updateTestResultAndNotes(testCase.id, { testResult: "FAILED" }, owner.id);

    await assignCase(testCase.id, dev.id, owner.id);
    expect(await listMyWork(project.id, dev.id)).toHaveLength(1);
    expect((await listFinishedWork(project.id, dev.id, "me", {})).items).toHaveLength(0);

    await assignCase(testCase.id, dev.id, owner.id);
    expect(await listMyWork(project.id, dev.id)).toHaveLength(1);
    // Nothing has ended, so nothing is finished.
    expect((await listFinishedWork(project.id, dev.id, "me", {})).items).toHaveLength(0);
  });

  it("does not count saving the same person twice as two hand-offs", async () => {
    /* A control that saves on every change makes this one press, and nothing
       about the case moved. */
    const { owner, dev, project, testCase } = await seed();
    await assignCase(testCase.id, dev.id, owner.id);
    await assignCase(testCase.id, dev.id, owner.id);
    await setWorkState(testCase.id, "READY_TO_RETEST", dev.id);
    await updateTestResultAndNotes(testCase.id, { testResult: "PASSED" }, owner.id);

    const finished = await listFinishedWork(project.id, dev.id, "me", {});
    expect(finished.items[0].handOffs).toBe(1);
  });

  it("keeps what the Dev wrote when they said it was fixed", async () => {
    /* The result says a hand-off ended; this says what was done to end it.
       It lived on the open card and went with the card when the loop closed,
       which is the same hole one floor down. */
    const { owner, dev, project, testCase } = await seed();
    await assignCase(testCase.id, dev.id, owner.id);
    await setWorkState(testCase.id, "READY_TO_RETEST", dev.id, "fixed in abc123");
    await updateTestResultAndNotes(testCase.id, { testResult: "PASSED" }, owner.id);

    const finished = await listFinishedWork(project.id, dev.id, "me", {});
    expect(finished.items[0].fixedNote).toBe("fixed in abc123");
    /* And the moves worth reading, for the panel under the row: the ending,
       the claim, and the hand-off that started the round — that last one
       even though nobody wrote a word on it, because it is what the count
       beside the row counts. */
    expect(finished.items[0].history.map((move) => move.toState)).toEqual([
      null,
      "READY_TO_RETEST",
      "ASSIGNED",
    ]);
  });

  it("leaves out the moves nobody wrote anything on", async () => {
    /* A repair that goes round a few times leaves a dozen events, most of
       them a step with nothing attached — and several of those are the Dev
       pressing a button on their own card. Drawing them all buried the
       claims that the thing was fixed. */
    const { owner, dev, project, testCase } = await seed();
    await assignCase(testCase.id, dev.id, owner.id, "over to you");
    await setWorkState(testCase.id, "IN_PROGRESS", dev.id);
    await setWorkState(testCase.id, "ASSIGNED", dev.id);
    await setWorkState(testCase.id, "READY_TO_RETEST", dev.id, "fixed it");
    await updateTestResultAndNotes(testCase.id, { testResult: "PASSED" }, owner.id);

    const finished = await listFinishedWork(project.id, dev.id, "me", {});
    const shown = finished.items[0].history;

    /* The hand-over, the claim and the ending. The two bare presses in
       between are gone. */
    expect(shown.map((move) => move.toState)).toEqual([
      null,
      "READY_TO_RETEST",
      "ASSIGNED",
    ]);
    expect(shown.map((move) => move.note)).toEqual([null, "fixed it", "over to you"]);
  });

  it("shows the hand-offs the count counts, so the two can be checked against each other", async () => {
    /* The hand-offs were hidden when nobody wrote anything on them, so "3
       hand-offs" sat above a panel showing one, and there was no way to check
       the number against the account below it. */
    const { owner, dev, project, testCase } = await seed();
    await assignCase(testCase.id, dev.id, owner.id);
    await setWorkState(testCase.id, "READY_TO_RETEST", dev.id, "first");
    await updateTestResultAndNotes(testCase.id, { testResult: "PASSED" }, owner.id);
    await assignCase(testCase.id, dev.id, owner.id);
    await setWorkState(testCase.id, "READY_TO_RETEST", dev.id, "second");
    await updateTestResultAndNotes(testCase.id, { testResult: "PASSED" }, owner.id);

    const [row] = (await listFinishedWork(project.id, dev.id, "me", {})).items;
    expect(row.handOffs).toBe(2);
    expect(row.history.filter((move) => move.startsRound)).toHaveLength(2);
  });

  it("does not start a round where nothing changed hands", async () => {
    const { owner, dev, project, testCase } = await seed();
    await assignCase(testCase.id, dev.id, owner.id);
    // The Dev's own presses write events of the same shape.
    await setWorkState(testCase.id, "IN_PROGRESS", dev.id, "looking");
    await setWorkState(testCase.id, "ASSIGNED", dev.id, "back to it");
    await setWorkState(testCase.id, "READY_TO_RETEST", dev.id, "done");
    await updateTestResultAndNotes(testCase.id, { testResult: "PASSED" }, owner.id);

    const [row] = (await listFinishedWork(project.id, dev.id, "me", {})).items;
    expect(row.handOffs).toBe(1);
    expect(row.history.filter((move) => move.startsRound)).toHaveLength(1);
  });

  it("names the failure that sent each hand-off out", async () => {
    /* Three rounds leave three "To fix" rows that read identically, and the
       only thing telling them apart — what the tester saw each time — was
       recorded on the result and never carried to the move it explains. */
    const { owner, dev, project, testCase } = await seed();
    await updateTestResultAndNotes(
      testCase.id,
      { testResult: "FAILED", notes: "Filter is ignored" },
      owner.id,
    );
    await assignCase(testCase.id, dev.id, owner.id);
    await setWorkState(testCase.id, "READY_TO_RETEST", dev.id, "fixed the predicate");
    await updateTestResultAndNotes(
      testCase.id,
      { testResult: "FAILED", notes: "Now it filters twice" },
      owner.id,
    );
    await setWorkState(testCase.id, "READY_TO_RETEST", dev.id, "deduped it");
    await updateTestResultAndNotes(testCase.id, { testResult: "PASSED" }, owner.id);

    const [row] = (await listFinishedWork(project.id, dev.id, "me", {})).items;
    /* Newest first, so the second failure is on the hand-off above the
       first — the bounce the retest wrote. */
    expect(
      row.history.filter((move) => move.startsRound).map((move) => move.cause?.notes),
    ).toEqual(["Now it filters twice", "Filter is ignored"]);
  });

  it("does not repeat one failure under a second hand-off", async () => {
    /* Pressing the picker again without retesting in between is one failure,
       not two. Repeating the line would say the case broke twice. */
    const { owner, dev, project, testCase } = await seed();
    const other = await createUser(uniqueEmail("work-dev5"));
    await prisma.projectMember.create({
      data: { projectId: project.id, userId: other.id, role: "DEV" },
    });
    await updateTestResultAndNotes(
      testCase.id,
      { testResult: "FAILED", notes: "Filter is ignored" },
      owner.id,
    );
    await assignCase(testCase.id, dev.id, owner.id);
    await assignCase(testCase.id, other.id, owner.id);
    await updateTestResultAndNotes(testCase.id, { testResult: "PASSED" }, owner.id);

    const [row] = (await listFinishedWork(project.id, other.id, "me", {})).items;
    const handOffs = row.history.filter((move) => move.startsRound);
    expect(handOffs).toHaveLength(2);
    /* The first one out carries it; the second has nothing new behind it. */
    expect(handOffs.map((move) => move.cause?.notes ?? null)).toEqual([
      null,
      "Filter is ignored",
    ]);
  });

  it("says nothing where the hand-off came before anybody recorded a failure", async () => {
    const { owner, dev, project, testCase } = await seed();
    await assignCase(testCase.id, dev.id, owner.id);
    await updateTestResultAndNotes(
      testCase.id,
      { testResult: "FAILED", notes: "seen afterwards" },
      owner.id,
    );
    await updateTestResultAndNotes(testCase.id, { testResult: "PASSED" }, owner.id);

    const [row] = (await listFinishedWork(project.id, dev.id, "me", {})).items;
    expect(row.history.filter((move) => move.startsRound)[0].cause).toBeNull();
  });

  it("carries the failure onto the open card's account as well", async () => {
    /* One story about a hand-off, not two: the fold on the card and the
       panel on the other tab are the same list by the same rules. */
    const { owner, dev, project, testCase } = await seed();
    await updateTestResultAndNotes(
      testCase.id,
      { testResult: "FAILED", notes: "Filter is ignored" },
      owner.id,
    );
    await assignCase(testCase.id, dev.id, owner.id);

    const [card] = await listMyWork(project.id, dev.id);
    expect(card.workEvents.find((move) => move.startsRound)?.cause?.notes).toBe(
      "Filter is ignored",
    );
  });

  it("takes the claim from the round that ended, not a later one", async () => {
    const { owner, dev, project, testCase } = await seed();
    await assignCase(testCase.id, dev.id, owner.id);
    await setWorkState(testCase.id, "READY_TO_RETEST", dev.id, "first attempt");
    await updateTestResultAndNotes(testCase.id, { testResult: "PASSED" }, owner.id);

    // Round two, still open: its claim has not closed anything yet.
    await assignCase(testCase.id, dev.id, owner.id);
    await setWorkState(testCase.id, "READY_TO_RETEST", dev.id, "second attempt");

    const finished = await listFinishedWork(project.id, dev.id, "me", {});
    expect(finished.items[0].fixedNote).toBe("first attempt");
  });

  it("says nothing when nobody ever claimed it was fixed", async () => {
    const { owner, dev, project, testCase } = await seed();
    await assignCase(testCase.id, dev.id, owner.id);
    // A tester can record a pass without the case being handed back.
    await updateTestResultAndNotes(testCase.id, { testResult: "PASSED" }, owner.id);

    const finished = await listFinishedWork(project.id, dev.id, "me", {});
    expect(finished.items[0].fixedNote).toBeNull();
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
