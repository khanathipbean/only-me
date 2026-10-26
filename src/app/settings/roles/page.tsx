import type { Metadata } from "next";
import Link from "next/link";
import type { ProjectRole } from "@/generated/prisma/client";
import { auth } from "@/auth";
import { requireAdminAnywhereOrNotFound } from "@/lib/rbac";
import { Breadcrumb } from "@/components/Breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";
import { rolesBreadcrumb } from "@/lib/breadcrumb";
import { PROJECT_ROLE_OPTIONS } from "@/lib/enums";
import { pageClass } from "@/lib/ui";
import {
  CAPABILITIES,
  CAPABILITY_GROUPS,
  ROLES_BY_REACH,
  countFor,
  holds,
} from "@/lib/permissions";

export const metadata: Metadata = { title: "Roles & Permissions" };

function roleLabel(role: ProjectRole) {
  return PROJECT_ROLE_OPTIONS.find((option) => option.value === role)?.label ?? role;
}

/**
 * What each role can reach, read off the rules the app enforces.
 *
 * One role at a time rather than all five in one grid, which the same
 * information would fit into. The grid answers "who can do this"; this
 * answers "what can this role do", which is the question somebody has in
 * mind when they are deciding what to make a new colleague — and it is the
 * shape the boxes will need when they become editable.
 *
 * The boxes are real checkboxes, disabled. A row of ticks and dashes would
 * read as a report; a disabled checkbox says "this is a setting, and not one
 * you can change here", which is exactly true today.
 */
export default async function RolesPage({ searchParams }: PageProps<"/settings/roles">) {
  const session = await auth();
  /* The menu hides this from everybody else, and that is not the guard. Same
   * check as the rest of Settings. */
  await requireAdminAnywhereOrNotFound(session!.user.id);

  const asked = (await searchParams).role;
  const selected: ProjectRole =
    typeof asked === "string" && (ROLES_BY_REACH as string[]).includes(asked)
      ? (asked as ProjectRole)
      : ROLES_BY_REACH[0];

  return (
    <main className={pageClass}>
      <Breadcrumb segments={rolesBreadcrumb()} />
      <PageHeader
        title="Roles & Permissions"
        subtitle="What each role can reach, in every Project. Read-only — these rules live in the code for now."
      />

      {/* The list stacks above the panel on a phone rather than squeezing
          beside it: five names is a short list, and a 236px column of them
          on a 400px screen leaves nothing for the thing they open. */}
      <div className="grid gap-5 lg:grid-cols-[236px_1fr]">
        {/* Links, not buttons: each role is an address, so it can be
            bookmarked, opened in another tab and gone Back out of. */}
        <nav aria-label="Roles" className="flex flex-col gap-0.5">
          {ROLES_BY_REACH.map((role) => {
            const isActive = role === selected;
            return (
              <Link
                key={role}
                href={`/settings/roles?role=${role}`}
                aria-current={isActive ? "page" : undefined}
                className={`flex items-baseline justify-between gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "bg-brand/10 font-semibold text-brand"
                    : "text-muted hover:text-foreground"
                }`}
              >
                <span>{roleLabel(role)}</span>
                <span className="text-xs tabular-nums">{countFor(role)}</span>
              </Link>
            );
          })}
        </nav>

        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-lg font-semibold text-foreground">{roleLabel(selected)}</h2>
            <p className="text-sm text-muted">
              {countFor(selected)} of {CAPABILITIES.length} capabilities
            </p>
          </div>

          <div className="flex flex-col gap-3">
            {CAPABILITY_GROUPS.map((group) => {
              const held = group.capabilities.filter((capability) =>
                holds(capability, selected),
              ).length;
              return (
                <section
                  key={group.key}
                  aria-label={group.label}
                  className="rounded-lg border border-border bg-surface"
                >
                  <header className="flex flex-wrap items-baseline gap-2 border-b border-border px-4 py-3">
                    <h3 className="font-semibold text-foreground">{group.label}</h3>
                    <span className="text-xs text-muted tabular-nums">
                      {held}/{group.capabilities.length}
                    </span>
                  </header>
                  {/* Three across on a desk, two on a tablet, one on a phone —
                      the labels are sentences, and four columns cut them. */}
                  <div className="grid gap-x-6 gap-y-1 px-4 py-3 sm:grid-cols-2 xl:grid-cols-3">
                    {group.capabilities.map((capability) => {
                      const on = holds(capability, selected);
                      return (
                        <label
                          key={capability.key}
                          className="flex items-start gap-2.5 py-1.5 text-sm"
                        >
                          {/* Disabled rather than absent: the page is about
                              settings, and leaving the control out would make
                              an unheld capability look like one that does not
                              exist. */}
                          <input
                            type="checkbox"
                            checked={on}
                            disabled
                            readOnly
                            className="mt-0.5 size-4 shrink-0 accent-brand"
                          />
                          <span className={on ? "text-foreground" : "text-muted"}>
                            {capability.label}
                            <span className="block text-xs text-muted">{capability.detail}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </div>
    </main>
  );
}
