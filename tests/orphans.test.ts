import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createModule, archiveModule } from "@/lib/modules";
import { createRequirement, archiveRequirement } from "@/lib/requirements";
import { ValidationError as ScenarioValidationError, archiveScenario, createScenario } from "@/lib/scenarios";
import { ValidationError as TestGroupValidationError, archiveTestGroup, createTestGroup } from "@/lib/test-groups";
import { createTestCase } from "@/lib/test-cases";
import { uniqueCode, uniqueEmail } from "./support/fixtures";

/**
 * Archiving a parent deliberately leaves its children alone — the archive
 * refuses outright while any are live. So anything created under a parent
 * that is already archived is a row nothing will ever show: it is not in the
 * live list, because its parent is hidden, and not in the archived list,
 * because it is not archived itself. The only way back to it is restoring the
 * parent, which nobody has a reason to do.
 *
 * The Module and Requirement levels already refused this. The two below them
 * did not, and this was found by trying it rather than by reading.
 */
describe("creating something under a parent that is already archived", () => {
  async function tree() {
    const code = uniqueCode("orphan");
    const owner = await prisma.user.create({
      data: { email: uniqueEmail("orphan"), passwordHash: "x", name: code },
    });
    const project = await prisma.project.create({
      data: { code, name: code, status: "ACTIVE", ownerId: owner.id },
    });
    const testModule = await createModule(project.id, "Policy", owner.id);
    const requirement = await createRequirement(
      project.id,
      { moduleId: testModule.id, name: "Req", priority: "MEDIUM" },
      owner.id,
    );
    const scenario = await createScenario(
      project.id,
      { requirementId: requirement.id, name: "Sc", expectedResult: "ok", priority: "MEDIUM" },
      owner.id,
    );
    const testGroup = await createTestGroup(scenario.id, { name: "Grp" }, owner.id);
    return { owner, project, testModule, requirement, scenario, testGroup };
  }

  it("refuses a Test Group under an archived Scenario", async () => {
    const { owner, scenario, testGroup } = await tree();
    // The Scenario cannot be archived while the Test Group is live, which is
    // the rule that makes an orphan possible at all.
    await archiveTestGroup(testGroup.id, owner.id);
    await archiveScenario(scenario.id, owner.id);

    await expect(createTestGroup(scenario.id, { name: "orphan" }, owner.id)).rejects.toThrow(
      TestGroupValidationError,
    );

    expect(await prisma.testGroup.count({ where: { scenarioId: scenario.id, name: "orphan" } })).toBe(0);
  });

  it("refuses a Test Case under an archived Test Group", async () => {
    const { owner, testGroup } = await tree();
    await archiveTestGroup(testGroup.id, owner.id);

    await expect(
      createTestCase(
        testGroup.id,
        { name: "orphan", expectedResult: "ok", priority: "MEDIUM", steps: [{ step: "s", expectedResult: "r" }] },
        owner.id,
      ),
    ).rejects.toThrow();

    expect(await prisma.testCase.count({ where: { testGroupId: testGroup.id, name: "orphan" } })).toBe(0);
  });

  it("still refuses a Scenario under an archived Requirement, as it always did", async () => {
    const { owner, project, requirement, scenario, testGroup } = await tree();
    await archiveTestGroup(testGroup.id, owner.id);
    await archiveScenario(scenario.id, owner.id);
    await archiveRequirement(requirement.id, owner.id);

    await expect(
      createScenario(
        project.id,
        { requirementId: requirement.id, name: "orphan", expectedResult: "ok", priority: "MEDIUM" },
        owner.id,
      ),
    ).rejects.toThrow(ScenarioValidationError);
  });

  it("still refuses a Requirement under an archived Module, as it always did", async () => {
    const { owner, project, testModule, requirement, scenario, testGroup } = await tree();
    await archiveTestGroup(testGroup.id, owner.id);
    await archiveScenario(scenario.id, owner.id);
    await archiveRequirement(requirement.id, owner.id);
    await archiveModule(testModule.id, owner.id);

    await expect(
      createRequirement(project.id, { moduleId: testModule.id, name: "orphan", priority: "MEDIUM" }, owner.id),
    ).rejects.toThrow();
  });

  it("lets the normal case through untouched", async () => {
    const { owner, scenario } = await tree();
    const second = await createTestGroup(scenario.id, { name: "a second one" }, owner.id);
    expect(second.id).toBeTruthy();
  });
});
