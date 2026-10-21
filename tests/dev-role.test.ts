import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import { ALL_MEMBER_ROLES, EDITOR_ROLES, NON_DEV_ROLES, WORK_STATE_ROLES } from "@/lib/rbac";
import { POST as createProjectRoute } from "@/app/api/projects/route";
import { POST as createScenarioRoute } from "@/app/api/projects/[id]/scenarios/route";
import { PATCH as patchScenario } from "@/app/api/scenarios/[id]/route";
import { POST as confirmImport } from "@/app/api/projects/[id]/import/confirm/route";
import { createUser, jsonRequest, sessionFor, uniqueCode, uniqueEmail } from "./support/fixtures";

const mockAuth = vi.mocked(auth);

/**
 * A DEV reads what a VIEWER reads and writes one thing. The whole design rests
 * on it being outside `EDITOR_ROLES`, which is supposed to refuse it at every
 * write in the app without any of them being told about the new role.
 *
 * That is a claim about a hundred and fifty-odd call sites, so it is worth
 * firing real requests at a few of them rather than trusting the list.
 */
describe("what a DEV may do", () => {
  beforeEach(() => {
    mockAuth.mockReset();
  });

  async function projectWithDev() {
    const owner = await createUser(uniqueEmail("dev-owner"));
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const code = uniqueCode("prj-dev");
    const project = await (
      await createProjectRoute(
        jsonRequest("http://test/api/projects", "POST", {
          code,
          name: `Project ${code}`,
          status: "DRAFT",
        }),
      )
    ).json();

    const dev = await createUser(uniqueEmail("dev-member"));
    await prisma.projectMember.create({
      data: { projectId: project.id, userId: dev.id, role: "DEV" },
    });
    return { owner, dev, project };
  }

  it("is a member, but not an editor", () => {
    expect(ALL_MEMBER_ROLES).toContain("DEV");
    expect(EDITOR_ROLES).not.toContain("DEV");
    // The one thing it may write, and the pages it may not read.
    expect(WORK_STATE_ROLES).toContain("DEV");
    expect(NON_DEV_ROLES).not.toContain("DEV");
  });

  it("cannot create a Scenario", async () => {
    const { dev, project } = await projectWithDev();
    mockAuth.mockResolvedValue(sessionFor(dev.id) as never);

    const response = await createScenarioRoute(
      jsonRequest(`http://test/api/projects/${project.id}/scenarios`, "POST", {
        requirementId: "whatever",
        name: "Should not exist",
        expectedResult: "ok",
        priority: "MEDIUM",
      }),
      { params: Promise.resolve({ id: project.id }) },
    );

    expect(response.status).toBe(403);
    expect(await prisma.scenario.count({ where: { projectId: project.id } })).toBe(0);
  });

  it("cannot edit one either", async () => {
    const { owner, dev, project } = await projectWithDev();
    const { findOrCreateUnassignedRequirement } = await import("@/lib/requirements");
    const { createScenario } = await import("@/lib/scenarios");
    const scenario = await createScenario(
      project.id,
      {
        requirementId: await findOrCreateUnassignedRequirement(project.id, owner.id),
        name: "Untouched",
        expectedResult: "ok",
        priority: "MEDIUM",
      },
      owner.id,
    );

    mockAuth.mockResolvedValue(sessionFor(dev.id) as never);
    const response = await patchScenario(
      jsonRequest(`http://test/api/scenarios/${scenario.id}`, "PATCH", { name: "Renamed" }),
      { params: Promise.resolve({ id: scenario.id }) },
    );

    expect(response.status).toBe(403);
    const after = await prisma.scenario.findUniqueOrThrow({ where: { id: scenario.id } });
    expect(after.name).toBe("Untouched");
  });

  it("cannot import, which is the example this was designed around", async () => {
    const { dev, project } = await projectWithDev();
    mockAuth.mockResolvedValue(sessionFor(dev.id) as never);

    /* Typing the URL of a page that is not in your menu has to be refused by
     * the server, or hiding the menu is decoration. */
    const response = await confirmImport(
      jsonRequest(`http://test/api/projects/${project.id}/import/confirm`, "POST", { rows: [] }),
      { params: Promise.resolve({ id: project.id }) },
    );

    expect(response.status).toBe(403);
  });
});
