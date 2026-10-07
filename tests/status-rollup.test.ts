import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createModule } from "@/lib/modules";
import { createRequirement, updateRequirement } from "@/lib/requirements";
import { createScenario, updateScenario } from "@/lib/scenarios";
import { archiveTestGroup, createTestGroup, updateTestGroup } from "@/lib/test-groups";
import {
  archiveTestCase,
  createTestCase,
  moveTestCase,
  updateTestCase,
} from "@/lib/test-cases";
import { rollUpFrom, rollUpStatus } from "@/lib/status-rollup";
import type { WorkflowStatus } from "@/generated/prisma/client";

/**
 * The rule on its own, with no database in the way. Four values give sixteen
 * pairs; what matters is that one sentence covers all of them.
 */
describe("the rollup rule", () => {
  const all = (status: WorkflowStatus, count = 3) => Array<WorkflowStatus>(count).fill(status);

  it("takes the children's status when they agree", () => {
    expect(rollUpStatus(all("COMPLETED"))).toBe("COMPLETED");
    expect(rollUpStatus(all("DRAFT"))).toBe("DRAFT");
    expect(rollUpStatus(all("READY"))).toBe("READY");
    expect(rollUpStatus(["IN_PROGRESS"])).toBe("IN_PROGRESS");
  });

  it("says IN_PROGRESS when they do not", () => {
    expect(rollUpStatus(["DRAFT", "COMPLETED"])).toBe("IN_PROGRESS");
    expect(rollUpStatus(["COMPLETED", "COMPLETED", "READY"])).toBe("IN_PROGRESS");
    /* The rough edge this rule accepts: nobody has started, but the two
     * values disagree, so it reads IN_PROGRESS. Written down as a decision
     * rather than left to be discovered as a bug. */
    expect(rollUpStatus(["DRAFT", "READY"])).toBe("IN_PROGRESS");
  });

  it("derives nothing from no children", () => {
    /* Not DRAFT, and not a throw: a row with no children keeps what it has
     * and keeps an editable Status field, because there is nothing to
     * compute and locking it would leave no way to say anything about it. */
    expect(rollUpStatus([])).toBeNull();
  });
});

