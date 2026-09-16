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
