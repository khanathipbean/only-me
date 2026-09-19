import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { notifyProject } from "@/lib/notifications";
import { hashPassword } from "@/lib/auth-credentials";
import { MIN_PASSWORD_LENGTH } from "@/lib/users";
import { PROJECT_ROLE_OPTIONS } from "@/lib/enums";
import { Prisma, type ProjectRole } from "@/generated/prisma/client";

function roleLabel(role: ProjectRole) {
  return PROJECT_ROLE_OPTIONS.find((option) => option.value === role)?.label ?? role;
}

export class ValidationError extends Error {}
export class DuplicateEmailError extends Error {
  constructor() {
    super("A user with this email already exists");
  }
}
export class CannotDeleteSelfError extends ValidationError {
  constructor() {
    super("You can't delete your own account");
  }
}
export class UserInUseError extends ValidationError {
  constructor() {
    super(
      "This user owns or created something elsewhere in the system (a Project, Test Case, upload, etc.) and can't be deleted until that's reassigned",
    );
  }
}
export class LastAdminError extends ValidationError {
  constructor() {
    super("This would leave no Admin anywhere in the system — keep at least one");
  }
}

/** Unfiltered, this is every membership in the system — the global Members
 * page has no one Project to scope by, since adding someone to a brand-new
 * Project is the point (see `listAllProjectsForPicker`). */
export async function listAllMembers(filters: { projectId?: string } = {}) {
  return prisma.projectMember.findMany({
    where: filters.projectId ? { projectId: filters.projectId } : {},
    include: {
      user: { select: { id: true, name: true, email: true } },
      project: { select: { id: true, code: true, name: true } },
    },
    orderBy: [{ project: { code: "asc" } }, { createdAt: "asc" }],
  });
}

/** One row per account rather than one per membership — so editing a
 * person's access covers every Project they're in from a single place,
 * instead of the same user appearing once per row scattered down the table. */
export async function listMembersGroupedByUser() {
  const members = await listAllMembers();

  const byUser = new Map<
    string,
    {
      userId: string;
      name: string;
      email: string;
      memberships: { projectId: string; code: string; name: string; role: ProjectRole }[];
    }
  >();

  for (const member of members) {
    const existing = byUser.get(member.userId);
    const membership = {
      projectId: member.projectId,
      code: member.project.code,
      name: member.project.name,
      role: member.role,
    };
    if (existing) {
      existing.memberships.push(membership);
    } else {
      byUser.set(member.userId, {
        userId: member.userId,
        name: member.user.name,
        email: member.user.email,
        memberships: [membership],
      });
    }
  }

  return Array.from(byUser.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Replaces one account's entire set of Project memberships with `access` —
 * added, removed, and role-changed rows in one transaction, so a partial
 * failure can't leave the account part-updated (e.g. removed from a Project
 * without the replacement role actually being granted).
 */
export async function updateUserProjectAccess(
  userId: string,
  access: { projectId: string; role: ProjectRole }[],
  actorId: string,
) {
  const projectIds = access.map((entry) => entry.projectId);
  if (new Set(projectIds).size !== projectIds.length) {
    throw new ValidationError("Each project can only be listed once");
  }

  // "Admin somewhere" is the only thing that gates Members/project-creation
  // (see `isAdminAnywhere`), so losing the last ADMIN row in the whole
  // system — not just on this account — would lock everyone out of both.
  // Skipped when this account keeps an ADMIN role itself: no other row can
  // be at risk from this call.
  if (!access.some((entry) => entry.role === "ADMIN")) {
    const otherAdmins = await prisma.projectMember.count({
      where: { role: "ADMIN", userId: { not: userId } },
    });
    if (otherAdmins === 0) {
      throw new LastAdminError();
    }
  }

  const before = await prisma.projectMember.findMany({ where: { userId } });
  const beforeByProject = new Map(before.map((m) => [m.projectId, m]));
  const afterByProject = new Map(access.map((entry) => [entry.projectId, entry]));

  const toRemove = before.filter((m) => !afterByProject.has(m.projectId));
  const toAdd = access.filter((entry) => !beforeByProject.has(entry.projectId));
  const toUpdate = access.filter((entry) => {
    const existing = beforeByProject.get(entry.projectId);
    return existing && existing.role !== entry.role;
  });

  await prisma.$transaction(async (tx) => {
    if (toRemove.length > 0) {
      await tx.projectMember.deleteMany({
        where: { userId, projectId: { in: toRemove.map((m) => m.projectId) } },
      });
    }
    for (const entry of toUpdate) {
      await tx.projectMember.update({
        where: { projectId_userId: { projectId: entry.projectId, userId } },
        data: { role: entry.role },
      });
    }
    if (toAdd.length > 0) {
      await tx.projectMember.createMany({
        data: toAdd.map((entry) => ({ userId, projectId: entry.projectId, role: entry.role })),
      });
    }
  });

  for (const m of toRemove) {
    await writeAuditLog({
      entityType: "ProjectMember",
      entityId: m.id,
      action: "delete",
      actorId,
      projectId: m.projectId,
      oldValue: { userId, role: m.role },
    });
  }
  for (const entry of toUpdate) {
    const previous = beforeByProject.get(entry.projectId)!;
    await writeAuditLog({
      entityType: "ProjectMember",
      entityId: previous.id,
      action: "update",
      actorId,
      projectId: entry.projectId,
      oldValue: { role: previous.role },
      newValue: { role: entry.role },
    });
  }
  for (const entry of toAdd) {
    await writeAuditLog({
      entityType: "ProjectMember",
      entityId: `${userId}:${entry.projectId}`,
      action: "create",
      actorId,
      projectId: entry.projectId,
      newValue: { userId, role: entry.role },
    });
  }

  if (toAdd.length > 0) {
    const addedUser = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { name: true },
    });
    for (const entry of toAdd) {
      await notifyProject({
        projectId: entry.projectId,
        type: "MEMBER_ADDED",
        title: "New member added",
        body: `${addedUser.name} was added as ${roleLabel(entry.role)}.`,
        link: "/members",
        actorId,
        excludeUserId: actorId,
      });
    }
  }
}