describe("rolling a status up the tree", () => {
  async function seed(code: string) {
    const owner = await prisma.user.create({
      data: { email: `${code.toLowerCase()}@example.com`, passwordHash: "x", name: code },
    });
    const project = await prisma.project.create({
      data: { code, name: code, status: "ACTIVE", ownerId: owner.id },
    });
    const mod = await createModule(project.id, "Policy", owner.id);
    const requirement = await createRequirement(
      project.id,
      { moduleId: mod.id, name: `Req ${code}`, priority: "MEDIUM" },
      owner.id,
    );
    const scenario = await createScenario(
      project.id,
      { requirementId: requirement.id, name: `Sc ${code}`, expectedResult: "ok", priority: "MEDIUM" },
      owner.id,
    );
    const group = await createTestGroup(scenario.id, { name: `Grp ${code}` }, owner.id);
    return { owner, project, requirement, scenario, group };
  }

  function addCase(groupId: string, name: string, ownerId: string) {
    return createTestCase(
      groupId,
      { name, expectedResult: "ok", priority: "MEDIUM", steps: [{ step: "s", expectedResult: "r" }] },
      ownerId,
    );
  }

  async function statuses(ids: { requirement: string; scenario: string; group: string }) {
    const [requirement, scenario, group] = await Promise.all([
      prisma.requirement.findUniqueOrThrow({ where: { id: ids.requirement } }),
      prisma.scenario.findUniqueOrThrow({ where: { id: ids.scenario } }),
      prisma.testGroup.findUniqueOrThrow({ where: { id: ids.group } }),
    ]);
    return { requirement: requirement.status, scenario: scenario.status, group: group.status };
  }

  it("carries one Test Case's status all the way to the Requirement", async () => {
    const { owner, requirement, scenario, group } = await seed("PRJ-ROLL-1");
    const ids = { requirement: requirement.id, scenario: scenario.id, group: group.id };

    const only = await addCase(group.id, "The only case", owner.id);
    await prisma.testCase.update({ where: { id: only.id }, data: { status: "COMPLETED" } });
    await prisma.$transaction((tx) => rollUpFrom(tx, "testGroup", group.id));

    // Three levels moved from one edit, which is the whole point.
    expect(await statuses(ids)).toEqual({
      group: "COMPLETED",
      scenario: "COMPLETED",
      requirement: "COMPLETED",
    });
  });

  it("stops at IN_PROGRESS while the children disagree", async () => {
    const { owner, requirement, scenario, group } = await seed("PRJ-ROLL-2");
    const ids = { requirement: requirement.id, scenario: scenario.id, group: group.id };

    const done = await addCase(group.id, "Finished", owner.id);
    await addCase(group.id, "Not started", owner.id);
    await prisma.testCase.update({ where: { id: done.id }, data: { status: "COMPLETED" } });
    await prisma.$transaction((tx) => rollUpFrom(tx, "testGroup", group.id));

    expect(await statuses(ids)).toEqual({
      group: "IN_PROGRESS",
      scenario: "IN_PROGRESS",
      requirement: "IN_PROGRESS",
    });
  });

  it("ignores archived children, so archiving the last stray one settles the parent", async () => {
    const { owner, requirement, scenario, group } = await seed("PRJ-ROLL-3");
    const ids = { requirement: requirement.id, scenario: scenario.id, group: group.id };

    const done = await addCase(group.id, "Finished", owner.id);
    const obsolete = await addCase(group.id, "Obsolete", owner.id);
    await prisma.testCase.update({ where: { id: done.id }, data: { status: "COMPLETED" } });
    await prisma.$transaction((tx) => rollUpFrom(tx, "testGroup", group.id));
    expect((await statuses(ids)).group).toBe("IN_PROGRESS");

    /* This is the answer the design gives instead of letting someone type
     * over a parent's status: put the obsolete child away, and the parent
     * settles honestly. */
    await prisma.testCase.update({ where: { id: obsolete.id }, data: { deletedAt: new Date() } });
    await prisma.$transaction((tx) => rollUpFrom(tx, "testGroup", group.id));

    expect(await statuses(ids)).toEqual({
      group: "COMPLETED",
      scenario: "COMPLETED",
      requirement: "COMPLETED",
    });
  });

  it("leaves a row with no live children exactly as it was", async () => {
    const { requirement, scenario, group } = await seed("PRJ-ROLL-4");
    const ids = { requirement: requirement.id, scenario: scenario.id, group: group.id };

    await prisma.testGroup.update({ where: { id: group.id }, data: { status: "READY" } });
    await prisma.$transaction((tx) => rollUpFrom(tx, "testGroup", group.id));

    /* The Test Group has no cases, so nothing is derived for it — not even a
     * default: it keeps the READY someone chose.
     *
     * The levels above are a different question, and the answer is not
     * "leave them too". The Scenario does have a live child — this Test
     * Group — and that child says READY, so the rule applies to it normally.
     * An earlier version returned at the Test Group and left them on DRAFT,
     * which is how a row stayed stale while the thing under it had moved. */
    expect(await statuses(ids)).toEqual({
      group: "READY",
      scenario: "READY",
      requirement: "READY",
    });
  });

  it("does not rewrite a level that already says what its children say", async () => {
    const { owner, requirement, scenario, group } = await seed("PRJ-ROLL-5");

    const only = await addCase(group.id, "The only case", owner.id);
    await prisma.testCase.update({ where: { id: only.id }, data: { status: "COMPLETED" } });
    await prisma.$transaction((tx) => rollUpFrom(tx, "testGroup", group.id));

    const before = await prisma.requirement.findUniqueOrThrow({ where: { id: requirement.id } });
    await prisma.$transaction((tx) => rollUpFrom(tx, "testGroup", group.id));
    const after = await prisma.requirement.findUniqueOrThrow({ where: { id: requirement.id } });

    /* A second pass changes nothing, so it must not touch the row either:
     * writing the same value again would move `updatedAt` and have every
     * edit anywhere below look like an edit to the Requirement. */
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    expect(after.status).toBe("COMPLETED");
    expect(scenario.id).toBeTruthy();
  });

  it("repairs a stale level above one that already agrees with its children", async () => {
    const { owner, requirement, scenario, group } = await seed("PRJ-ROLL-6");

    const only = await addCase(group.id, "The only case", owner.id);
    await prisma.testCase.update({ where: { id: only.id }, data: { status: "COMPLETED" } });
    await prisma.$transaction((tx) => rollUpFrom(tx, "testGroup", group.id));

    /* Rows written before any of this existed are stale, and this is the
     * shape they come in: the Test Group agrees with its cases, so an
     * earlier version returned at it and never reached the Requirement —
     * leaving exactly the row that needed fixing untouched for ever. */
    await prisma.requirement.update({ where: { id: requirement.id }, data: { status: "DRAFT" } });
    await prisma.scenario.update({ where: { id: scenario.id }, data: { status: "COMPLETED" } });

    await prisma.$transaction((tx) => rollUpFrom(tx, "testGroup", group.id));

    expect((await statuses({ requirement: requirement.id, scenario: scenario.id, group: group.id })).requirement).toBe("COMPLETED");
  });
});

