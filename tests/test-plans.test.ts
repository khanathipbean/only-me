import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/auth";
import { POST as createProjectRoute } from "@/app/api/projects/route";
import { createModule } from "@/lib/modules";
import { createRequirement } from "@/lib/requirements";
import { createScenario } from "@/lib/scenarios";
import { createTestGroup } from "@/lib/test-groups";
import { createTestCase } from "@/lib/test-cases";
import { addCasesToRun, createRun, setRunCaseResult, setRunStatus } from "@/lib/test-runs";
import {
  TestPlanValidationError,
  addCasesToPlan,
  archiveTestPlan,
  createTestPlan,
  linkRunToPlan,
  listNewCasesForPlan,
  listOutstandingCases,
  listPlanCasesWithResults,
  listRunsForPlan,
  listTestPlansForProjectPage,
  removeCasesFromPlan,
  summariseTestPlan,
  updateTestPlan,
} from "@/lib/test-plans";
import { createUser, jsonRequest, sessionFor, uniqueCode, uniqueEmail } from "./support/fixtures";

const mockAuth = vi.mocked(auth);

/** A project with one module, one requirement, one scenario, one group and
 *  `count` cases in it — the smallest thing a plan can have a scope over. */
async function setup(count = 4) {
  const code = uniqueCode("prj-plan");
  const owner = await createUser(uniqueEmail("plan-owner"));
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

  const testModule = await createModule(project.id, "Policy", owner.id);
  const requirement = await createRequirement(
    project.id,
    { name: "REQ-1 สิทธิ์การเข้าถึง", moduleId: testModule.id, priority: "MEDIUM" },
    owner.id,
  );
  const scenario = await createScenario(
    project.id,
    {
      name: "ตรวจสอบสิทธิ์",
      requirementId: requirement.id,
      expectedResult: "ผ่าน",
      priority: "MEDIUM",
      tags: [],
    },
    owner.id,
  );
  const group = await createTestGroup(scenario.id, { name: "Navigation" }, owner.id);

  const cases = [];
  for (let index = 1; index <= count; index += 1) {
    cases.push(
      await createTestCase(
        group.id,
        {
          name: `TC-${index}`,
          expectedResult: "ok",
          priority: "MEDIUM",
          status: "READY",
          steps: [{ step: "s", expectedResult: "r" }],
        },
        owner.id,
      ),
    );
  }

  return { owner, project, testModule, requirement, scenario, group, cases };
}

function planInput(overrides = {}) {
  return {
    name: "UAT Phase 2",
    phase: "Sprint 12",
    objective: "ตรวจรับสิทธิ์ก่อนส่งมอบ",
    ownerId: "",
    ...overrides,
  };
}

/** A round under `plan` holding `cases`, with the results given. */
async function runWithResults(
  projectId: string,
  planId: string | null,
  name: string,
  ownerId: string,
  results: Array<[{ id: string }, "PASSED" | "FAILED" | "SKIPPED" | "BLOCKED" | null]>,
) {
  const run = await createRun(projectId, { name }, ownerId);
  await addCasesToRun(
    run.id,
    results.map(([testCase]) => testCase.id),
    ownerId,
  );
  for (const [testCase, result] of results) {
    if (result) {
      await setRunCaseResult(run.id, testCase.id, { testResult: result }, ownerId);
    }
  }
  if (planId) {
    await linkRunToPlan(run.id, planId, ownerId);
  }
  return run;
}

