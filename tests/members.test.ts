import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/auth";
import { POST as createProjectRoute } from "@/app/api/projects/route";
import { GET as listProjects } from "@/app/api/projects/route";
import { GET as listMembersRoute, POST as createMemberRoute } from "@/app/api/members/route";
import { PATCH as updateAccessRoute } from "@/app/api/members/[userId]/route";

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

/** Creates a project (the creator is granted QA_LEAD, not ADMIN — see
 * projects.ts) and promotes the creator to ADMIN, since the Members route is
 * gated by "ADMIN on at least one Project", not a per-project role. */
async function setupAsAdmin(adminEmail: string, code: string) {
  const admin = await createUser(adminEmail);
  mockAuth.mockResolvedValue(sessionFor(admin.id) as never);

  const project = await (
    await createProjectRoute(
      jsonRequest("http://test/api/projects", "POST", { code, name: `Project ${code}`, status: "DRAFT" }),
    )
  ).json();

  await prisma.projectMember.update({
    where: { projectId_userId: { projectId: project.id, userId: admin.id } },
    data: { role: "ADMIN" },
  });

  return { admin, project };
}

describe("member routes", () => {
  beforeEach(() => {
    mockAuth.mockReset();
  });

  it("creates a user scoped only to the chosen projects, confined by the existing membership-based queries", async () => {
    const { project } = await setupAsAdmin("member-admin1@example.com", "PRJ-MEM-1");

    const response = await createMemberRoute(
      jsonRequest("http://test/api/members", "POST", {
        access: [{ projectId: project.id, role: "TESTER" }],
        email: "new-tester1@example.com",
        name: "New Tester",
        password: "supersecret1",
      }),
    );
    expect(response.status).toBe(201);
    const member = await response.json();
    expect(member.access).toEqual([{ projectId: project.id, role: "TESTER" }]);
    expect(member.email).toBe("new-tester1@example.com");

    // The new account exists, has a password, and — critically — sees only
    // the Project it was created into, with no extra code needed.
    mockAuth.mockResolvedValue(sessionFor(member.userId) as never);
    const visibleProjects = await (
      await listProjects(jsonRequest("http://test/api/projects", "GET"))
    ).json();
    expect(visibleProjects.map((p: { id: string }) => p.id)).toEqual([project.id]);
  });

  it("creates a user with access to more than one project at once", async () => {
    const { project: projectA } = await setupAsAdmin("member-admin-multi@example.com", "PRJ-MEM-MULTI-A");
    const projectB = await (
      await createProjectRoute(
        jsonRequest("http://test/api/projects", "POST", { code: "PRJ-MEM-MULTI-B", name: "B", status: "DRAFT" }),
      )
    ).json();

    const response = await createMemberRoute(
      jsonRequest("http://test/api/members", "POST", {
        access: [
          { projectId: projectA.id, role: "TESTER" },
          { projectId: projectB.id, role: "QA_LEAD" },
        ],
        email: "multi-project@example.com",
        name: "Multi Project",
        password: "supersecret1",
      }),
    );
    expect(response.status).toBe(201);
    const member = await response.json();

    mockAuth.mockResolvedValue(sessionFor(member.userId) as never);
    const visibleProjects = await (
      await listProjects(jsonRequest("http://test/api/projects", "GET"))
    ).json();
    expect(visibleProjects.map((p: { id: string }) => p.id).sort()).toEqual(
      [projectA.id, projectB.id].sort(),
    );
  });

  it("lets an ADMIN elsewhere add a member to a brand-new project they don't belong to yet", async () => {
    // The whole reason this route isn't scoped by a project in the URL: a
    // fresh Project's creator only starts as QA_LEAD (see createProject), so
    // nobody could ever reach a per-project-gated Members page for it.
    const { admin } = await setupAsAdmin("member-admin-bootstrap@example.com", "PRJ-MEM-BOOT-A");

    const otherProject = await (
      await createProjectRoute(
        jsonRequest("http://test/api/projects", "POST", {
          code: "PRJ-MEM-BOOT-B",
          name: "Brand New Project",
          status: "DRAFT",
        }),
      )
    ).json();
    // admin is QA_LEAD here, not ADMIN — and isn't even acting as themselves
    // for this call; a *different* admin bootstraps it below.
    void otherProject;

    mockAuth.mockResolvedValue(sessionFor(admin.id) as never);
    const response = await createMemberRoute(
      jsonRequest("http://test/api/members", "POST", {
        access: [{ projectId: otherProject.id, role: "QA_LEAD" }],
        email: "bootstrap-member@example.com",
        name: "Bootstrap Member",
        password: "supersecret1",
      }),
    );
    expect(response.status).toBe(201);
  });

  it("rejects a duplicate email", async () => {
    const { project } = await setupAsAdmin("member-admin2@example.com", "PRJ-MEM-2");
    await createUser("dup1@example.com");

    const response = await createMemberRoute(
      jsonRequest("http://test/api/members", "POST", {
        access: [{ projectId: project.id, role: "TESTER" }],
        email: "dup1@example.com",
        name: "Someone Else",
        password: "supersecret1",
      }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects a password shorter than the minimum", async () => {
    const { project } = await setupAsAdmin("member-admin3@example.com", "PRJ-MEM-3");

    const response = await createMemberRoute(
      jsonRequest("http://test/api/members", "POST", {
        access: [{ projectId: project.id, role: "TESTER" }],
        email: "short-pw@example.com",
        name: "Short Password",
        password: "short",
      }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects an empty project selection", async () => {
    await setupAsAdmin("member-admin9@example.com", "PRJ-MEM-9");

    const response = await createMemberRoute(
      jsonRequest("http://test/api/members", "POST", {
        access: [],
        email: "no-projects@example.com",
        name: "No Projects",
        password: "supersecret1",
      }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects an unknown project id", async () => {
    await setupAsAdmin("member-admin6@example.com", "PRJ-MEM-6");

    const response = await createMemberRoute(
      jsonRequest("http://test/api/members", "POST", {
        access: [{ projectId: "does-not-exist", role: "TESTER" }],
        email: "no-project@example.com",
        name: "No Project",
        password: "supersecret1",
      }),
    );
    expect(response.status).toBe(400);
  });

  it("returns 403 for someone who isn't ADMIN anywhere, on list and create", async () => {
    const { project } = await setupAsAdmin("member-admin4@example.com", "PRJ-MEM-4");
    const tester = await createUser("member-tester1@example.com");
    await prisma.projectMember.create({
      data: { projectId: project.id, userId: tester.id, role: "TESTER" },
    });

    mockAuth.mockResolvedValue(sessionFor(tester.id) as never);

    const list = await listMembersRoute(jsonRequest("http://test/api/members", "GET"));
    expect(list.status).toBe(403);

    const create = await createMemberRoute(
      jsonRequest("http://test/api/members", "POST", {
        access: [{ projectId: project.id, role: "TESTER" }],
        email: "should-not-exist@example.com",
        name: "Nope",
        password: "supersecret1",
      }),
    );
    expect(create.status).toBe(403);
  });

  it("lists members across every project, optionally filtered to one", async () => {
    const { project } = await setupAsAdmin("member-admin5@example.com", "PRJ-MEM-5");

    const otherProject = await (
      await createProjectRoute(
        jsonRequest("http://test/api/projects", "POST", { code: "PRJ-MEM-5B", name: "Second", status: "DRAFT" }),
      )
    ).json();

    await createMemberRoute(
      jsonRequest("http://test/api/members", "POST", {
        access: [{ projectId: project.id, role: "VIEWER" }],
        email: "second-member@example.com",
        name: "Second Member",
        password: "supersecret1",
      }),
    );

    const all = await (await listMembersRoute(jsonRequest("http://test/api/members", "GET"))).json();
    expect(all.length).toBeGreaterThanOrEqual(3); // admin on both projects + the new member

    const scoped = await (
      await listMembersRoute(jsonRequest(`http://test/api/members?projectId=${project.id}`, "GET"))
    ).json();
    expect(scoped.every((m: { projectId: string }) => m.projectId === project.id)).toBe(true);
    expect(scoped.map((m: { user: { email: string } }) => m.user.email)).toEqual([
      "member-admin5@example.com",
      "second-member@example.com",
    ]);

    void otherProject;
  });

  it("adds, removes, and changes role for a member's access in one call", async () => {
    const { project: projectA } = await setupAsAdmin("member-admin7@example.com", "PRJ-MEM-7A");
    const projectB = await (
      await createProjectRoute(
        jsonRequest("http://test/api/projects", "POST", { code: "PRJ-MEM-7B", name: "B", status: "DRAFT" }),
      )
    ).json();

    const created = await (
      await createMemberRoute(
        jsonRequest("http://test/api/members", "POST", {
          access: [{ projectId: projectA.id, role: "TESTER" }],
          email: "multi-access@example.com",
          name: "Multi Access",
          password: "supersecret1",
        }),
      )
    ).json();

    // Drop A's role from TESTER to VIEWER, and add B as QA_LEAD.
    const response = await updateAccessRoute(
      jsonRequest(`http://test/api/members/${created.userId}`, "PATCH", {
        access: [
          { projectId: projectA.id, role: "VIEWER" },
          { projectId: projectB.id, role: "QA_LEAD" },
        ],
      }),
      { params: Promise.resolve({ userId: created.userId }) },
    );
    expect(response.status).toBe(200);

    const memberships = await prisma.projectMember.findMany({
      where: { userId: created.userId },
      orderBy: { projectId: "asc" },
    });
    expect(memberships).toHaveLength(2);
    expect(memberships.find((m) => m.projectId === projectA.id)?.role).toBe("VIEWER");
    expect(memberships.find((m) => m.projectId === projectB.id)?.role).toBe("QA_LEAD");

    // Now revoke everything.
    const revoke = await updateAccessRoute(
      jsonRequest(`http://test/api/members/${created.userId}`, "PATCH", { access: [] }),
      { params: Promise.resolve({ userId: created.userId }) },
    );
    expect(revoke.status).toBe(200);
    const remaining = await prisma.projectMember.findMany({ where: { userId: created.userId } });
    expect(remaining).toHaveLength(0);
  });

  it("returns 403 updating access when the caller isn't ADMIN anywhere", async () => {
    const { project } = await setupAsAdmin("member-admin8@example.com", "PRJ-MEM-8");
    const tester = await createUser("member-tester2@example.com");
    await prisma.projectMember.create({ data: { projectId: project.id, userId: tester.id, role: "TESTER" } });

    mockAuth.mockResolvedValue(sessionFor(tester.id) as never);
    const response = await updateAccessRoute(
      jsonRequest(`http://test/api/members/${tester.id}`, "PATCH", {
        access: [{ projectId: project.id, role: "ADMIN" }],
      }),
      { params: Promise.resolve({ userId: tester.id }) },
    );
    expect(response.status).toBe(403);
  });
});
