import type { ProjectRole } from "@/generated/prisma/client";
import { PROJECT_ROLE_OPTIONS } from "@/lib/enums";

/**
 * The wording of the Users page's account activity, kept out of the page so
 * it can be read against examples rather than against a screenshot.
 *
 * Two kinds of entry are listed together — what was done to the account,
 * and what it was given or lost access to — and the same stored action word
 * means a different thing in each. "delete" is an account destroyed or a
 * Project access taken away, and there is no telling which without the
 * entity beside it.
 */
/** The stored action strings, in the words a reader would use. */
const ACCOUNT_ACTION_LABELS: Record<string, string> = {
  create: "Account created",
  "set-password": "Password set by an administrator",
  unlock: "Account unlocked",
  delete: "Account deleted",
};

/** The role a membership entry recorded, from whichever side applies. */
function roleIn(value: unknown): string | null {
  if (value && typeof value === "object" && "role" in value) {
    const role = (value as { role: unknown }).role;
    if (typeof role === "string") {
      return (
        PROJECT_ROLE_OPTIONS.find(
          (option) => option.value === (role as ProjectRole),
        )?.label ?? role
      );
    }
  }
  return null;
}

/**
 * What an entry says, in a sentence.
 *
 * Two kinds of thing are listed together — what was done to the account and
 * what it was given or lost access to — and "delete" means a different thing
 * in each, so the entity decides the wording before the action does. Each
 * membership line names its Project, because "role changed" without one is a
 * fact about nothing in particular.
 */
export function describeAccountEvent(entry: {
  entityType: string;
  action: string;
  oldValue: unknown;
  newValue: unknown;
  project: { name: string } | null;
}): string {
  if (entry.entityType !== "ProjectMember") {
    return ACCOUNT_ACTION_LABELS[entry.action] ?? entry.action;
  }
  /* A Project that is gone leaves the entry behind; it still happened. */
  const where = entry.project?.name ?? "a deleted Project";
  const before = roleIn(entry.oldValue);
  const after = roleIn(entry.newValue);
  if (entry.action === "create") {
    return after ? `Added to ${where} as ${after}` : `Added to ${where}`;
  }
  if (entry.action === "delete") {
    return `Removed from ${where}`;
  }
  if (entry.action === "update") {
    return before && after
      ? `Role in ${where} changed from ${before} to ${after}`
      : `Role in ${where} changed`;
  }
  return `${entry.action} in ${where}`;
}