describe("test plans — the record", () => {
  beforeEach(() => {
    mockAuth.mockReset();
  });

  it("writes a plan, and refuses a second one by the same name", async () => {
    const { owner, project } = await setup();

    const plan = await createTestPlan(
      project.id,
      planInput({ ownerId: owner.id }),
      owner.id,
    );

    expect(plan.status).toBe("DRAFT");
    expect(plan.phase).toBe("Sprint 12");
    await expect(
      createTestPlan(project.id, planInput({ ownerId: owner.id }), owner.id),
    ).rejects.toBeInstanceOf(TestPlanValidationError);
  });

  it("refuses an owner who cannot open the project", async () => {
    const { owner, project } = await setup();
    const stranger = await createUser(uniqueEmail("plan-stranger"));

    await expect(
      createTestPlan(project.id, planInput({ ownerId: stranger.id }), owner.id),
    ).rejects.toBeInstanceOf(TestPlanValidationError);
  });

  it("refuses an end date before the start", async () => {
    const { owner, project } = await setup();

    await expect(
      createTestPlan(
        project.id,
        planInput({
          ownerId: owner.id,
          startsOn: new Date("2026-12-01"),
          endsOn: new Date("2026-11-01"),
        }),
        owner.id,
      ),
    ).rejects.toBeInstanceOf(TestPlanValidationError);
  });

  it("records what it did in the audit log", async () => {
    const { owner, project } = await setup();
    const plan = await createTestPlan(project.id, planInput({ ownerId: owner.id }), owner.id);

    const entries = await prisma.auditLog.findMany({
      where: { entityType: "TestPlan", entityId: plan.id },
    });

    expect(entries.map((entry) => entry.action)).toEqual(["create"]);
  });

  it("keeps an archived plan out of the list without deleting it", async () => {
    const { owner, project } = await setup();
    const plan = await createTestPlan(project.id, planInput({ ownerId: owner.id }), owner.id);

    await archiveTestPlan(plan.id, owner.id);
    const { plans } = await listTestPlansForProjectPage(project.id);

    expect(plans).toHaveLength(0);
    expect(await prisma.testPlan.findUnique({ where: { id: plan.id } })).not.toBeNull();
  });
});

describe("test plans — the scope", () => {
  beforeEach(() => {
    mockAuth.mockReset();
  });

  it("takes a case once however many times it is offered", async () => {
    const { owner, project, cases } = await setup();
    const plan = await createTestPlan(project.id, planInput({ ownerId: owner.id }), owner.id);

    /* What picking a Module and then one of its own cases amounts to: the
       pair is unique, so the second offer adds nothing. */
    const first = await addCasesToPlan(plan.id, cases.map((c) => c.id), owner.id);
    const second = await addCasesToPlan(plan.id, [cases[0].id, cases[1].id], owner.id);

    expect(first.added).toBe(4);
    expect(second.added).toBe(0);
    expect(await prisma.testPlanCase.count({ where: { testPlanId: plan.id } })).toBe(4);
  });

  it("refuses a case from another project, however the id arrived", async () => {
    const { owner, project } = await setup();
    const elsewhere = await setup(1);
    const plan = await createTestPlan(project.id, planInput({ ownerId: owner.id }), owner.id);

    const result = await addCasesToPlan(plan.id, [elsewhere.cases[0].id], owner.id);

    expect(result.added).toBe(0);
  });

  it("taking a case out of scope leaves the case and its results alone", async () => {
    const { owner, project, cases } = await setup();
    const plan = await createTestPlan(project.id, planInput({ ownerId: owner.id }), owner.id);
    await addCasesToPlan(plan.id, cases.map((c) => c.id), owner.id);
    await runWithResults(project.id, plan.id, "Round 1", owner.id, [[cases[0], "FAILED"]]);

    await removeCasesFromPlan(plan.id, [cases[0].id], owner.id);

    expect(await prisma.testPlanCase.count({ where: { testPlanId: plan.id } })).toBe(3);
    /* The case is still there, and so is what the round recorded about it. */
    const kept = await prisma.testCase.findUnique({ where: { id: cases[0].id } });
    expect(kept?.deletedAt).toBeNull();
    const runCase = await prisma.testRunCase.findFirst({ where: { testCaseId: cases[0].id } });
    expect(runCase?.testResult).toBe("FAILED");
  });

  it("offers the cases that have appeared since, rather than taking them", async () => {
    const { owner, project, testModule, group, cases } = await setup();
    const plan = await createTestPlan(project.id, planInput({ ownerId: owner.id }), owner.id);
    await addCasesToPlan(plan.id, cases.map((c) => c.id), owner.id);

    const later = await createTestCase(
      group.id,
      {
        name: "TC-added-later",
        expectedResult: "ok",
        priority: "MEDIUM",
        status: "READY",
        steps: [{ step: "s", expectedResult: "r" }],
      },
      owner.id,
    );

    const offered = await listNewCasesForPlan(plan.id, { moduleIds: [testModule.id] });

    expect(offered.map((row) => row.id)).toEqual([later.id]);
    /* Offered, not taken: the scope is a snapshot, and a denominator that
       moves on its own makes every figure above it unreadable. */
    expect(await prisma.testPlanCase.count({ where: { testPlanId: plan.id } })).toBe(4);
  });
});