export type NewUserInput = {
  email: string;
  name: string;
  password: string;
};

export type ProjectAccess = { projectId: string; role: ProjectRole };

function validateNewUserInput(input: Partial<NewUserInput>) {
  if (!input.email || !input.name || !input.password) {
    throw new ValidationError("email, name, and password are required");
  }
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
}

function validateAccess(access: ProjectAccess[]) {
  if (access.length === 0) {
    throw new ValidationError("Choose at least one project");
  }
  const projectIds = access.map((entry) => entry.projectId);
  if (new Set(projectIds).size !== projectIds.length) {
    throw new ValidationError("Each project can only be listed once");
  }
}

export class ProjectNotFoundError extends ValidationError {
  constructor() {
    super("Project not found");
  }
}

/**
 * Creates a brand-new account and, in the same transaction, every
 * membership in `access` — the account starts with no membership beyond
 * those, so every existing membership-scoped query (the Projects list,
 * `requireProjectRole`) already confines it to exactly those Projects
 * without any extra access-control code.
 */
export async function createUserWithAccess(
  access: ProjectAccess[],
  input: NewUserInput,
  actorId: string,
) {
  validateNewUserInput(input);
  validateAccess(access);

  const projects = await prisma.project.findMany({
    where: { id: { in: access.map((entry) => entry.projectId) } },
    select: { id: true },
  });
  if (projects.length !== access.length) {
    throw new ProjectNotFoundError();
  }

  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new DuplicateEmailError();
  }

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: { email: input.email, name: input.name, passwordHash },
    });
    await tx.projectMember.createMany({
      data: access.map((entry) => ({ userId: created.id, projectId: entry.projectId, role: entry.role })),
    });
    return created;
  });

  for (const entry of access) {
    await writeAuditLog({
      entityType: "ProjectMember",
      entityId: `${user.id}:${entry.projectId}`,
      action: "create",
      actorId,
      projectId: entry.projectId,
      newValue: { userId: user.id, email: input.email, name: input.name, role: entry.role },
    });
  }

  for (const entry of access) {
    await notifyProject({
      projectId: entry.projectId,
      type: "MEMBER_ADDED",
      title: "New member added",
      body: `${input.name} was added as ${roleLabel(entry.role)}.`,
      link: "/members",
      actorId,
      excludeUserId: actorId,
    });
  }

  return { userId: user.id, name: user.name, email: user.email, access };
}

/**
 * Removes the account entirely — every level down from here soft-deletes,
 * but a User has no `deletedAt` and nothing reads a "deleted" account, so
 * this is a hard delete. Refused if it would leave no Admin anywhere (same
 * guard as `updateUserProjectAccess`), and refused if the account owns or
 * created real content elsewhere (a Project, a Test Case, an upload —
 * anything a mandatory foreign key still points at, caught generically via
 * the FK-violation Postgres raises rather than enumerating every relation by
 * hand). History-only references don't block it: `AuditLog.actorId` and
 * `Notification.actorId`/`recipientId` are nullable/cascading specifically
 * so a record of what happened outlives the account that did it — the
 * schema comments on those fields explain why.
 */
export async function deleteUser(userId: string, actorId: string) {
  if (userId === actorId) {
    throw new CannotDeleteSelfError();
  }

  const memberships = await prisma.projectMember.findMany({ where: { userId } });

  if (memberships.some((m) => m.role === "ADMIN")) {
    const otherAdmins = await prisma.projectMember.count({
      where: { role: "ADMIN", userId: { not: userId } },
    });
    if (otherAdmins === 0) {
      throw new LastAdminError();
    }
  }

  try {
    await prisma.$transaction([
      prisma.projectMember.deleteMany({ where: { userId } }),
      prisma.user.delete({ where: { id: userId } }),
    ]);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      throw new UserInUseError();
    }
    throw error;
  }

  for (const m of memberships) {
    await writeAuditLog({
      entityType: "ProjectMember",
      entityId: m.id,
      action: "delete",
      actorId,
      projectId: m.projectId,
      oldValue: { userId, role: m.role },
    });
  }
}
