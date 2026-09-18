import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createScenario } from "@/lib/scenarios";
import { findOrCreateUnassignedRequirement } from "@/lib/requirements";
import { createTestGroup } from "@/lib/test-groups";
import { createTestCase } from "@/lib/test-cases";
import {
  TestRunValidationError,
  addCasesToRun,
  createRun,
  listCandidateCases,
  listRunsForProjectPage,
  setRunCaseResult,
  setRunStatus,
} from "@/lib/test-runs";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/auth";
import { POST as createProjectRoute } from "@/app/api/projects/route";

const mockAuth = vi.mocked(auth);

function sessionFor(userId: string) {
  return {
    user: { id: userId, email: `${userId}@example.com` },
    expires: new Date(Date.now() + 86_400_000).toISOString(),
  };
}

function jsonRequest(url: string, method: string, body?: unknown) {
  return new NextRequest(url, {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
      : {}),
  });
}

async function createUser(email: string) {
  return prisma.user.create({ data: { email, passwordHash: "irrelevant", name: email } });
}

/** A project with three Test Cases under one Group, ready to be re-tested. */
async function seed(ownerEmail: string, code: string) {
  const owner = await createUser(ownerEmail);
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

  const cases = [];
  for (const suffix of ["A", "B", "C"]) {
    cases.push(
      await createTestCase(
        group.id,
        {
          name: `Case ${suffix} ${code}`,
          expectedResult: "ok",
          priority: "MEDIUM",
          steps: [{ step: "s", expectedResult: "r" }],
        },
        owner.id,
      ),
    );
  }

  return { owner, project, cases };
}

