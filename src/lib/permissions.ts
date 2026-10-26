import { cache } from "react";
import type { ProjectRole } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ASSIGNABLE_PROJECT_ROLE_OPTIONS } from "@/lib/enums";
import {
  ADMIN_ROLES,
  ALL_MEMBER_ROLES,
  EDITOR_ROLES,
  NON_DEV_ROLES,
  WORK_STATE_ROLES,
  requireProjectRoleOrNotFound,
} from "@/lib/rbac";

/**
 * What the app can be asked to do, and who may ask.
 *
 * A catalogue, not a second set of rules. Every entry points at the same
 * array the code checks — `EDITOR_ROLES` and the rest — so a page built from
 * this says what the app actually enforces, and changing a rule changes what
 * the page says in the same edit. A hand-written list of role names here
 * would be a second source of truth, which is how a permissions screen comes
 * to describe a system that no longer exists.
 *
 * It is deliberately coarser than the 241 checks it summarises. Five of the
 * module pages share one rule between them; listing each page separately
 * would be a longer page saying the same thing five times. Where two pages
 * are gated differently, they are separate entries.
 */
export type Capability = {
  /** Stable, so a stored override can name one later without the label. */
  key: string;
  label: string;
  /** What holding it actually lets somebody do, in the app's own words. */
  detail: string;
  /** The array the code checks. Identity matters — see the note above. */
  roles: ProjectRole[];
  /**
   * Not editable, and refused by the server if somebody asks anyway.
   *
   * Only the two that are the way back in: Settings, and the Users page
   * inside it. Everything else can be switched off and switched on again
   * from there, so these two being fixed is what makes every other
   * mistake recoverable — and keeps this page from being the thing that
   * locks the install.
   */
  fixed?: boolean;
};

export type CapabilityGroup = {
  key: string;
  label: string;
  capabilities: Capability[];
};

