import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateTestProgress } from "@/lib/dashboard";
import { createScenario } from "@/lib/scenarios";
import { createTestGroup } from "@/lib/test-groups";
import { createTestCase, updateAssignee, updateTestResultAndNotes } from "@/lib/test-cases";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/auth";
import { POST as createProjectRoute } from "@/app/api/projects/route";
import { GET as getDashboard } from "@/app/api/projects/[id]/dashboard/route";

const mockAuth = vi.mocked(auth);

function sessionFor(userId: string) {
  return {
    user: { id: userId, email: `${userId}@example.com` },
    expires: new Date(Date.now() + 86_400_000).toISOString(),
  };
}

async function createUser(email: string) {
  return prisma.user.create({
    data: { email, passwordHash: "irrelevant", name: email },
  });
}

function jsonRequest(url: string, method: string, body?: unknown) {
  return new NextRequest(url, {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
      : {}),
  });
}

async function dashboard(projectId: string, query = "") {
  return (
    await getDashboard(
      jsonRequest(`http://test/api/projects/${projectId}/dashboard${query}`, "GET"),
      { params: Promise.resolve({ id: projectId }) },
    )
  ).json();
}

/** Seeds: Scenario A (tags: smoke) > Group A1 > TC1 (HIGH/PASSED/user1), TC2 (LOW/FAILED/user2, status DRAFT);
 *  Scenario B (tags: regression) > Group B1 > TC3 (HIGH/NOT_RUN, unassigned, status DRAFT). */
async function seedDashboardFixture(ownerId: string, code: string) {
  const project = await (
    await createProjectRoute(
      jsonRequest("http://test/api/projects", "POST", { code, name: `Project ${code}`, status: "DRAFT" }),
    )
  ).json();

  const user1 = await createUser(`${code}-user1@example.com`);
  const user2 = await createUser(`${code}-user2@example.com`);

  const scenarioA = await createScenario(
    project.id,
    { name: "Scenario A", expectedResult: "A works", priority: "MEDIUM", tags: ["smoke"] },
    ownerId,
  );
  const groupA1 = await createTestGroup(scenarioA.id, { name: "Group A1" }, ownerId);
  const tc1 = await createTestCase(
    groupA1.id,
    { name: "TC1", expectedResult: "ok", priority: "HIGH", status: "READY", steps: [{ step: "s", expectedResult: "r" }] },
    ownerId,
  );
  await updateTestResultAndNotes(tc1.id, { testResult: "PASSED" }, ownerId);
  await updateAssignee(tc1.id, user1.id, ownerId);

  const tc2 = await createTestCase(
    groupA1.id,
    { name: "TC2", expectedResult: "ok", priority: "LOW", status: "DRAFT", steps: [{ step: "s", expectedResult: "r" }] },
    ownerId,
  );
  await updateTestResultAndNotes(tc2.id, { testResult: "FAILED" }, ownerId);
  await updateAssignee(tc2.id, user2.id, ownerId);

  const scenarioB = await createScenario(
    project.id,
    { name: "Scenario B", expectedResult: "B works", priority: "MEDIUM", tags: ["regression"] },
    ownerId,
  );
  const groupB1 = await createTestGroup(scenarioB.id, { name: "Group B1" }, ownerId);
  const tc3 = await createTestCase(
    groupB1.id,
    { name: "TC3", expectedResult: "ok", priority: "HIGH", status: "DRAFT", steps: [{ step: "s", expectedResult: "r" }] },
    ownerId,
  );

  return { project, scenarioA, groupA1, tc1, tc2, scenarioB, groupB1, tc3, user1, user2 };
}