describe("test plans — reading the rounds", () => {
  beforeEach(() => {
    mockAuth.mockReset();
  });

  it("counts a case once, from the newest round that reported on it", async () => {
    const { owner, project, cases } = await setup();
    const plan = await createTestPlan(project.id, planInput({ ownerId: owner.id }), owner.id);
    await addCasesToPlan(plan.id, cases.map((c) => c.id), owner.id);

    /* TC-1 fails, is fixed, and passes in the next round. TC-2 fails and
       stays failed. TC-3 is scheduled in the newest round but nobody has
       reached it, which must not overwrite what round one found. TC-4 is in
       no round at all. */
    await runWithResults(project.id, plan.id, "Round 1", owner.id, [
      [cases[0], "FAILED"],
      [cases[1], "FAILED"],
      [cases[2], "PASSED"],
    ]);
    await runWithResults(project.id, plan.id, "Round 2", owner.id, [
      [cases[0], "PASSED"],
      [cases[1], "FAILED"],
      [cases[2], null],
    ]);

    const summary = await summariseTestPlan(plan.id);

    expect(summary).toMatchObject({ cases: 4, runs: 2, passed: 2, failed: 1, notRun: 1 });
    expect(summary.progress).toBeCloseTo(75);
  });

  it("is at zero, not at nothing, before any round exists", async () => {
    const { owner, project, cases } = await setup();
    const plan = await createTestPlan(project.id, planInput({ ownerId: owner.id }), owner.id);
    await addCasesToPlan(plan.id, cases.map((c) => c.id), owner.id);

    const summary = await summariseTestPlan(plan.id);

    expect(summary).toMatchObject({ cases: 4, runs: 0, passed: 0, notRun: 4, progress: 0 });
  });

  it("ignores an archived round, which still owns its rows", async () => {
    const { owner, project, cases } = await setup();
    const plan = await createTestPlan(project.id, planInput({ ownerId: owner.id }), owner.id);
    await addCasesToPlan(plan.id, cases.map((c) => c.id), owner.id);
    const run = await runWithResults(project.id, plan.id, "Round 1", owner.id, [
      [cases[0], "PASSED"],
    ]);
    await prisma.testRun.update({ where: { id: run.id }, data: { deletedAt: new Date() } });

    const summary = await summariseTestPlan(plan.id);

    expect(summary).toMatchObject({ runs: 0, passed: 0, notRun: 4 });
  });

  it("reads a round that belongs to no plan as nobody's business", async () => {
    const { owner, project, cases } = await setup();
    const plan = await createTestPlan(project.id, planInput({ ownerId: owner.id }), owner.id);
    await addCasesToPlan(plan.id, cases.map((c) => c.id), owner.id);
    await runWithResults(project.id, null, "Ad hoc", owner.id, [[cases[0], "PASSED"]]);

    const summary = await summariseTestPlan(plan.id);

    expect(summary).toMatchObject({ runs: 0, passed: 0, notRun: 4 });
  });

  it("hands the detail page each case with where it came from", async () => {
    const { owner, project, cases } = await setup(1);
    const plan = await createTestPlan(project.id, planInput({ ownerId: owner.id }), owner.id);
    await addCasesToPlan(plan.id, [cases[0].id], owner.id);
    await runWithResults(project.id, plan.id, "Round 1", owner.id, [[cases[0], "FAILED"]]);

    const rows = await listPlanCasesWithResults(plan.id);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: cases[0].id,
      moduleName: "Policy",
      requirementName: "REQ-1 สิทธิ์การเข้าถึง",
      result: "FAILED",
    });
  });

  it("lists the rounds under it with how far each got", async () => {
    const { owner, project, cases } = await setup();
    const plan = await createTestPlan(project.id, planInput({ ownerId: owner.id }), owner.id);
    await addCasesToPlan(plan.id, cases.map((c) => c.id), owner.id);
    await runWithResults(project.id, plan.id, "Round 1", owner.id, [
      [cases[0], "PASSED"],
      [cases[1], "FAILED"],
      [cases[2], null],
    ]);

    const rows = await listRunsForPlan(plan.id);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Round 1", total: 3, recorded: 2, passed: 1, failed: 1 });
  });
});