export const CAPABILITY_GROUPS = [
  {
    key: "overview",
    label: "Overview",
    capabilities: [
      {
        key: "reading.overview",
        label: "View a Project's Overview",
        detail: "access menu & view data",
        roles: NON_DEV_ROLES,
      },
    ],
  },
  {
    key: "my-work",
    label: "My Work",
    capabilities: [
      {
        key: "handoff.view",
        label: "See My Work",
        detail: "access menu & view data",
        roles: ALL_MEMBER_ROLES,
      },
      {
        key: "handoff.assign",
        label: "Hand a failed case to somebody",
        detail: "assign it, which sets the deadline",
        roles: EDITOR_ROLES,
      },
      {
        key: "handoff.state",
        label: "Move a repair along",
        detail: "To fix, In progress, Ready to retest",
        roles: WORK_STATE_ROLES,
      },
    ],
  },
  {
    key: "dashboard",
    label: "Dashboard",
    capabilities: [
      {
        key: "reading.dashboard",
        label: "View the Dashboard",
        detail: "access menu & view data",
        roles: ALL_MEMBER_ROLES,
      },
    ],
  },
  {
    key: "problem-cases",
    label: "Problem Cases",
    capabilities: [
      {
        key: "reading.problems",
        label: "View Problem Cases",
        detail: "access menu & view data",
        roles: NON_DEV_ROLES,
      },
    ],
  },
  {
    key: "modules",
    label: "Modules",
    capabilities: [
      {
        key: "authoring.view",
        label: "View Modules, Requirements, Scenarios and Test Cases",
        detail: "access menu & view data",
        roles: ALL_MEMBER_ROLES,
      },
      {
        key: "authoring.edit",
        label: "Create and edit them",
        detail: "add, rename, reorder, move, archive",
        roles: EDITOR_ROLES,
      },
    ],
  },
  {
    key: "test-runs",
    label: "Test Runs",
    capabilities: [
      {
        key: "runs.view",
        label: "View Test Runs",
        detail: "access menu & view data",
        roles: NON_DEV_ROLES,
      },
      {
        key: "runs.manage",
        label: "Run and close a round",
        detail: "record results, add cases, reopen, close",
        roles: EDITOR_ROLES,
      },
      /* Wider than viewing the round itself, and on purpose: the screenshot
       * of what went wrong is attached to the case in the round, and a DEV
       * who cannot open Test Runs still has to be able to see it. */
      {
        key: "runs.evidence",
        label: "See files attached inside a round",
        detail: "the evidence on a case, over the API",
        roles: ALL_MEMBER_ROLES,
      },
      {
        key: "runs.export",
        label: "Export a round's results",
        detail: "export data, over the API",
        roles: ALL_MEMBER_ROLES,
      },
    ],
  },
  {
    key: "notes",
    label: "Notes",
    capabilities: [
      {
        key: "notes.view",
        label: "Read Notes",
        detail: "access menu & view data",
        roles: ALL_MEMBER_ROLES,
      },
      {
        key: "notes.write",
        label: "Write and archive Notes",
        detail: "manage or setting data",
        roles: EDITOR_ROLES,
      },
    ],
  },
  {
    key: "files",
    label: "Files",
    capabilities: [
      {
        key: "files.view",
        label: "See and download Files",
        detail: "access menu & view data",
        roles: ALL_MEMBER_ROLES,
      },
      {
        key: "files.manage",
        label: "Upload and remove Files",
        detail: "manage or setting data",
        roles: EDITOR_ROLES,
      },
    ],
  },
  {
    key: "import",
    label: "Import",
    capabilities: [
      {
        key: "project.import",
        label: "Import Test Cases from a file",
        detail: "manage or setting data",
        roles: EDITOR_ROLES,
      },
    ],
  },
  {
    key: "audit-trail",
    label: "Audit Trail",
    capabilities: [
      {
        key: "project.audit",
        label: "Read the Audit Trail",
        detail: "access menu & view data",
        roles: NON_DEV_ROLES,
      },
    ],
  },
  {
    key: "project",
    label: "Project",
    capabilities: [
      {
        key: "project.read",
        label: "Read a Project's own record",
        detail: "over the API, not the Overview page",
        roles: ALL_MEMBER_ROLES,
      },
      {
        key: "project.edit",
        label: "Change a Project's settings",
        detail: "name, dates, status, archive",
        roles: EDITOR_ROLES,
      },
      {
        key: "project.export",
        label: "Export a Project",
        detail: "export data, over the API",
        roles: ALL_MEMBER_ROLES,
      },
    ],
  },
  {
    key: "settings",
    label: "Settings",
    capabilities: [
      {
        key: "install.settings",
        fixed: true,
        label: "Open Settings",
        detail: "ADMIN on any Project, not this one",
        roles: ADMIN_ROLES,
      },
      {
        key: "install.users",
        fixed: true,
        label: "Add users and set what they can reach",
        detail: "ADMIN on any Project, not this one",
        roles: ADMIN_ROLES,
      },
      /* Not read off a membership like the rest: `isAdminAnywhere` asks
       * whether the account holds ADMIN on any Project at all, because
       * neither of these belongs to one — somebody has to be able to add
       * members to a Project that does not exist yet. */
      {
        key: "install.project-create",
        label: "Create a Project",
        detail: "ADMIN on any Project, not this one",
        roles: ADMIN_ROLES,
      },
    ],
  },
] as const satisfies readonly CapabilityGroup[];

/** Every capability, flat — for counting and for looking one up by key. */
export const CAPABILITIES: readonly Capability[] = CAPABILITY_GROUPS.flatMap(
  (group): readonly Capability[] => group.capabilities,
);

/**
 * The name of a capability, as a type.
 *
 * `as const` on the catalogue is what makes this a union of the real keys
 * rather than `string`, so a guard asking for a capability that does not
 * exist — a typo, or one renamed out from under it — stops the build instead
 * of quietly refusing everybody or letting everybody through.
 */
export type CapabilityKey =
  (typeof CAPABILITY_GROUPS)[number]["capabilities"][number]["key"];

const BY_KEY = new Map<string, Capability>(
  CAPABILITIES.map((capability) => [capability.key, capability]),
);

/** The rule as the code ships it, before anybody has changed anything. */
export function defaultRolesFor(key: CapabilityKey): ProjectRole[] {
  /* Non-null because `CapabilityKey` is the catalogue's own keys — an
   * unknown one cannot be written, so this cannot be missing. */
  return BY_KEY.get(key)!.roles;
}

