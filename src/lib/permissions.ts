import type { ProjectRole } from "@/generated/prisma/client";
import {
  ADMIN_ROLES,
  ALL_MEMBER_ROLES,
  EDITOR_ROLES,
  NON_DEV_ROLES,
  WORK_STATE_ROLES,
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
};

export type CapabilityGroup = {
  key: string;
  label: string;
  capabilities: Capability[];
};

export const CAPABILITY_GROUPS: CapabilityGroup[] = [
  {
    key: "authoring",
    label: "Test authoring",
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
    key: "runs",
    label: "Test runs",
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
    ],
  },
  {
    key: "handoff",
    label: "Hand-off",
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
    key: "reading",
    label: "Reading the numbers",
    capabilities: [
      {
        key: "reading.overview",
        label: "View a Project's Overview",
        detail: "access menu & view data",
        roles: NON_DEV_ROLES,
      },
      {
        key: "reading.dashboard",
        label: "View the Dashboard",
        detail: "access menu & view data",
        roles: ALL_MEMBER_ROLES,
      },
      {
        key: "reading.problems",
        label: "View Problem Cases",
        detail: "access menu & view data",
        roles: NON_DEV_ROLES,
      },
    ],
  },
  {
    key: "material",
    label: "Notes and files",
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
    key: "project-admin",
    label: "Running a Project",
    capabilities: [
      {
        key: "project.edit",
        label: "Change a Project's settings",
        detail: "name, dates, status, archive",
        roles: EDITOR_ROLES,
      },
      {
        key: "project.import",
        label: "Import Test Cases from a file",
        detail: "manage or setting data",
        roles: EDITOR_ROLES,
      },
      {
        key: "project.audit",
        label: "Read the Audit Trail",
        detail: "access menu & view data",
        roles: NON_DEV_ROLES,
      },
    ],
  },
  {
    key: "install",
    label: "The whole install",
    capabilities: [
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
      {
        key: "install.settings",
        label: "Open Settings",
        detail: "ADMIN on any Project, not this one",
        roles: ADMIN_ROLES,
      },
      {
        key: "install.users",
        label: "Add users and set what they can reach",
        detail: "ADMIN on any Project, not this one",
        roles: ADMIN_ROLES,
      },
    ],
  },
];

/** Every capability, flat — for counting and for looking one up by key. */
export const CAPABILITIES: Capability[] = CAPABILITY_GROUPS.flatMap(
  (group) => group.capabilities,
);

/** The roles the page lists, in the order it lists them: most access first,
 *  so the list reads as a ladder rather than as the enum's own order. */
export const ROLES_BY_REACH: ProjectRole[] = ["ADMIN", "QA_LEAD", "TESTER", "VIEWER", "DEV"];

export function holds(capability: Capability, role: ProjectRole): boolean {
  return capability.roles.includes(role);
}

export function countFor(role: ProjectRole): number {
  return CAPABILITIES.filter((capability) => holds(capability, role)).length;
}
