import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/auth";
import { POST as createProjectRoute } from "@/app/api/projects/route";
import { ModuleValidationError, archiveModule, createModule } from "@/lib/modules";
import { createRequirement, listFeaturesForModule } from "@/lib/requirements";
import {
  NoteValidationError,
  archiveNote,
  createNote,
  listNotesForProjectPage,
  restoreNote,
  updateNote,
} from "@/lib/notes";

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

async function setup(ownerEmail: string, code: string) {
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
  const testModule = await createModule(project.id, "Policy", owner.id);
  return { owner, project, testModule };
}

describe("notes", () => {
  beforeEach(() => {
    mockAuth.mockReset();
  });

  it("keeps the body exactly as typed", async () => {
    const { owner, project, testModule } = await setup("note-owner1@example.com", "PRJ-NOTE-1");

    // Line breaks, hand-written numbering, and characters a Markdown parser
    // would eat. Nothing here is formatting — it is what someone typed.
    const body = "ตกลง 3 เรื่อง\n\n1. clone ข้ามโปรเจกต์\n2. <b>ไม่ใช่</b> ตัวหนา\n";
    const note = await createNote(
      project.id,
      { moduleId: testModule.id, title: "Sprint 6 Planning", body },
      owner.id,
    );

    const stored = await prisma.note.findUniqueOrThrow({ where: { id: note.id } });
    expect(stored.body).toBe(body);
  });

  it("refuses a note with no title, and one filed under another Project's Module", async () => {
    const a = await setup("note-owner2@example.com", "PRJ-NOTE-2");
    const b = await setup("note-owner3@example.com", "PRJ-NOTE-3");

    await expect(
      createNote(a.project.id, { moduleId: a.testModule.id, title: "   ", body: "x" }, a.owner.id),
    ).rejects.toThrow(NoteValidationError);

    /* The interesting one: `moduleId` comes from a form, so a member of A
     * posting B's Module id would otherwise file a note that shows up on B's
     * page — a Project they are not a member of. */
    await expect(
      createNote(a.project.id, { moduleId: b.testModule.id, title: "Sneaky", body: "x" }, a.owner.id),
    ).rejects.toThrow(NoteValidationError);

    expect(await prisma.note.count({ where: { projectId: b.project.id } })).toBe(0);
  });

  it("searches the body, not only the title", async () => {
    const { owner, project, testModule } = await setup("note-owner4@example.com", "PRJ-NOTE-4");
    await createNote(
      project.id,
      {
        moduleId: testModule.id,
        title: "Sprint 6 Planning",
        body: "Policy Template ต้องรองรับการ clone ข้ามโปรเจกต์",
      },
      owner.id,
    );
    await createNote(
      project.id,
      { moduleId: testModule.id, title: "Governance approve order", body: "ผู้ร้องขอ → QA Lead" },
      owner.id,
    );

    const byBody = await listNotesForProjectPage(project.id, { search: "clone" });
    expect(byBody.items.map((note) => note.title)).toEqual(["Sprint 6 Planning"]);

    const byTitle = await listNotesForProjectPage(project.id, { search: "governance" });
    expect(byTitle.items.map((note) => note.title)).toEqual(["Governance approve order"]);
  });

  it("orders by the date given, falling back to when the row was written", async () => {
    const { owner, project, testModule } = await setup("note-owner5@example.com", "PRJ-NOTE-5");

    // Written first but about the earlier day; the later meeting is written
    // up second. Ordered by `createdAt` these come out backwards.
    await createNote(
      project.id,
      {
        moduleId: testModule.id,
        title: "Monday",
        body: "",
        occurredOn: new Date("2026-09-14T00:00:00.000Z"),
      },
      owner.id,
    );
    await createNote(
      project.id,
      {
        moduleId: testModule.id,
        title: "Friday",
        body: "",
        occurredOn: new Date("2026-09-18T00:00:00.000Z"),
      },
      owner.id,
    );
    // No date at all: sorts last rather than first, which is where a NULL
    // lands by default in Postgres on a DESC sort.
    await createNote(project.id, { moduleId: testModule.id, title: "Undated", body: "" }, owner.id);

    const page = await listNotesForProjectPage(project.id);
    expect(page.items.map((note) => note.title)).toEqual(["Friday", "Monday", "Undated"]);
  });

  it("hides an archived note from the list and brings it back on restore", async () => {
    const { owner, project, testModule } = await setup("note-owner6@example.com", "PRJ-NOTE-6");
    const note = await createNote(
      project.id,
      { moduleId: testModule.id, title: "Retro", body: "" },
      owner.id,
    );

    await archiveNote(note.id, owner.id);
    expect((await listNotesForProjectPage(project.id)).items).toHaveLength(0);
    expect((await listNotesForProjectPage(project.id, { archived: true })).items).toHaveLength(1);

    await restoreNote(note.id, owner.id);
    expect((await listNotesForProjectPage(project.id)).items).toHaveLength(1);

    const trail = await prisma.auditLog.findMany({
      where: { entityType: "Note", entityId: note.id },
      orderBy: { occurredAt: "asc" },
      select: { action: true },
    });
    expect(trail.map((row) => row.action)).toEqual(["create", "archive", "restore"]);
  });

  it("stops a Module being archived while a note is still filed under it", async () => {
    const { owner, project, testModule } = await setup("note-owner7@example.com", "PRJ-NOTE-7");
    const note = await createNote(
      project.id,
      { moduleId: testModule.id, title: "Kickoff", body: "" },
      owner.id,
    );

    /* Same rule Requirements and files already got: archiving the Module out
     * from under a note would leave it filed against a heading that no
     * longer appears anywhere. */
    await expect(archiveModule(testModule.id, owner.id)).rejects.toThrow(ModuleValidationError);

    await archiveNote(note.id, owner.id);
    await expect(archiveModule(testModule.id, owner.id)).resolves.toBeTruthy();
  });

  it("re-spells a Feature to the spelling the Module already uses", async () => {
    const { owner, project, testModule } = await setup("note-owner9@example.com", "PRJ-NOTE-9");

    // A Requirement gets there first and sets the spelling.
    await createRequirement(
      project.id,
      { name: "REQ one", moduleId: testModule.id, feature: "Policy Center", priority: "MEDIUM" },
      owner.id,
    );

    const note = await createNote(
      project.id,
      { moduleId: testModule.id, feature: "  policy center ", title: "Retro", body: "" },
      owner.id,
    );

    /* Typed in a different case and with stray spaces; stored as the one
     * spelling the Module already uses, or the filter would show two groups
     * that are the same group. */
    expect(note.feature).toBe("Policy Center");
    expect(await listFeaturesForModule(testModule.id)).toEqual(["Policy Center"]);
  });

  it("offers a Feature a Note introduced to the next thing filed in that Module", async () => {
    const { owner, project, testModule } = await setup("note-owner10@example.com", "PRJ-NOTE-10");

    await createNote(
      project.id,
      { moduleId: testModule.id, feature: "Audit Feed", title: "Kickoff", body: "" },
      owner.id,
    );

    /* Read from Requirements alone, a label first typed on a Note would
     * never be suggested again — and the next person would spell it
     * differently and split the group in two. */
    expect(await listFeaturesForModule(testModule.id)).toEqual(["Audit Feed"]);

    const second = await createNote(
      project.id,
      { moduleId: testModule.id, feature: "audit feed", title: "Follow-up", body: "" },
      owner.id,
    );
    expect(second.feature).toBe("Audit Feed");
  });

  it("filters the list by Feature", async () => {
    const { owner, project, testModule } = await setup("note-owner11@example.com", "PRJ-NOTE-11");
    await createNote(
      project.id,
      { moduleId: testModule.id, feature: "Templates", title: "About templates", body: "" },
      owner.id,
    );
    await createNote(
      project.id,
      { moduleId: testModule.id, feature: "Approvals", title: "About approvals", body: "" },
      owner.id,
    );
    await createNote(project.id, { moduleId: testModule.id, title: "Untagged", body: "" }, owner.id);

    const page = await listNotesForProjectPage(project.id, { feature: "Templates" });
    expect(page.items.map((note) => note.title)).toEqual(["About templates"]);
    expect((await listNotesForProjectPage(project.id)).items).toHaveLength(3);
  });

  it("records what changed on an edit, without copying the body into the trail", async () => {
    const { owner, project, testModule } = await setup("note-owner8@example.com", "PRJ-NOTE-8");
    const note = await createNote(
      project.id,
      { moduleId: testModule.id, title: "Draft title", body: "first" },
      owner.id,
    );

    await updateNote(
      note.id,
      { moduleId: testModule.id, title: "Final title", body: "second" },
      owner.id,
    );

    const entry = await prisma.auditLog.findFirstOrThrow({
      where: { entityType: "Note", entityId: note.id, action: "update" },
    });
    expect(entry.oldValue).toMatchObject({ title: "Draft title" });
    expect(entry.newValue).toMatchObject({ title: "Final title" });
    expect(JSON.stringify(entry.newValue)).not.toContain("second");

    expect((await prisma.note.findUniqueOrThrow({ where: { id: note.id } })).body).toBe("second");
  });
});