/**
 * The rule working is one thing; every path that changes a child set calling
 * it is another, and the second is where this feature actually fails. Move is
 * the one that matters most — the level a row *left* has one fewer child and
 * nothing else will ever notice.
 */
describe("the write paths that have to recompute", () => {
  async function seed(code: string) {
    const owner = await prisma.user.create({
      data: { email: `${code.toLowerCase()}@example.com`, passwordHash: "x", name: code },
    });
    const project = await prisma.project.create({
      data: { code, name: code, status: "ACTIVE", ownerId: owner.id },
    });
    const mod = await createModule(project.id, "Policy", owner.id);
    const requirement = await createRequirement(
      project.id,
      { moduleId: mod.id, name: `Req ${code}`, priority: "MEDIUM" },
      owner.id,
    );
    const scenario = await createScenario(
      project.id,
      { requirementId: requirement.id, name: `Sc ${code}`, expectedResult: "ok", priority: "MEDIUM" },
      owner.id,
    );
    return { owner, project, requirement, scenario };
  }

  function addCase(groupId: string, name: string, ownerId: string, status?: WorkflowStatus) {
    return createTestCase(
      groupId,
      {
        name,
        expectedResult: "ok",
        priority: "MEDIUM",
        status,
        steps: [{ step: "s", expectedResult: "r" }],
      },
      ownerId,
    );
  }

  const statusOfGroup = async (id: string) =>
    (await prisma.testGroup.findUniqueOrThrow({ where: { id } })).status;
  const statusOfRequirement = async (id: string) =>
    (await prisma.requirement.findUniqueOrThrow({ where: { id } })).status;

  it("recomputes on create, update and archive of a Test Case", async () => {
    const { owner, scenario, requirement } = await seed("PRJ-WIRE-1");
    const group = await createTestGroup(scenario.id, { name: "Grp" }, owner.id);

    const done = await addCase(group.id, "Finished", owner.id, "COMPLETED");
    expect(await statusOfGroup(group.id)).toBe("COMPLETED");
    expect(await statusOfRequirement(requirement.id)).toBe("COMPLETED");

    // Creating a second, unfinished one pulls the whole chain back.
    const fresh = await addCase(group.id, "Not started", owner.id);
    expect(await statusOfGroup(group.id)).toBe("IN_PROGRESS");
    expect(await statusOfRequirement(requirement.id)).toBe("IN_PROGRESS");

    await updateTestCase(
      fresh.id,
      {
        name: fresh.name,
        expectedResult: "ok",
        priority: "MEDIUM",
        status: "COMPLETED",
        steps: [{ step: "s", expectedResult: "r" }],
      },
      owner.id,
    );
    expect(await statusOfRequirement(requirement.id)).toBe("COMPLETED");

    await archiveTestCase(done.id, owner.id);
    expect(await statusOfGroup(group.id)).toBe("COMPLETED");
  });

  it("recomputes BOTH ends when a Test Case moves", async () => {
    const { owner, scenario } = await seed("PRJ-WIRE-2");
    const from = await createTestGroup(scenario.id, { name: "From" }, owner.id);
    const to = await createTestGroup(scenario.id, { name: "To" }, owner.id);

    await addCase(to.id, "Already done there", owner.id, "COMPLETED");
    const stray = await addCase(from.id, "Unfinished", owner.id, "DRAFT");
    await addCase(from.id, "Done", owner.id, "COMPLETED");
    expect(await statusOfGroup(from.id)).toBe("IN_PROGRESS");
    expect(await statusOfGroup(to.id)).toBe("COMPLETED");

    await moveTestCase(stray.id, to.id, owner.id);

    /* The group it left is the easy one to forget: it is not named in the
     * call, and only the DRAFT case leaving makes it COMPLETED. */
    expect(await statusOfGroup(from.id)).toBe("COMPLETED");
    expect(await statusOfGroup(to.id)).toBe("IN_PROGRESS");
  });

  it("recomputes the Scenario when a Test Group is added or archived", async () => {
    const { owner, scenario, requirement } = await seed("PRJ-WIRE-3");
    const first = await createTestGroup(scenario.id, { name: "First" }, owner.id);
    await addCase(first.id, "Done", owner.id, "COMPLETED");
    expect(await statusOfRequirement(requirement.id)).toBe("COMPLETED");

    // An empty Test Group is DRAFT, which the Scenario above now has to hold.
    const second = await createTestGroup(scenario.id, { name: "Second" }, owner.id);
    expect(await statusOfRequirement(requirement.id)).toBe("IN_PROGRESS");

    await archiveTestGroup(second.id, owner.id);
    expect(await statusOfRequirement(requirement.id)).toBe("COMPLETED");
  });
});