describe("project dashboard", () => {
  beforeEach(() => {
    mockAuth.mockReset();
  });

  it("computes Test Progress with no divide-by-zero when there are no Test Cases", () => {
    expect(calculateTestProgress(0, 0)).toBe(0);
    expect(calculateTestProgress(2, 3)).toBeCloseTo((2 / 3) * 100);
    expect(calculateTestProgress(3, 3)).toBe(100);
  });

  it("matches a known seeded dataset for totals, breakdowns, and Test Progress", async () => {
    const owner = await createUser("dash-owner1@example.com");
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const { project, user1, user2 } = await seedDashboardFixture(owner.id, "PRJ-DASH-1");

    const result = await dashboard(project.id);

    expect(result.hasAnyData).toBe(true);
    expect(result.counts).toEqual({ scenarios: 2, testGroups: 2, testCases: 3 });
    expect(result.testProgress).toBeCloseTo((2 / 3) * 100);
    expect(result.testCasesByResult).toEqual({
      NOT_RUN: 1,
      PASSED: 1,
      FAILED: 1,
      BLOCKED: 0,
      SKIPPED: 0,
    });
    expect(result.testCasesByPriority).toEqual({ CRITICAL: 0, HIGH: 2, MEDIUM: 0, LOW: 1 });

    const byAssignee = Object.fromEntries(
      result.testCasesByAssignee.map((entry: { assigneeId: string | null; count: number }) => [
        entry.assigneeId ?? "unassigned",
        entry.count,
      ]),
    );
    expect(byAssignee).toEqual({ [user1.id]: 1, [user2.id]: 1, unassigned: 1 });

    expect(result.tree).toHaveLength(2);
    const scenarioANode = result.tree.find((s: { name: string }) => s.name === "Scenario A");
    expect(scenarioANode.testCaseCount).toBe(2);
    expect(scenarioANode.testGroups[0].testCaseCount).toBe(2);
  });

  it("applies one filter consistently across counts, breakdowns, and the tree", async () => {
    const owner = await createUser("dash-owner2@example.com");
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const { project, tc1 } = await seedDashboardFixture(owner.id, "PRJ-DASH-2");

    const filtered = await dashboard(project.id, "?testResult=PASSED");

    expect(filtered.counts).toEqual({ scenarios: 1, testGroups: 1, testCases: 1 });
    expect(filtered.testProgress).toBe(100);
    expect(filtered.testCasesByResult.PASSED).toBe(1);
    expect(filtered.testCasesByResult.FAILED).toBe(0);
    expect(filtered.tree).toHaveLength(1);
    expect(filtered.tree[0].testGroups[0].testCases).toHaveLength(1);
    expect(filtered.tree[0].testGroups[0].testCases[0].id).toBe(tc1.id);
  });

  it("filters by scenarioId, testGroupId, priority, status, assigneeId, and tags", async () => {
    const owner = await createUser("dash-owner3@example.com");
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const { project, scenarioA, groupA1, user1 } = await seedDashboardFixture(owner.id, "PRJ-DASH-3");

    const byScenario = await dashboard(project.id, `?scenarioId=${scenarioA.id}`);
    expect(byScenario.counts.testCases).toBe(2);

    const byGroup = await dashboard(project.id, `?testGroupId=${groupA1.id}`);
    expect(byGroup.counts.testCases).toBe(2);

    const byPriority = await dashboard(project.id, "?priority=HIGH");
    expect(byPriority.counts.testCases).toBe(2);

    const byStatus = await dashboard(project.id, "?status=DRAFT");
    expect(byStatus.counts.testCases).toBe(2);

    const byAssignee = await dashboard(project.id, `?assigneeId=${user1.id}`);
    expect(byAssignee.counts.testCases).toBe(1);

    const byTags = await dashboard(project.id, "?tags=smoke");
    expect(byTags.counts.testCases).toBe(2);
  });

  it("filters by createdFrom/createdTo date range", async () => {
    const owner = await createUser("dash-owner4@example.com");
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const { project } = await seedDashboardFixture(owner.id, "PRJ-DASH-4");

    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const farFuture = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10);

    const withinRange = await dashboard(project.id, `?createdFrom=${yesterday}&createdTo=${tomorrow}`);
    expect(withinRange.counts.testCases).toBe(3);

    const outsideRange = await dashboard(project.id, `?createdFrom=${farFuture}`);
    expect(outsideRange.counts.testCases).toBe(0);
  });

  it("shows a 'no results' shape (empty tree, zero counts) when a filter matches nothing, while hasAnyData stays true", async () => {
    const owner = await createUser("dash-owner5@example.com");
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const { project } = await seedDashboardFixture(owner.id, "PRJ-DASH-5");

    const result = await dashboard(project.id, "?testResult=BLOCKED");

    expect(result.hasAnyData).toBe(true);
    expect(result.counts).toEqual({ scenarios: 0, testGroups: 0, testCases: 0 });
    expect(result.tree).toEqual([]);
    expect(result.testProgress).toBe(0);
  });

  it("reports hasAnyData: false for a Project with no Scenarios yet", async () => {
    const owner = await createUser("dash-owner6@example.com");
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);

    const project = await (
      await createProjectRoute(
        jsonRequest("http://test/api/projects", "POST", {
          code: "PRJ-DASH-6",
          name: "Empty Project",
          status: "DRAFT",
        }),
      )
    ).json();

    const result = await dashboard(project.id);
    expect(result.hasAnyData).toBe(false);
    expect(result.counts).toEqual({ scenarios: 0, testGroups: 0, testCases: 0 });
  });

  it("rejects a non-member with 403 and isolates counts per project", async () => {
    const ownerA = await createUser("dash-ownerA@example.com");
    const ownerB = await createUser("dash-ownerB@example.com");

    mockAuth.mockResolvedValue(sessionFor(ownerA.id) as never);
    const { project: projectA } = await seedDashboardFixture(ownerA.id, "PRJ-DASH-7A");

    mockAuth.mockResolvedValue(sessionFor(ownerB.id) as never);
    const projectB = await (
      await createProjectRoute(
        jsonRequest("http://test/api/projects", "POST", {
          code: "PRJ-DASH-7B",
          name: "Project B",
          status: "DRAFT",
        }),
      )
    ).json();

    const forbidden = await getDashboard(
      jsonRequest(`http://test/api/projects/${projectA.id}/dashboard`, "GET"),
      { params: Promise.resolve({ id: projectA.id }) },
    );
    expect(forbidden.status).toBe(403);

    const ownDashboard = await dashboard(projectB.id);
    expect(ownDashboard.counts).toEqual({ scenarios: 0, testGroups: 0, testCases: 0 });
  });
});
