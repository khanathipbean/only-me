import type { ProjectRole } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import {
  CAPABILITIES,
  defaultRolesFor,
  type CapabilityKey,
} from "@/lib/permissions";

export class FixedCapabilityError extends Error {
  constructor(key: string) {
    super(`"${key}" cannot be changed — it is the way back into Settings`);
    this.name = "FixedCapabilityError";
  }
}

/**
 * Records what one role may do, as a set of ticked capabilities.
 *
 * Stores only what differs from the code. A capability set back to the way
 * the app ships it has its row deleted rather than written as "the same",
 * so the table stays a list of decisions somebody made — and emptying it is
 * how every change here is undone at once.
 *
 * Two capabilities are refused outright: Settings and the Users page inside
 * it are the only way back in, and a screen that can take away its own way
 * back is a screen that locks the install. The page draws them as controls
 * nobody can touch, and this is the half that matters — hiding a control has
 * never been the guard in this app.
 */
export async function setRolePermissions(
  role: ProjectRole,
  ticked: string[],
  actorId: string,
) {
  const wanted = new Set(ticked);

  for (const capability of CAPABILITIES) {
    const key = capability.key as CapabilityKey;
    const byDefault = defaultRolesFor(key).includes(role);
    if (capability.fixed === true && wanted.has(key) !== byDefault) {
      throw new FixedCapabilityError(key);
    }
  }

  const before = await prisma.rolePermission.findMany({
    where: { role },
    select: { capability: true, allowed: true },
  });
  const beforeByKey = new Map(before.map((row) => [row.capability, row.allowed]));

  const changed: { capability: string; from: boolean; to: boolean }[] = [];
  const writes = [];

  for (const capability of CAPABILITIES) {
    if (capability.fixed === true) {
      continue;
    }
    const key = capability.key as CapabilityKey;
    const byDefault = defaultRolesFor(key).includes(role);
    const want = wanted.has(key);
    const now = beforeByKey.get(key) ?? byDefault;
    if (want !== now) {
      changed.push({ capability: key, from: now, to: want });
    }
    if (want === byDefault) {
      /* Back to the rule in the code, so there is nothing to remember. */
      if (beforeByKey.has(key)) {
        writes.push(
          prisma.rolePermission.delete({ where: { role_capability: { role, capability: key } } }),
        );
      }
      continue;
    }
    writes.push(
      prisma.rolePermission.upsert({
        where: { role_capability: { role, capability: key } },
        update: { allowed: want, updatedById: actorId },
        create: { role, capability: key, allowed: want, updatedById: actorId },
      }),
    );
  }

  if (writes.length > 0) {
    await prisma.$transaction(writes);
  }

  /* Only when something moved. Saving a page nobody changed is not an event,
   * and a log full of those is a log nobody reads. */
  if (changed.length > 0) {
    await writeAuditLog({
      entityType: "RolePermission",
      entityId: role,
      action: "update",
      actorId,
      oldValue: { changed: changed.map((c) => ({ capability: c.capability, allowed: c.from })) },
      newValue: { changed: changed.map((c) => ({ capability: c.capability, allowed: c.to })) },
    });
  }

  return changed.length;
}