/**
 * A derived field is only locked if the form leaving it out keeps it. These
 * guard the fallback each update function takes when no status is sent —
 * `updateRequirement` had `?? "DRAFT"`, which would have reset the status on
 * every edit to a name once the field stopped being rendered.
 */
describe("an update that sends no status", () => {
  it("keeps what the row already had, at all three levels", async () => {
    const owner = await prisma.user.create({
      data: { email: "prj-keep@example.com", passwordHash: "x", name: "keep" },
    });
    const project = await prisma.project.create({
      data: { code: "PRJ-KEEP", name: "PRJ-KEEP", status: "ACTIVE", ownerId: owner.id },
    });
    const mod = await createModule(project.id, "Policy", owner.id);
    const requirement = await createRequirement(
      project.id,
      { moduleId: mod.id, name: "Req", priority: "MEDIUM", status: "COMPLETED" },
      owner.id,
    );
    const scenario = await createScenario(
      project.id,
      {
        requirementId: requirement.id,
        name: "Sc",
        expectedResult: "ok",
        priority: "MEDIUM",
        status: "COMPLETED",
      },
      owner.id,
    );
    const group = await createTestGroup(
      scenario.id,
      { name: "Grp", status: "COMPLETED" },
      owner.id,
    );

    // No `status` in any of these, which is what the forms now send.
    await updateRequirement(
      requirement.id,
      { moduleId: mod.id, name: "Req renamed", priority: "MEDIUM" },
      owner.id,
    );
    await updateScenario(
      scenario.id,
      { name: "Sc renamed", expectedResult: "ok", priority: "MEDIUM" },
      owner.id,
    );
    await updateTestGroup(group.id, { name: "Grp renamed" }, owner.id);

    expect((await prisma.requirement.findUniqueOrThrow({ where: { id: requirement.id } })).status)
      .toBe("COMPLETED");
    expect((await prisma.scenario.findUniqueOrThrow({ where: { id: scenario.id } })).status)
      .toBe("COMPLETED");
    expect((await prisma.testGroup.findUniqueOrThrow({ where: { id: group.id } })).status)
      .toBe("COMPLETED");
  });
});