/**
 * Every change anybody has made to the defaults, read once per request.
 *
 * `cache` is React's per-request memo, so a page asking five guards in a row
 * reads the table once. The table is tiny — a row only where something
 * differs from the code — and reading all of it is cheaper than asking it
 * five separate questions.
 *
 * A read that fails hands back no overrides rather than throwing, which
 * leaves every guard on the rule in the code. The alternative is a database
 * hiccup locking everybody out of an app they have every right to use.
 */
const readOverrides = cache(async (): Promise<Map<string, boolean>> => {
  try {
    const rows = await prisma.rolePermission.findMany({
      select: { role: true, capability: true, allowed: true },
    });
    return new Map(
      rows.map((row) => [`${row.role}:${row.capability}`, row.allowed]),
    );
  } catch {
    return new Map();
  }
});

/**
 * Who may do this, now.
 *
 * The one place a capability turns back into roles, and the only place the
 * stored rules are read. Every guard, every hidden button and every tab goes
 * through it.
 *
 * A fixed capability ignores the table outright. Refusing to store one is
 * the first guard and this is the second: a row written before it was fixed,
 * or by anything that bypassed the server action, still cannot take away the
 * way back in.
 */
export async function rolesFor(key: CapabilityKey): Promise<ProjectRole[]> {
  const fallback = defaultRolesFor(key);
  if (BY_KEY.get(key)!.fixed === true) {
    return fallback;
  }
  const overrides = await readOverrides();
  if (overrides.size === 0) {
    return fallback;
  }
  return ALL_MEMBER_ROLES.filter(
    (role) => overrides.get(`${role}:${key}`) ?? fallback.includes(role),
  );
}

/** Whether a role holds a capability. For drawing a menu, never for a
 *  guard — see the note on `NON_DEV_ROLES`: hiding is not protecting. */
export async function can(
  role: ProjectRole | null | undefined,
  key: CapabilityKey,
): Promise<boolean> {
  if (role === null || role === undefined) {
    return false;
  }
  return (await rolesFor(key)).includes(role);
}

/** The same question for the whole catalogue, so a page drawing a menu asks
 *  once rather than once per tab. */
export async function heldBy(
  role: ProjectRole | null | undefined,
): Promise<CapabilityKey[]> {
  if (role === null || role === undefined) {
    return [];
  }
  const held: CapabilityKey[] = [];
  for (const capability of CAPABILITIES) {
    const key = capability.key as CapabilityKey;
    if ((await rolesFor(key)).includes(role)) {
      held.push(key);
    }
  }
  return held;
}

/**
 * The roles the page lists, strongest first.
 *
 * Read off the roles anybody can actually be given rather than written out
 * again: the enum still carries QA_LEAD and VIEWER so a membership made
 * before they were retired still renders, but neither is offered for a new
 * assignment — and a page of permissions for a role nobody can hold is a
 * page nobody needs. One list, so the two cannot drift.
 */
export const ROLES_BY_REACH: ProjectRole[] = ASSIGNABLE_PROJECT_ROLE_OPTIONS.map(
  (option) => option.value as ProjectRole,
);

export function holds(capability: Capability, role: ProjectRole): boolean {
  return capability.roles.includes(role);
}

export function countFor(role: ProjectRole): number {
  return CAPABILITIES.filter((capability) => holds(capability, role)).length;
}
/**
 * The guard a page uses: "may this account do X here", not "is it one of
 * these roles".
 *
 * Every page asked the second question, which meant the answer lived at 85
 * call sites and the rules behind them could only be read by grepping for an
 * array name. Asking the first puts the rule in one place — `rolesFor` — and
 * that is the place the stored rules will be read from when they move into
 * the database. Nothing changes today: the capability hands back the very
 * array the call site used to name.
 */
export async function requireCapabilityOrNotFound(
  userId: string,
  projectId: string,
  capability: CapabilityKey,
) {
  return requireProjectRoleOrNotFound(userId, projectId, await rolesFor(capability));
}
