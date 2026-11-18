import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/auth";
import { POST as createProjectRoute } from "@/app/api/projects/route";
import { createModule } from "@/lib/modules";
import { createNote } from "@/lib/notes";
import { createLink } from "@/lib/links";
import { listResourcesPage } from "@/lib/resources";
import { createUser, jsonRequest, sessionFor, uniqueCode, uniqueEmail } from "./support/fixtures";

const mockAuth = vi.mocked(auth);

async function setup() {
  const code = uniqueCode("prj-res");
  const owner = await createUser(uniqueEmail("resources-owner"));
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

/** A file row written straight in: uploading one needs bytes and a store,
 *  and what is under test here is the merge, not the upload. */
async function addFile(
  projectId: string,
  ownerId: string,
  fileName: string,
  uploadedAt: Date,
  size = 2048,
) {
  return prisma.projectFile.create({
    data: {
      projectId,
      module: "No module",
      fileName,
      storageKey: `project-files/${crypto.randomUUID()}`,
      contentType: "application/pdf",
      size,
      uploadedById: ownerId,
      uploadedAt,
    },
  });
}

const all = (projectId: string, extra = {}) =>
  listResourcesPage(projectId, { includeFiles: true, pageSize: 50, ...extra });

/**
 * The All view, which is the only place the three kinds meet.
 *
 * Everything here is about the merge itself: which rows appear, in what
 * order, and who is allowed to see them. The three lists it draws from are
 * each tested elsewhere, and this does not restate them.
 */
describe("the All view", () => {
  beforeEach(() => {
    mockAuth.mockReset();
  });

  it("puts all three kinds in one list", async () => {
    const { owner, project } = await setup();
    await createNote(project.id, { title: "Kickoff", body: "What we agreed" }, owner.id);
    await createLink(
      project.id,
      { title: "Jira epic", url: "https://example.com/browse/X-1" },
      owner.id,
    );
    await addFile(project.id, owner.id, "spec.pdf", new Date());

    const page = await all(project.id);
    expect(page.items.map((row) => row.kind).sort()).toEqual(["FILE", "LINK", "NOTE"]);
    expect(page.total).toBe(3);
  });

  it("orders a note by the day it is about, not the day it was typed", async () => {
    /* The reason this is not simply `createdAt` for everything. A note
       written up today about last month's meeting belongs under last month,
       which is how the Notes list already orders itself — sorting the merged
       list any other way would quietly disagree with the tab it came from. */
    const { owner, project } = await setup();
    await createNote(
      project.id,
      { title: "Old meeting", body: "", occurredOn: new Date("2026-01-05T00:00:00Z") },
      owner.id,
    );
    await addFile(project.id, owner.id, "yesterday.pdf", new Date("2026-06-01T00:00:00Z"));

    const page = await all(project.id);
    expect(page.items.map((row) => row.title)).toEqual(["yesterday.pdf", "Old meeting"]);
  });

  it("leaves files out for a reader who may not see them", async () => {
    /* Hiding the Files pill is not enough — the rows would still be here.
       This is the check that matters when `files.view` is taken away from a
       role in Roles & Permissions. */
    const { owner, project } = await setup();
    await createNote(project.id, { title: "Kickoff", body: "" }, owner.id);
    await addFile(project.id, owner.id, "secret.pdf", new Date());

    const page = await listResourcesPage(project.id, { includeFiles: false, pageSize: 50 });
    expect(page.items.map((row) => row.kind)).toEqual(["NOTE"]);
  });

  it("searches what each kind actually holds", async () => {
    /* One box over three different columns: a note's body, a link's address
       and a file's name. Half of finding a link again is remembering the
       system it was in, which appears nowhere but the address. */
    const { owner, project } = await setup();
    await createNote(project.id, { title: "Kickoff", body: "we chose atlantis" }, owner.id);
    await createLink(
      project.id,
      { title: "Board", url: "https://atlantis.example.com/x" },
      owner.id,
    );
    await addFile(project.id, owner.id, "atlantis-spec.pdf", new Date());
    await createNote(project.id, { title: "Unrelated", body: "nothing to find" }, owner.id);

    const page = await all(project.id, { search: "atlantis" });
    expect(page.items.map((row) => row.kind).sort()).toEqual(["FILE", "LINK", "NOTE"]);
  });

  it("separates 'no module' from 'any module'", async () => {
    const { owner, project, testModule } = await setup();
    await createNote(
      project.id,
      { title: "About the Project", body: "", moduleId: null },
      owner.id,
    );
    await createNote(
      project.id,
      { title: "About Policy", body: "", moduleId: testModule.id },
      owner.id,
    );

    const none = await all(project.id, { moduleId: "none" });
    expect(none.items.map((row) => row.title)).toEqual(["About the Project"]);

    const one = await all(project.id, { moduleId: testModule.id });
    expect(one.items.map((row) => row.title)).toEqual(["About Policy"]);
    expect(one.items[0].module).toBe("Policy");
  });

  it("says where each row goes, and which one leaves the app", async () => {
    const { owner, project } = await setup();
    const link = await createLink(
      project.id,
      { title: "Jira epic", url: "https://example.com/browse/X-1" },
      owner.id,
    );
    const note = await createNote(project.id, { title: "Kickoff", body: "" }, owner.id);

    const page = await all(project.id);
    const byKind = Object.fromEntries(page.items.map((row) => [row.kind, row]));
    expect(byKind.LINK.href).toBe("https://example.com/browse/X-1");
    expect(byKind.LINK.external).toBe(true);
    /* A note opens on the Notes tab with its own row already expanded —
       `noteId` is what that page reads to decide which one starts open. */
    expect(byKind.NOTE.href).toBe(
      `/projects/${project.id}/resources/notes?noteId=${note.id}`,
    );
    expect(byKind.NOTE.external).toBe(false);
    expect(link.id).toBeTruthy();
  });

  it("shows the archived ones only when asked", async () => {
    const { owner, project } = await setup();
    const note = await createNote(project.id, { title: "Filed away", body: "" }, owner.id);
    await prisma.note.update({ where: { id: note.id }, data: { deletedAt: new Date() } });
    await createNote(project.id, { title: "Still here", body: "" }, owner.id);

    const active = await all(project.id);
    expect(active.items.map((row) => row.title)).toEqual(["Still here"]);

    const archived = await all(project.id, { archived: true });
    expect(archived.items.map((row) => row.title)).toEqual(["Filed away"]);
  });
});