describe("test plans — linking a round", () => {
  beforeEach(() => {
    mockAuth.mockReset();
  });

  it("writes the link and the phase, and touches no result", async () => {
    const { owner, project, cases } = await setup();
    const plan = await createTestPlan(
      project.id,
      planInput({ ownerId: owner.id, phase: "Sprint 12" }),
      owner.id,
    );
    const run = await createRun(project.id, { name: "Round 1", phase: "Sprint 9" }, owner.id);
    await addCasesToRun(run.id, [cases[0].id], owner.id);
    await setRunCaseResult(run.id, cases[0].id, { testResult: "FAILED" }, owner.id);
    await setRunStatus(run.id, "CLOSED", owner.id);

    const linked = await linkRunToPlan(run.id, plan.id, owner.id);

    /* The phase comes with the plan, so the two can never name different
       ones — the Dashboard filters by the label. */
    expect(linked.phase).toBe("Sprint 12");
    expect(linked.testPlanId).toBe(plan.id);
    /* And the round is otherwise exactly as it was. */
    expect(linked.status).toBe("CLOSED");
    const runCase = await prisma.testRunCase.findFirst({ where: { testRunId: run.id } });
    expect(runCase?.testResult).toBe("FAILED");
  });

  /* The question this answers: a plan drawn up after the testing has
     already happened. Its figures are read from the rounds as they stand,
     so linking a finished round shows what that round found — there is no
     notion of "results from after the link", and a plan that ignored them
     would read as untested work that is plainly done. */
  it("reads what a round already recorded, however late it is linked", async () => {
    const { owner, project, cases } = await setup(3);
    /* The round runs first, and reports on everything. */
    const run = await runWithResults(project.id, null, "Final", owner.id, [
      [cases[0], "PASSED"],
      [cases[1], "PASSED"],
      [cases[2], "FAILED"],
    ]);

    /* The plan is written afterwards. */
    const plan = await createTestPlan(project.id, planInput({ ownerId: owner.id }), owner.id);
    await addCasesToPlan(plan.id, cases.map((c) => c.id), owner.id);
    expect(await summariseTestPlan(plan.id)).toMatchObject({ passed: 0, notRun: 3, progress: 0 });

    await linkRunToPlan(run.id, plan.id, owner.id);

    const after = await summariseTestPlan(plan.id);
    expect(after).toMatchObject({ cases: 3, runs: 1, passed: 2, failed: 1, notRun: 0 });
    expect(after.progress).toBeCloseTo(100);

    /* And taking it out again forgets the results without touching them. */
    await linkRunToPlan(run.id, null, owner.id);
    expect(await summariseTestPlan(plan.id)).toMatchObject({ runs: 0, passed: 0, notRun: 3 });
    const kept = await prisma.testRunCase.findFirst({
      where: { testRunId: run.id, testCaseId: cases[0].id },
    });
    expect(kept?.testResult).toBe("PASSED");
  });

  it("refuses a plan from another project", async () => {
    const { owner, project, cases } = await setup();
    const elsewhere = await setup(1);
    const theirPlan = await createTestPlan(
      elsewhere.project.id,
      planInput({ ownerId: elsewhere.owner.id, name: "Theirs" }),
      elsewhere.owner.id,
    );
    const run = await createRun(project.id, { name: "Round 1" }, owner.id);
    await addCasesToRun(run.id, [cases[0].id], owner.id);

    await expect(linkRunToPlan(run.id, theirPlan.id, owner.id)).rejects.toBeInstanceOf(
      TestPlanValidationError,
    );
  });

  it("renaming the plan's phase carries its rounds with it", async () => {
    const { owner, project } = await setup();
    const plan = await createTestPlan(project.id, planInput({ ownerId: owner.id }), owner.id);
    const run = await createRun(project.id, { name: "Round 1" }, owner.id);
    await linkRunToPlan(run.id, plan.id, owner.id);

    await updateTestPlan(plan.id, planInput({ ownerId: owner.id, phase: "Sprint 13" }), owner.id);

    const after = await prisma.testRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(after.phase).toBe("Sprint 13");
  });
});

