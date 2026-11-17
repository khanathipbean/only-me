import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { paginate, type PageFilters } from "@/lib/pagination";
import { setDeletedAt, type SoftDeleteAction } from "@/lib/soft-delete";
import { normalizeFeature, normalizeProjectNoteFeature } from "@/lib/requirements";
import { LinkValidationError, assertSafeUrl } from "@/lib/links-url";

/* The address guard lives in its own file so it can be tested without a
 * database: everything below this line reaches Postgres at import time.
 * Re-exported because callers of this module expect one door. */
export { LinkValidationError, assertSafeUrl } from "@/lib/links-url";

export type LinkInput = {
  /** Empty for a link about the Project rather than one part of it. */
  moduleId?: string | null;
  /** Sub-area of the Module, shared with Note and Requirement. */
  feature?: string | null;
  title: string;
  url: string;
};

export type LinkFilters = {
  search?: string;
  moduleId?: string;
  feature?: string;
  archived?: boolean;
};

/**
 * The one place a Link's fields are checked, and the one place the Module is
 * confirmed to be this Project's.
 *
 * The Module check is not a nicety: `moduleId` arrives from a form, and
 * without it a member of Project A could file a link under Project B's Module
 * by posting its id — the link would then be listed to people who are not
 * members of A at all. Copied in shape from `validate` in `@/lib/notes`,
 * because the rule is the same rule and two readings of it would drift.
 */
async function validate(projectId: string, input: LinkInput) {
  const title = input.title?.trim() ?? "";
  if (!title) {
    throw new LinkValidationError("Title is required");
  }
  const url = assertSafeUrl(input.url);

  const moduleId = input.moduleId || null;
  if (!moduleId) {
    return {
      title,
      url,
      moduleId: null,
      feature: await normalizeProjectNoteFeature(projectId, input.feature),
    };
  }

  const parent = await prisma.module.findUnique({
    where: { id: moduleId },
    select: { projectId: true, deletedAt: true },
  });
  if (!parent || parent.projectId !== projectId) {
    throw new LinkValidationError("Module is not part of this project");
  }
  if (parent.deletedAt) {
    throw new LinkValidationError("That Module is archived");
  }

  return {
    title,
    url,
    moduleId,
    feature: await normalizeFeature(moduleId, input.feature),
  };
}

/** Shared by every list so their results can't drift apart. */
function linkWhere(projectId: string, filters: LinkFilters) {
  const textMatch = { contains: filters.search ?? "", mode: "insensitive" as const };
  return {
    projectId,
    deletedAt: filters.archived ? { not: null } : null,
    /* `none` is the filter for links about the Project itself — an empty
     * `moduleId` already means "don't filter", so the two need different
     * values. Same convention as the Notes list. */
    ...(filters.moduleId === "none"
      ? { moduleId: null }
      : filters.moduleId
        ? { moduleId: filters.moduleId }
        : {}),
    ...(filters.feature ? { feature: filters.feature } : {}),
    /* Title *and* address: half of finding a link again is remembering the
     * system it was in rather than what the team called it, and "atlassian"
     * appears only in the address. */
    ...(filters.search ? { OR: [{ title: textMatch }, { url: textMatch }] } : {}),
  };
}

const WITH_LIST_FIELDS = {
  module: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true, email: true } },
} as const;

/**
 * One page of the Links list.
 *
 * Newest first, and only `createdAt`: a link has no "when it happened" the
 * way a Note does — it is an address, not an account of something — so there
 * is no second date that could order it more truthfully.
 */
export async function listLinksForProjectPage(
  projectId: string,
  filters: LinkFilters & PageFilters = {},
) {
  const where = linkWhere(projectId, filters);
  return paginate(
    filters,
    () => prisma.link.count({ where }),
    ({ skip, take }) =>
      prisma.link.findMany({
        where,
        include: WITH_LIST_FIELDS,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
  );
}

export async function createLink(projectId: string, input: LinkInput, actorId: string) {
  const { title, url, feature, moduleId } = await validate(projectId, input);

  const link = await prisma.link.create({
    data: { projectId, moduleId, feature, title, url, createdById: actorId },
  });

  await writeAuditLog({
    entityType: "Link",
    entityId: link.id,
    action: "create",
    actorId,
    projectId,
    newValue: { title: link.title, url: link.url, moduleId: link.moduleId },
  });

  return link;
}

export async function updateLink(id: string, input: LinkInput, actorId: string) {
  const before = await prisma.link.findUniqueOrThrow({ where: { id } });
  const { title, url, feature, moduleId } = await validate(before.projectId, input);

  const link = await prisma.link.update({
    where: { id },
    data: { moduleId, feature, title, url },
  });

  await writeAuditLog({
    entityType: "Link",
    entityId: id,
    action: "update",
    actorId,
    projectId: before.projectId,
    /* The address is recorded both sides, unlike a Note's body: it is one
     * short line, and "where does this point now" is the question somebody
     * opens the Audit Trail to answer. */
    oldValue: { title: before.title, url: before.url, moduleId: before.moduleId },
    newValue: { title: link.title, url: link.url, moduleId: link.moduleId },
  });

  return link;
}

async function setLinkDeletedAt(
  id: string,
  deletedAt: Date | null,
  actorId: string,
  action: SoftDeleteAction,
) {
  const before = await prisma.link.findUniqueOrThrow({ where: { id } });
  return setDeletedAt({
    entityType: "Link",
    actorId,
    action,
    deletedAt,
    projectId: before.projectId,
    update: (deletedAt) => prisma.link.update({ where: { id }, data: { deletedAt } }),
  });
}

export async function archiveLink(id: string, actorId: string) {
  return setLinkDeletedAt(id, new Date(), actorId, "archive");
}

export async function restoreLink(id: string, actorId: string) {
  return setLinkDeletedAt(id, null, actorId, "restore");
}
