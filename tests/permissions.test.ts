import { describe, expect, it } from "vitest";
import {
  ADMIN_ROLES,
  ALL_MEMBER_ROLES,
  EDITOR_ROLES,
  NON_DEV_ROLES,
  WORK_STATE_ROLES,
} from "@/lib/rbac";
import {
  CAPABILITIES,
  CAPABILITY_GROUPS,
  ROLES_BY_REACH,
  countFor,
  holds,
} from "@/lib/permissions";

/**
 * The catalogue behind the Roles & Permissions page.
 *
 * Its whole job is to describe the rules the app enforces, so the danger is
 * not that it breaks — it is that it quietly stops being true. A permissions
 * screen that describes a system which no longer exists is worse than no
 * screen at all: somebody reads it and believes it.
 */
describe("the permission catalogue", () => {
  const GROUPS = [
    ALL_MEMBER_ROLES,
    EDITOR_ROLES,
    NON_DEV_ROLES,
    WORK_STATE_ROLES,
    ADMIN_ROLES,
  ];

  it("points at the arrays the code checks, rather than copying them", () => {
    /* Identity, not contents. A hand-written `["ADMIN", "QA_LEAD"]` here
       would pass a contents check on the day it was written and go on
       passing it for years after the rule moved on. Sharing the array means
       changing a rule changes what the page says in the same edit. */
    for (const capability of CAPABILITIES) {
      expect(
        GROUPS.some((group) => group === capability.roles),
        `${capability.key} has a role list of its own`,
      ).toBe(true);
    }
  });

  it("accounts for every rule the app has", () => {
    /* A new role group nobody listed here is a rule the page cannot show —
       the page would look complete and be wrong by omission. */
    for (const group of GROUPS) {
      expect(
        CAPABILITIES.some((capability) => capability.roles === group),
        "a role group in rbac.ts that no capability names",
      ).toBe(true);
    }
  });

  it("names each capability once", () => {
    const keys = CAPABILITIES.map((capability) => capability.key);
    expect(new Set(keys).size).toBe(keys.length);
    // And the groups, since a stored override will name both later.
    const groupKeys = CAPABILITY_GROUPS.map((group) => group.key);
    expect(new Set(groupKeys).size).toBe(groupKeys.length);
  });

  it("lists every role the app has, strongest first", () => {
    expect([...ROLES_BY_REACH].sort()).toEqual([...ALL_MEMBER_ROLES].sort());
    /* The order is the page's ladder, and a ladder that is not sorted by
       reach reads as an arbitrary list. */
    const counts = ROLES_BY_REACH.map((role) => countFor(role));
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  it("agrees with the rules on the cases the app was built around", () => {
    /* Spot checks rather than a restatement of the catalogue: these are the
       four facts the role design turns on, and each one has a page behind
       it that would be wrong if this drifted. */
    const by = (key: string) => CAPABILITIES.find((c) => c.key === key)!;

    // A DEV may move a repair along — the one write it has.
    expect(holds(by("handoff.state"), "DEV")).toBe(true);
    // And nothing else: not authoring, not running a round.
    expect(holds(by("authoring.edit"), "DEV")).toBe(false);
    expect(holds(by("runs.manage"), "DEV")).toBe(false);
    // A VIEWER reads everything inside a Project and changes nothing.
    expect(holds(by("reading.overview"), "VIEWER")).toBe(true);
    expect(holds(by("notes.write"), "VIEWER")).toBe(false);
    // The Audit Trail is not a DEV's business, but a VIEWER's it is.
    expect(holds(by("project.audit"), "DEV")).toBe(false);
    expect(holds(by("project.audit"), "VIEWER")).toBe(true);
    // Only an ADMIN reaches past a single Project.
    expect(by("install.users").roles).toEqual(["ADMIN"]);
  });
});