describe("test plans — the Completed guard", () => {
  beforeEach(() => {
    mockAuth.mockReset();
  });

  it("refuses Completed while a case in scope has not passed, and names them", async () => {
    const { owner, project, cases } = await setup();
    const plan = await createTestPlan(project.id, planInput({ ownerId: owner.id }), owner.id);
    await addCasesToPlan(plan.id, cases.map((c) => c.id), owner.id);
    await runWithResults(project.id, plan.id, "Round 1", owner.id, [
      [cases[0], "PASSED"],
      [cases[1], "FAILED"],
    ]);

    await expect(
      updateTestPlan(plan.id, planInput({ ownerId: owner.id, status: "COMPLETED" }), owner.id),
    ).rejects.toBeInstanceOf(TestPlanValidationError);

    /* Three: the one that failed, and the two no round reached. */
    expect(await listOutstandingCases(plan.id)).toHaveLength(3);
  });

  it("allows Completed once every case in scope has passed", async () => {
    const { owner, project, cases } = await setup(2);
    const plan = await createTestPlan(project.id, planInput({ ownerId: owner.id }), owner.id);
    await addCasesToPlan(plan.id, cases.map((c) => c.id), owner.id);
    await runWithResults(project.id, plan.id, "Round 1", owner.id, [
      [cases[0], "PASSED"],
      [cases[1], "FAILED"],
    ]);
    await runWithResults(project.id, plan.id, "Round 2", owner.id, [[cases[1], "PASSED"]]);

    const done = await updateTestPlan(
      plan.id,
      planInput({ ownerId: owner.id, status: "COMPLETED" }),
      owner.id,
    );

    expect(done.status).toBe("COMPLETED");
  });

  /* The other three are a person's word about their own intentions. Only
     Completed claims something the rounds can contradict. */
  it("lets the other three states be set whatever the rounds say", async () => {
    const { owner, project, cases } = await setup();
    const plan = await createTestPlan(project.id, planInput({ ownerId: owner.id }), owner.id);
    await addCasesToPlan(plan.id, cases.map((c) => c.id), owner.id);

    for (const status of ["IN_PROGRESS", "ON_HOLD", "DRAFT"] as const) {
      const saved = await updateTestPlan(
        plan.id,
        planInput({ ownerId: owner.id, status }),
        owner.id,
      );
      expect(saved.status).toBe(status);
    }
  });
});
