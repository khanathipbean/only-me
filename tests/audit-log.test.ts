import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/auth";
import { POST as createProjectRoute } from "@/app/api/projects/route";
import { PATCH as patchProjectRoute } from "@/app/api/projects/[id]/route";
import * as auditLogRoute from "@/app/api/projects/[id]/audit-log/route";
import { parseUtcDateTimeLocal } from "@/lib/audit-log";

const { GET: getAuditLog } = auditLogRoute;

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

describe("audit log", () => {
  beforeEach(() => {
    mockAuth.mockReset();
  });

  it("records a create entry and an update entry, filterable by action, entityType, and actorId", async () => {
    const owner = await createUser("al-owner1@example.com");
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);

    const project = await (
      await createProjectRoute(
        jsonRequest("http://test/api/projects", "POST", {
          code: "PRJ-AL-1",
          name: "Audited Project",
          status: "DRAFT",
        }),
      )
    ).json();

    await patchProjectRoute(
      jsonRequest(`http://test/api/projects/${project.id}`, "PATCH", {
        code: "PRJ-AL-1",
        name: "Renamed",
        status: "ACTIVE",
      }),
      { params: Promise.resolve({ id: project.id }) },
    );

    const all = await (
      await getAuditLog(jsonRequest(`http://test/api/projects/${project.id}/audit-log`, "GET"), {
        params: Promise.resolve({ id: project.id }),
      })
    ).json();
    expect(all.total).toBe(2);

    const onlyUpdates = await (
      await getAuditLog(
        jsonRequest(`http://test/api/projects/${project.id}/audit-log?action=update`, "GET"),
        { params: Promise.resolve({ id: project.id }) },
      )
    ).json();
    expect(onlyUpdates.total).toBe(1);
    expect(onlyUpdates.entries[0].action).toBe("update");

    const byEntityType = await (
      await getAuditLog(
        jsonRequest(`http://test/api/projects/${project.id}/audit-log?entityType=Project`, "GET"),
        { params: Promise.resolve({ id: project.id }) },
      )
    ).json();
    expect(byEntityType.total).toBe(2);

    const byActor = await (
      await getAuditLog(
        jsonRequest(`http://test/api/projects/${project.id}/audit-log?actorId=${owner.id}`, "GET"),
        { params: Promise.resolve({ id: project.id }) },
      )
    ).json();
    expect(byActor.total).toBe(2);

    const combined = await (
      await getAuditLog(
        jsonRequest(
          `http://test/api/projects/${project.id}/audit-log?action=update&entityType=Project&actorId=${owner.id}`,
          "GET",
        ),
        { params: Promise.resolve({ id: project.id }) },
      )
    ).json();
    expect(combined.total).toBe(1);

    const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    const farPast = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    const combinedWithTimeRange = await (
      await getAuditLog(
        jsonRequest(
          `http://test/api/projects/${project.id}/audit-log?action=update&entityType=Project&actorId=${owner.id}&from=${farPast}&to=${farFuture}`,
          "GET",
        ),
        { params: Promise.resolve({ id: project.id }) },
      )
    ).json();
    expect(combinedWithTimeRange.total).toBe(1);

    const combinedWithNonMatchingTimeRange = await (
      await getAuditLog(
        jsonRequest(
          `http://test/api/projects/${project.id}/audit-log?action=update&entityType=Project&actorId=${owner.id}&from=${farFuture}`,
          "GET",
        ),
        { params: Promise.resolve({ id: project.id }) },
      )
    ).json();
    expect(combinedWithNonMatchingTimeRange.total).toBe(0);
  });

  it("does not leak another project's entries when a legitimate member passes a cross-project actorId filter", async () => {
    const ownerA = await createUser("al-ownerC@example.com");
    const ownerB = await createUser("al-ownerD@example.com");

    mockAuth.mockResolvedValue(sessionFor(ownerA.id) as never);
    const projectA = await (
      await createProjectRoute(
        jsonRequest("http://test/api/projects", "POST", {
          code: "PRJ-AL-5A",
          name: "Project A",
          status: "DRAFT",
        }),
      )
    ).json();

    mockAuth.mockResolvedValue(sessionFor(ownerB.id) as never);
    const projectB = await (
      await createProjectRoute(
        jsonRequest("http://test/api/projects", "POST", {
          code: "PRJ-AL-5B",
          name: "Project B",
          status: "DRAFT",
        }),
      )
    ).json();

    // ownerB is a legitimate member of projectB and tries to peek at projectA's
    // log by filtering their own project's endpoint with ownerA's actorId.
    mockAuth.mockResolvedValue(sessionFor(ownerB.id) as never);
    const result = await (
      await getAuditLog(
        jsonRequest(`http://test/api/projects/${projectB.id}/audit-log?actorId=${ownerA.id}`, "GET"),
        { params: Promise.resolve({ id: projectB.id }) },
      )
    ).json();
    expect(result.total).toBe(0);

    // Sanity check: projectA's own log does contain ownerA's create entry.
    mockAuth.mockResolvedValue(sessionFor(ownerA.id) as never);
    const ownLog = await (
      await getAuditLog(
        jsonRequest(`http://test/api/projects/${projectA.id}/audit-log?actorId=${ownerA.id}`, "GET"),
        { params: Promise.resolve({ id: projectA.id }) },
      )
    ).json();
    expect(ownLog.total).toBe(1);
  });

  it("parses a datetime-local value as UTC, not the server's local timezone", () => {
    const parsed = parseUtcDateTimeLocal("2026-09-08T14:30");
    expect(parsed?.toISOString()).toBe("2026-09-08T14:30:00.000Z");
    expect(parseUtcDateTimeLocal(undefined)).toBeUndefined();
    expect(parseUtcDateTimeLocal("not-a-date")).toBeUndefined();
  });

  it("filters by time range", async () => {
    const owner = await createUser("al-owner2@example.com");
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);

    const project = await (
      await createProjectRoute(
        jsonRequest("http://test/api/projects", "POST", {
          code: "PRJ-AL-2",
          name: "Time Ranged Project",
          status: "DRAFT",
        }),
      )
    ).json();

    const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    const farPast = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();

    const withinRange = await (
      await getAuditLog(
        jsonRequest(
          `http://test/api/projects/${project.id}/audit-log?from=${farPast}&to=${farFuture}`,
          "GET",
        ),
        { params: Promise.resolve({ id: project.id }) },
      )
    ).json();
    expect(withinRange.total).toBe(1);

    const outsideRange = await (
      await getAuditLog(
        jsonRequest(`http://test/api/projects/${project.id}/audit-log?from=${farFuture}`, "GET"),
        { params: Promise.resolve({ id: project.id }) },
      )
    ).json();
    expect(outsideRange.total).toBe(0);
  });

  it("isolates the audit log per project and rejects a non-member with 403", async () => {
    const ownerA = await createUser("al-ownerA@example.com");
    const ownerB = await createUser("al-ownerB@example.com");

    mockAuth.mockResolvedValue(sessionFor(ownerA.id) as never);
    const projectA = await (
      await createProjectRoute(
        jsonRequest("http://test/api/projects", "POST", {
          code: "PRJ-AL-3A",
          name: "Project A",
          status: "DRAFT",
        }),
      )
    ).json();

    mockAuth.mockResolvedValue(sessionFor(ownerB.id) as never);
    await createProjectRoute(
      jsonRequest("http://test/api/projects", "POST", {
        code: "PRJ-AL-3B",
        name: "Project B",
        status: "DRAFT",
      }),
    );

    // ownerB is a real project member elsewhere, just not of projectA.
    const response = await getAuditLog(
      jsonRequest(`http://test/api/projects/${projectA.id}/audit-log`, "GET"),
      { params: Promise.resolve({ id: projectA.id }) },
    );
    expect(response.status).toBe(403);
  });

  it("stores and returns occurredAt as UTC", async () => {
    const owner = await createUser("al-owner3@example.com");
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);

    const before = new Date();
    const project = await (
      await createProjectRoute(
        jsonRequest("http://test/api/projects", "POST", {
          code: "PRJ-AL-4",
          name: "UTC Project",
          status: "DRAFT",
        }),
      )
    ).json();
    const after = new Date();

    const result = await (
      await getAuditLog(jsonRequest(`http://test/api/projects/${project.id}/audit-log`, "GET"), {
        params: Promise.resolve({ id: project.id }),
      })
    ).json();

    const occurredAt = new Date(result.entries[0].occurredAt);
    expect(result.entries[0].occurredAt.endsWith("Z")).toBe(true);
    expect(occurredAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(occurredAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it("exposes no PATCH, DELETE, or POST method on the audit-log route", () => {
    expect((auditLogRoute as Record<string, unknown>).PATCH).toBeUndefined();
    expect((auditLogRoute as Record<string, unknown>).DELETE).toBeUndefined();
    expect((auditLogRoute as Record<string, unknown>).POST).toBeUndefined();
  });
});
