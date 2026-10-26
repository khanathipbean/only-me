import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import { GET as auditLogRoute } from "@/app/api/projects/[id]/audit-log/route";
import { createUser, sessionFor, uniqueCode, uniqueEmail } from "./support/fixtures";
import type { ProjectRole } from "@/generated/prisma/client";

const mockAuth = vi.mocked(auth);

/**
 * The API gates, now that they ask for a capability.
 *
 * One of them changed when they moved: the Audit Trail route admitted every
 * member, while the page it belongs to has always refused a DEV. A DEV could
 * not open the page and could read the same history with a URL — which is
 * the hole the comment on `NON_DEV_ROLES` warns about, on the other side of
 * the app. Nothing in the UI calls this route, so closing it costs nothing.
 */
describe("the audit trail over the API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  async function projectWith(role: ProjectRole) {
    const owner = await createUser(uniqueEmail("api-owner"));
    const project = await prisma.project.create({
      data: { code: uniqueCode("prj-api"), name: "API scope", ownerId: owner.id },
    });
    const member = await createUser(uniqueEmail("api-member"));
    await prisma.projectMember.create({
      data: { projectId: project.id, userId: member.id, role },
    });
    return { project, member };
  }

  async function ask(projectId: string, userId: string) {
    mockAuth.mockResolvedValue(sessionFor(userId) as never);
    return auditLogRoute(
      new Request(`http://test/api/projects/${projectId}/audit-log`) as never,
      { params: Promise.resolve({ id: projectId }) },
    );
  }

  it("refuses a DEV, the way the page always has", async () => {
    const { project, member } = await projectWith("DEV");
    expect((await ask(project.id, member.id)).status).toBe(403);
  });

  it("still admits a VIEWER, who may open the page", async () => {
    const { project, member } = await projectWith("VIEWER");
    const response = await ask(project.id, member.id);
    expect(response.status).toBe(200);
    expect(await response.json()).toHaveProperty("entries");
  });
});
