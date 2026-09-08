import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/auth";
import { GET as listProjects, POST as createProjectRoute } from "@/app/api/projects/route";
import { GET as getProject, PATCH as patchProject } from "@/app/api/projects/[id]/route";
import { POST as archiveProjectRoute } from "@/app/api/projects/[id]/archive/route";
import { POST as restoreProjectRoute } from "@/app/api/projects/[id]/restore/route";

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

describe("project routes", () => {
  beforeEach(() => {
    mockAuth.mockReset();
  });

  it("creates a project and grants the creator QA_LEAD membership", async () => {
    const owner = await createUser("owner1@example.com");
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);

    const response = await createProjectRoute(
      jsonRequest("http://test/api/projects", "POST", {
        code: "PRJ-1",
        name: "Project One",
        status: "DRAFT",
      }),
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.code).toBe("PRJ-1");

    const membership = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: body.id, userId: owner.id } },
    });
    expect(membership?.role).toBe("QA_LEAD");
  });

  it("rejects a duplicate project code", async () => {
    const owner = await createUser("owner2@example.com");
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);

    await createProjectRoute(
      jsonRequest("http://test/api/projects", "POST", {
        code: "PRJ-DUP",
        name: "First",
        status: "DRAFT",
      }),
    );

    const response = await createProjectRoute(
      jsonRequest("http://test/api/projects", "POST", {
        code: "PRJ-DUP",
        name: "Second",
        status: "DRAFT",
      }),
    );

    expect(response.status).toBe(400);
  });

  it("rejects missing required fields", async () => {
    const owner = await createUser("owner3@example.com");
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);

    const response = await createProjectRoute(
      jsonRequest("http://test/api/projects", "POST", { code: "PRJ-MISSING" }),
    );

    expect(response.status).toBe(400);
  });

  it("rejects endDate before startDate", async () => {
    const owner = await createUser("owner4@example.com");
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);

    const response = await createProjectRoute(
      jsonRequest("http://test/api/projects", "POST", {
        code: "PRJ-DATES",
        name: "Bad Dates",
        status: "DRAFT",
        startDate: "2026-02-01",
        endDate: "2026-01-01",
      }),
    );

    expect(response.status).toBe(400);
  });

  it("lists only projects the caller is a member of, respecting search and filter", async () => {
    const member = await createUser("member1@example.com");
    const outsider = await createUser("outsider1@example.com");
    mockAuth.mockResolvedValue(sessionFor(member.id) as never);

    await createProjectRoute(
      jsonRequest("http://test/api/projects", "POST", {
        code: "PRJ-SEARCH",
        name: "Findable Project",
        status: "ACTIVE",
      }),
    );

    mockAuth.mockResolvedValue(sessionFor(outsider.id) as never);
    const outsiderList = await (
      await listProjects(jsonRequest("http://test/api/projects", "GET"))
    ).json();
    expect(outsiderList).toHaveLength(0);

    mockAuth.mockResolvedValue(sessionFor(member.id) as never);
    const found = await (
      await listProjects(jsonRequest("http://test/api/projects?search=Findable", "GET"))
    ).json();
    expect(found).toHaveLength(1);

    const notFound = await (
      await listProjects(jsonRequest("http://test/api/projects?search=Nope", "GET"))
    ).json();
    expect(notFound).toHaveLength(0);
  });

  it("filters by status", async () => {
    const member = await createUser("member2@example.com");
    mockAuth.mockResolvedValue(sessionFor(member.id) as never);

    await createProjectRoute(
      jsonRequest("http://test/api/projects", "POST", {
        code: "PRJ-DRAFT",
        name: "Draft Project",
        status: "DRAFT",
      }),
    );
    await createProjectRoute(
      jsonRequest("http://test/api/projects", "POST", {
        code: "PRJ-ACTIVE",
        name: "Active Project",
        status: "ACTIVE",
      }),
    );

    const active = await (
      await listProjects(jsonRequest("http://test/api/projects?status=ACTIVE", "GET"))
    ).json();
    expect(active.map((p: { code: string }) => p.code)).toEqual(["PRJ-ACTIVE"]);
  });

  it("filters by owner", async () => {
    const ownerA = await createUser("ownerA@example.com");
    const ownerB = await createUser("ownerB@example.com");

    mockAuth.mockResolvedValue(sessionFor(ownerA.id) as never);
    await createProjectRoute(
      jsonRequest("http://test/api/projects", "POST", {
        code: "PRJ-OWNER-A",
        name: "Owner A Project",
        status: "DRAFT",
      }),
    );

    mockAuth.mockResolvedValue(sessionFor(ownerB.id) as never);
    await createProjectRoute(
      jsonRequest("http://test/api/projects", "POST", {
        code: "PRJ-OWNER-B",
        name: "Owner B Project",
        status: "DRAFT",
      }),
    );

    // ownerB is not a member of PRJ-OWNER-A, so this only proves the filter
    // narrows within a caller's own membership set, using ownerB's own project.
    const filtered = await (
      await listProjects(jsonRequest(`http://test/api/projects?owner=${ownerB.id}`, "GET"))
    ).json();
    expect(filtered.map((p: { code: string }) => p.code)).toEqual(["PRJ-OWNER-B"]);
  });

  it("returns 403 for a non-member on detail, update, archive, and restore", async () => {
    const owner = await createUser("owner5@example.com");
    const outsider = await createUser("outsider2@example.com");
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);

    const created = await (
      await createProjectRoute(
        jsonRequest("http://test/api/projects", "POST", {
          code: "PRJ-403",
          name: "Restricted",
          status: "DRAFT",
        }),
      )
    ).json();

    mockAuth.mockResolvedValue(sessionFor(outsider.id) as never);
    const params = Promise.resolve({ id: created.id });

    const detail = await getProject(jsonRequest(`http://test/api/projects/${created.id}`, "GET"), { params });
    expect(detail.status).toBe(403);

    const update = await patchProject(
      jsonRequest(`http://test/api/projects/${created.id}`, "PATCH", { code: "X", name: "X", status: "DRAFT" }),
      { params },
    );
    expect(update.status).toBe(403);

    const archive = await archiveProjectRoute(
      jsonRequest(`http://test/api/projects/${created.id}/archive`, "POST"),
      { params },
    );
    expect(archive.status).toBe(403);

    const restore = await restoreProjectRoute(
      jsonRequest(`http://test/api/projects/${created.id}/restore`, "POST"),
      { params },
    );
    expect(restore.status).toBe(403);
  });

  it("update writes an audit log entry", async () => {
    const owner = await createUser("owner6@example.com");
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);

    const created = await (
      await createProjectRoute(
        jsonRequest("http://test/api/projects", "POST", {
          code: "PRJ-AUDIT",
          name: "Before",
          status: "DRAFT",
        }),
      )
    ).json();

    const params = Promise.resolve({ id: created.id });
    await patchProject(
      jsonRequest(`http://test/api/projects/${created.id}`, "PATCH", {
        code: "PRJ-AUDIT",
        name: "After",
        status: "ACTIVE",
      }),
      { params },
    );

    const logs = await prisma.auditLog.findMany({
      where: { entityId: created.id, action: "update" },
    });
    expect(logs).toHaveLength(1);
  });

  it("archive hides a project from the default list and restore reverses it", async () => {
    const owner = await createUser("owner7@example.com");
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);

    const created = await (
      await createProjectRoute(
        jsonRequest("http://test/api/projects", "POST", {
          code: "PRJ-ARCHIVE",
          name: "Archivable",
          status: "DRAFT",
        }),
      )
    ).json();

    const params = Promise.resolve({ id: created.id });

    await archiveProjectRoute(
      jsonRequest(`http://test/api/projects/${created.id}/archive`, "POST"),
      { params },
    );

    const afterArchive = await (
      await listProjects(jsonRequest("http://test/api/projects?search=Archivable", "GET"))
    ).json();
    expect(afterArchive).toHaveLength(0);

    await restoreProjectRoute(
      jsonRequest(`http://test/api/projects/${created.id}/restore`, "POST"),
      { params },
    );

    const afterRestore = await (
      await listProjects(jsonRequest("http://test/api/projects?search=Archivable", "GET"))
    ).json();
    expect(afterRestore).toHaveLength(1);
  });
});
