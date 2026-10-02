import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { paginate, type PageFilters } from "@/lib/pagination";
import { setDeletedAt, type SoftDeleteAction } from "@/lib/soft-delete";
import { normalizeFeature, normalizeProjectNoteFeature } from "@/lib/requirements";

export class NoteValidationError extends Error {}

export type NoteInput = {
  /** Empty for a note about the Project rather than one part of it. */
  moduleId?: string | null;
  /** Sub-area of the Module, shared with Requirement. Free text, re-spelled
   *  server-side to whatever spelling the Module already uses. */
  feature?: string | null;
  title: string;
  body: string;
  /** When the thing written about happened. Null means "no date given" — not
   *  today, which would be a guess the list then sorts on. */
  occurredOn?: Date | null;
};

export type NoteFilters = {
  search?: string;
  moduleId?: string;
  feature?: string;
  archived?: boolean;
};

/**
 * The one place a Note's fields are checked, and the one place the Module is
 * confirmed to be this Project's.
 *
 * That last check is not a nicety and did not become one when the Module
 * stopped being required: `moduleId` arrives from a form, and without it a
 * member of Project A could file a note under Project B's Module by posting
 * its id — the note would then be listed to people who are not members of A
 * at all. What changed is only that no Module is now an answer; a Module
 * that is not this Project's still is not.
 */
async function validate(projectId: string, input: NoteInput) {
  const title = input.title?.trim() ?? "";
  if (!title) {
    throw new NoteValidationError("Title is required");
  }

  const moduleId = input.moduleId || null;
  if (!moduleId) {
    /* A note against the Project keeps its Feature, pooled with the other
     * notes that have no Module rather than with a Module's.
     *
     * It used to be dropped here, on the grounds that a Feature names a
     * sub-area of a Module. That reasoning was tidy and the behaviour was
     * not: the form still offered the field, took what was typed, and
     * reported success — so the label vanished with nothing said. Silently
     * discarding what someone typed is worse than either keeping it or
     * refusing it. */
    return {
      title,
      body: input.body ?? "",
      moduleId: null,
      feature: await normalizeProjectNoteFeature(projectId, input.feature),
    };
  }

  const parent = await prisma.module.findUnique({
    where: { id: moduleId },
    select: { projectId: true, deletedAt: true },
  });
  if (!parent || parent.projectId !== projectId) {
    throw new NoteValidationError("Module is not part of this project");
  }
  if (parent.deletedAt) {
    throw new NoteValidationError("That Module is archived");
  }

  return {
    title,
    body: input.body ?? "",
    moduleId,
    feature: await normalizeFeature(moduleId, input.feature),
  };
}

/** Shared by every list so their results can't drift apart. */
function noteWhere(projectId: string, filters: NoteFilters) {
  const textMatch = { contains: filters.search ?? "", mode: "insensitive" as const };
  return {
    projectId,
    deletedAt: filters.archived ? { not: null } : null,
    /* `none` is the filter for notes about the Project itself. An empty
     * `moduleId` already means "don't filter", so the two need different
     * values — and without one, those notes are reachable only by scrolling
     * past every other one. */
    ...(filters.moduleId === "none"
      ? { moduleId: null }
      : filters.moduleId
        ? { moduleId: filters.moduleId }
        : {}),
    ...(filters.feature ? { feature: filters.feature } : {}),
    /* Title *and* body, unlike every other list in the app, which searches a
     * name. A note's worth is mostly in its body: "clone ข้ามโปรเจกต์" should
     * find the note that decided it even though those words are nowhere in
     * its title.
     *
     * `contains` on a long text column is a sequential scan. At this size
     * that costs nothing, and it is the honest thing to leave until it does
     * — a trigram index or Postgres full-text is the answer then, not now. */
    ...(filters.search ? { OR: [{ title: textMatch }, { body: textMatch }] } : {}),
  };
}

const WITH_LIST_FIELDS = {
  module: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true, email: true } },
} as const;

/**
 * One page of the Notes list.
 *
 * Ordered by `occurredOn` first and `createdAt` only as the tie-break: the
 * date someone gave is what they mean by "when", and a note written up two
 * days late would otherwise jump the one it should sit under.
 */
export async function listNotesForProjectPage(
  projectId: string,
  filters: NoteFilters & PageFilters = {},
) {
  const where = noteWhere(projectId, filters);
  return paginate(
    filters,
    () => prisma.note.count({ where }),
    ({ skip, take }) =>
      prisma.note.findMany({
        where,
        include: WITH_LIST_FIELDS,
        orderBy: [{ occurredOn: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
        skip,
        take,
      }),
  );
}

export async function getNoteById(id: string) {
  return prisma.note.findUnique({ where: { id }, include: WITH_LIST_FIELDS });
}

export async function createNote(projectId: string, input: NoteInput, actorId: string) {
  const { title, body, feature, moduleId } = await validate(projectId, input);

  const note = await prisma.note.create({
    data: {
      projectId,
      moduleId,
      feature,
      title,
      body,
      occurredOn: input.occurredOn ?? null,
      createdById: actorId,
    },
  });

  await writeAuditLog({
    entityType: "Note",
    entityId: note.id,
    action: "create",
    actorId,
    projectId,
    newValue: { title: note.title, moduleId: note.moduleId },
  });

  return note;
}

export async function updateNote(id: string, input: NoteInput, actorId: string) {
  const before = await prisma.note.findUniqueOrThrow({ where: { id } });
  const { title, body, feature, moduleId } = await validate(before.projectId, input);

  const note = await prisma.note.update({
    where: { id },
    data: {
      moduleId,
      feature,
      title,
      body,
      occurredOn: input.occurredOn ?? null,
    },
  });

  await writeAuditLog({
    entityType: "Note",
    entityId: id,
    action: "update",
    actorId,
    projectId: before.projectId,
    /* The body is not recorded either side: an audit row is a trail of what
     * changed, and copying a page of prose into it twice per edit would make
     * the Audit Trail unreadable and the table large for no gain. */
    oldValue: { title: before.title, moduleId: before.moduleId },
    newValue: { title: note.title, moduleId: note.moduleId },
  });

  return note;
}

export async function setNoteDeletedAt(
  id: string,
  deletedAt: Date | null,
  actorId: string,
  action: SoftDeleteAction,
) {
  const before = await prisma.note.findUniqueOrThrow({ where: { id } });
  return setDeletedAt({
    entityType: "Note",
    actorId,
    action,
    deletedAt,
    projectId: before.projectId,
    update: (deletedAt) => prisma.note.update({ where: { id }, data: { deletedAt } }),
  });
}

export async function archiveNote(id: string, actorId: string) {
  return setNoteDeletedAt(id, new Date(), actorId, "archive");
}

export async function restoreNote(id: string, actorId: string) {
  return setNoteDeletedAt(id, null, actorId, "restore");
}
