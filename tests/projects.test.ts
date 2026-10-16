import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/auth";
import { GET as listProjects, POST as createProjectRoute } from "@/app/api/projects/route";
import { GET as getProject, PATCH as patchProject } from "@/app/api/projects/[id]/route";
import { POST as archiveProjectRoute } from "@/app/api/projects/[id]/archive/route";
import { POST as restoreProjectRoute } from "@/app/api/projects/[id]/restore/route";
import { createUser, jsonRequest, sessionFor, uniqueCode, uniqueEmail } from "./support/fixtures";

const mockAuth = vi.mocked(auth);

describe("project routes", () => {
  beforeEach(() => {
    mockAuth.mockReset();
  });

  it("creates a project and grants the creator QA_LEAD membership", async () => {
    const owner = await createUser(uniqueEmail("owner"));
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);

    const code = uniqueCode("prj");
    const response = await createProjectRoute(
      jsonRequest("http://test/api/projects", "POST", {
        code,
        name: "Project One",
        status: "DRAFT",
      }),
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.code).toBe(code);

    const membership = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: body.id, userId: owner.id } },
    });
    expect(membership?.role).toBe("QA_LEAD");
  });

  it("rejects a duplicate project code", async () => {
    const owner = await createUser(uniqueEmail("owner"));
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);

    /* Both calls send the same code on purpose: the second one is the
     * duplicate this test is about. */
    const code = uniqueCode("prj-dup");
    await createProjectRoute(
      jsonRequest("http://test/api/projects", "POST", {
        code,
        name: "First",
        status: "DRAFT",
      }),
    );

    const response = await createProjectRoute(
      jsonRequest("http://test/api/projects", "POST", {
        code,
        name: "Second",
        status: "DRAFT",
      }),
    );

    expect(response.status).toBe(400);
  });

  it("rejects missing required fields", async () => {
    const owner = await createUser(uniqueEmail("owner"));
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);

    const response = await createProjectRoute(
      jsonRequest("http://test/api/projects", "POST", { code: uniqueCode("prj-missing") }),
    );

    expect(response.status).toBe(400);
  });

  it("rejects endDate before startDate", async () => {
    const owner = await createUser(uniqueEmail("owner"));
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);

    const response = await createProjectRoute(
      jsonRequest("http://test/api/projects", "POST", {
        code: uniqueCode("prj"),
        name: "Bad Dates",
        status: "DRAFT",
        startDate: "2026-02-01",
        endDate: "2026-01-01",
      }),
    );

    expect(response.status).toBe(400);
  });

  it("lists only projects the caller is a member of, respecting search and filter", async () => {
    const member = await createUser(uniqueEmail("member"));
    const outsider = await createUser(uniqueEmail("outsider"));
    mockAuth.mockResolvedValue(sessionFor(member.id) as never);

    await createProjectRoute(
      jsonRequest("http://test/api/projects", "POST", {
        code: uniqueCode("prj"),
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
    const member = await createUser(uniqueEmail("member"));
    mockAuth.mockResolvedValue(sessionFor(member.id) as never);

    const activeCode = uniqueCode("prj-active");
    await createProjectRoute(
      jsonRequest("http://test/api/projects", "POST", {
        code: uniqueCode("prj-draft"),
        name: "Draft Project",
        status: "DRAFT",
      }),
    );
    await createProjectRoute(
      jsonRequest("http://test/api/projects", "POST", {
        code: activeCode,
        name: "Active Project",
        status: "ACTIVE",
      }),
    );

    const active = await (
      await listProjects(jsonRequest("http://test/api/projects?status=ACTIVE", "GET"))
    ).json();
    expect(active.map((p: { code: string }) => p.code)).toEqual([activeCode]);
  });

  it("returns 403 for a non-member on detail, update, archive, and restore", async () => {
    const owner = await createUser(uniqueEmail("owner"));
    const outsider = await createUser(uniqueEmail("outsider"));
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);

    const created = await (
      await createProjectRoute(
        jsonRequest("http://test/api/projects", "POST", {
          code: uniqueCode("prj"),
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
    const owner = await createUser(uniqueEmail("owner"));
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);

    const code = uniqueCode("prj-audit");
    const created = await (
      await createProjectRoute(
        jsonRequest("http://test/api/projects", "POST", {
          code,
          name: "Before",
          status: "DRAFT",
        }),
      )
    ).json();

    const params = Promise.resolve({ id: created.id });
    await patchProject(
      jsonRequest(`http://test/api/projects/${created.id}`, "PATCH", {
        code,
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
    const owner = await createUser(uniqueEmail("owner"));
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);

    const created = await (
      await createProjectRoute(
        jsonRequest("http://test/api/projects", "POST", {
          code: uniqueCode("prj"),
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

/**
 * `status` and the other enum fields used to be handed to Prisma exactly as
 * they arrived. Prisma threw its own invocation error, the route's catch knew
 * only about `ValidationError`, and a mistyped value came back as a five
 * hundred — through a plain POST, with no interface involved.
 */
describe("a value the column cannot hold", () => {
  it("is a bad request, not a crash", async () => {
    const owner = await createUser(uniqueEmail("enum-owner"));
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);

    const response = await createProjectRoute(
      jsonRequest("http://test/api/projects", "POST", {
        code: uniqueCode("prj-enum"),
        name: "Bad status",
        status: "NOT_A_REAL_STATUS",
      }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/DRAFT, ACTIVE, COMPLETED/);
  });

  it("says which field it was, so the message is worth reading", async () => {
    const owner = await createUser(uniqueEmail("enum-owner"));
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);

    const response = await createProjectRoute(
      jsonRequest("http://test/api/projects", "POST", {
        code: uniqueCode("prj-enum"),
        name: "Bad status",
        status: 42,
      }),
    );

    expect((await response.json()).error).toMatch(/^Status must be/);
  });

  it("ignores a filter value nothing could match, rather than refusing to answer", async () => {
    const owner = await createUser(uniqueEmail("enum-filter"));
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    await createProjectRoute(
      jsonRequest("http://test/api/projects", "POST", {
        code: uniqueCode("prj-filter"),
        name: "Findable",
        status: "ACTIVE",
      }),
    );

    /* Narrowing a list is a request, not an instruction: ?status=NONSENSE
     * asks for something that cannot exist, and the list is the honest
     * answer. Cast straight into the `where` clause it was a 500. */
    const response = await listProjects(
      jsonRequest("http://test/api/projects?status=NONSENSE", "GET"),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).length).toBeGreaterThan(0);
  });
});