describe("test runs", () => {
  beforeEach(() => {
    mockAuth.mockReset();
  });

  it("records a result against the run and mirrors it onto the Test Case", async () => {
    const { owner, project, cases } = await seed("run-owner1@example.com", "PRJ-RUN-1");
    const run = await createRun(project.id, { name: "Sprint 1" }, owner.id);

    await addCasesToRun(run.id, cases.map((testCase) => testCase.id), owner.id);
    await setRunCaseResult(run.id, cases[0].id, { testResult: "FAILED" }, owner.id);

    const runCase = await prisma.testRunCase.findUniqueOrThrow({
      where: { testRunId_testCaseId: { testRunId: run.id, testCaseId: cases[0].id } },
    });
    expect(runCase.testResult).toBe("FAILED");
    expect(runCase.ranById).toBe(owner.id);
    expect(runCase.ranAt).not.toBeNull();

    // The lists and the dashboard still read this field as "latest result".
    const testCase = await prisma.testCase.findUniqueOrThrow({ where: { id: cases[0].id } });
    expect(testCase.testResult).toBe("FAILED");
  });

  it("keeps each round's result separate, so a re-test doesn't erase the last one", async () => {
    const { owner, project, cases } = await seed("run-owner2@example.com", "PRJ-RUN-2");

    const first = await createRun(project.id, { name: "Sprint 1" }, owner.id);
    await addCasesToRun(first.id, [cases[0].id], owner.id);
    await setRunCaseResult(first.id, cases[0].id, { testResult: "PASSED" }, owner.id);

    const second = await createRun(project.id, { name: "Sprint 2" }, owner.id);
    await addCasesToRun(second.id, [cases[0].id], owner.id);
    await setRunCaseResult(second.id, cases[0].id, { testResult: "FAILED" }, owner.id);

    const inFirst = await prisma.testRunCase.findUniqueOrThrow({
      where: { testRunId_testCaseId: { testRunId: first.id, testCaseId: cases[0].id } },
    });
    const inSecond = await prisma.testRunCase.findUniqueOrThrow({
      where: { testRunId_testCaseId: { testRunId: second.id, testCaseId: cases[0].id } },
    });

    expect(inFirst.testResult).toBe("PASSED");
    expect(inSecond.testResult).toBe("FAILED");
  });

  it("leaves the Test Case showing the newest round, whatever order results are typed in", async () => {
    const { owner, project, cases } = await seed("run-owner7@example.com", "PRJ-RUN-7");
    const testCase = cases[0];

    const older = await createRun(project.id, { name: "Sprint 1" }, owner.id);
    const newer = await createRun(project.id, { name: "Sprint 2" }, owner.id);
    await addCasesToRun(older.id, [testCase.id], owner.id);
    await addCasesToRun(newer.id, [testCase.id], owner.id);

    // The newer round reports first, then someone goes back and fills in the
    // older one — which is exactly what happened in practice, and used to
    // stamp the older answer onto the Test Case.
    await setRunCaseResult(newer.id, testCase.id, { testResult: "FAILED" }, owner.id);
    const late = await setRunCaseResult(
      older.id,
      testCase.id,
      { testResult: "SKIPPED", notes: "ran out of time" },
      owner.id,
    );

    // Both rounds keep their own answer.
    const inOlder = await prisma.testRunCase.findUniqueOrThrow({
      where: { testRunId_testCaseId: { testRunId: older.id, testCaseId: testCase.id } },
    });
    const inNewer = await prisma.testRunCase.findUniqueOrThrow({
      where: { testRunId_testCaseId: { testRunId: newer.id, testCaseId: testCase.id } },
    });
    expect(inOlder.testResult).toBe("SKIPPED");
    expect(inOlder.notes).toBe("ran out of time");
    expect(inNewer.testResult).toBe("FAILED");

    // The Test Case keeps the newer round's, and its notes are untouched.
    const after = await prisma.testCase.findUniqueOrThrow({ where: { id: testCase.id } });
    expect(after.testResult).toBe("FAILED");
    expect(after.notes).not.toBe("ran out of time");

    // And the caller is told, so it can say why nothing else moved.
    expect(late.mirrorHeldBy).toBe("Sprint 2");
  });

  it("mirrors again once the newest round has its own say", async () => {
    const { owner, project, cases } = await seed("run-owner8@example.com", "PRJ-RUN-8");
    const testCase = cases[0];

    const older = await createRun(project.id, { name: "Sprint 1" }, owner.id);
    const newer = await createRun(project.id, { name: "Sprint 2" }, owner.id);
    await addCasesToRun(older.id, [testCase.id], owner.id);
    await addCasesToRun(newer.id, [testCase.id], owner.id);

    // A newer round that holds the case but has recorded nothing does not hold
    // the mirror — only a round that has actually reported does.
    const first = await setRunCaseResult(older.id, testCase.id, { testResult: "PASSED" }, owner.id);
    expect(first.mirrorHeldBy).toBeNull();
    expect(
      (await prisma.testCase.findUniqueOrThrow({ where: { id: testCase.id } })).testResult,
    ).toBe("PASSED");

    // Then the newer round reports and takes it over.
    const second = await setRunCaseResult(newer.id, testCase.id, { testResult: "BLOCKED" }, owner.id);
    expect(second.mirrorHeldBy).toBeNull();
    expect(
      (await prisma.testCase.findUniqueOrThrow({ where: { id: testCase.id } })).testResult,
    ).toBe("BLOCKED");
  });

  it("refuses every change to a closed run", async () => {
    const { owner, project, cases } = await seed("run-owner3@example.com", "PRJ-RUN-3");
    const run = await createRun(project.id, { name: "Sprint 1" }, owner.id);
    await addCasesToRun(run.id, [cases[0].id], owner.id);
    await setRunStatus(run.id, "CLOSED", owner.id);

    await expect(
      setRunCaseResult(run.id, cases[0].id, { testResult: "PASSED" }, owner.id),
    ).rejects.toBeInstanceOf(TestRunValidationError);
    await expect(addCasesToRun(run.id, [cases[1].id], owner.id)).rejects.toBeInstanceOf(
      TestRunValidationError,
    );

    // Reopening lets the work continue.
    await setRunStatus(run.id, "OPEN", owner.id);
    await expect(
      setRunCaseResult(run.id, cases[0].id, { testResult: "PASSED" }, owner.id),
    ).resolves.toBeTruthy();
  });

  it("adds each case once and offers only the ones not already in the run", async () => {
    const { owner, project, cases } = await seed("run-owner4@example.com", "PRJ-RUN-4");
    const run = await createRun(project.id, { name: "Sprint 1" }, owner.id);

    expect(await listCandidateCases(project.id, run.id)).toHaveLength(3);

    const firstAdd = await addCasesToRun(run.id, [cases[0].id, cases[1].id], owner.id);
    expect(firstAdd.added).toBe(2);

    // The same ids again — the picker shouldn't be able to double-add a case.
    const secondAdd = await addCasesToRun(run.id, [cases[0].id, cases[1].id], owner.id);
    expect(secondAdd.added).toBe(0);

    const remaining = await listCandidateCases(project.id, run.id);
    expect(remaining.map((row) => row.id)).toEqual([cases[2].id]);
  });

  it("rejects a duplicate run name and an end date before the start", async () => {
    const { owner, project } = await seed("run-owner5@example.com", "PRJ-RUN-5");
    await createRun(project.id, { name: "Sprint 1" }, owner.id);

    await expect(createRun(project.id, { name: "Sprint 1" }, owner.id)).rejects.toBeInstanceOf(
      TestRunValidationError,
    );
    await expect(
      createRun(
        project.id,
        { name: "Sprint 2", startsOn: new Date("2026-02-01"), endsOn: new Date("2026-01-01") },
        owner.id,
      ),
    ).rejects.toBeInstanceOf(TestRunValidationError);
  });

  it("reports how far each run has got", async () => {
    const { owner, project, cases } = await seed("run-owner6@example.com", "PRJ-RUN-6");
    const run = await createRun(project.id, { name: "Sprint 1" }, owner.id);
    await addCasesToRun(run.id, cases.map((testCase) => testCase.id), owner.id);
    await setRunCaseResult(run.id, cases[0].id, { testResult: "PASSED" }, owner.id);

    const page = await listRunsForProjectPage(project.id);
    const row = page.items.find((item) => item.id === run.id);

    expect(row?._count.cases).toBe(3);
    expect(row?.ranCount).toBe(1);
  });
});
