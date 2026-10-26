import type { Metadata } from "next";
import Link from "next/link";
import type { ProjectRole } from "@/generated/prisma/client";
import { auth } from "@/auth";
import { requireAdminAnywhereOrNotFound } from "@/lib/rbac";
import { Breadcrumb } from "@/components/Breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";
import { rolesBreadcrumb } from "@/lib/breadcrumb";
import { PROJECT_ROLE_OPTIONS } from "@/lib/enums";
import { redirect } from "next/navigation";
import { pageClass } from "@/lib/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { withToast } from "@/lib/toast";
import { errorHref } from "@/lib/hrefs";
import { invalidateRouteCache } from "@/lib/revalidate";
import { FixedCapabilityError, setRolePermissions } from "@/lib/role-permissions";
import {
  CAPABILITIES,
  CAPABILITY_GROUPS,
  ROLES_BY_REACH,
  heldBy,
  type CapabilityKey,
} from "@/lib/permissions";

export const metadata: Metadata = { title: "Roles & Permissions" };

/** The two the server will not let anybody change — see `fixed` in the
 *  catalogue, which is where the reason is written down. */
const FIXED = new Set(
  CAPABILITIES.filter((capability) => capability.fixed === true).map((c) => c.key),
);

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
 * The boxes are real checkboxes and they save. Two of them never will:
 * Settings and the Users page inside it are the way back in, and a screen
 * that can take away its own way back is a screen that locks the install.
 * They are drawn disabled with the reason beside them, and the server
 * refuses them too — hiding a control has never been the guard here.
 */
export default async function RolesPage({ searchParams }: PageProps<"/settings/roles">) {
  const session = await auth();
  /* The menu hides this from everybody else, and that is not the guard. Same
   * check as the rest of Settings. */
  await requireAdminAnywhereOrNotFound(session!.user.id);

  const params = await searchParams;
  const asked = params.role;
  const selected: ProjectRole =
    typeof asked === "string" && (ROLES_BY_REACH as string[]).includes(asked)
      ? (asked as ProjectRole)
      : ROLES_BY_REACH[0];
  const error = typeof params.error === "string" ? params.error : null;

  /* One pass for the page: the count beside each role and the ticks in the
     panel are the same question asked six times over. */
  const heldByRole = new Map<ProjectRole, CapabilityKey[]>();
  for (const role of ROLES_BY_REACH) {
    heldByRole.set(role, await heldBy(role));
  }
  const held = new Set<string>(heldByRole.get(selected));

  async function save(formData: FormData) {
    "use server";
    const actor = await auth();
    await requireAdminAnywhereOrNotFound(actor!.user.id);
    const role = String(formData.get("role")) as ProjectRole;
    if (!(ROLES_BY_REACH as string[]).includes(role)) {
      redirect("/settings/roles");
    }
    const ticked = formData.getAll("capability").map(String);
    try {
      const moved = await setRolePermissions(role, ticked, actor!.user.id);
      invalidateRouteCache();
      redirect(
        withToast(
          `/settings/roles?role=${role}`,
          moved === 0 ? "Nothing changed" : `Saved — ${moved} change(s)`,
        ),
      );
    } catch (err) {
      if (err instanceof FixedCapabilityError) {
        redirect(errorHref("/settings/roles", "", err.message, { role }));
      }
      throw err;
    }
  }

  return (
    <main className={pageClass}>
      <Breadcrumb segments={rolesBreadcrumb()} />
      <PageHeader
        title="Roles & Permissions"
        subtitle="What each role can reach, in every Project. Changing a tick changes it everywhere."
      />

      {error && (
        <p
          role="alert"
          className="rounded-md bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-900/40 dark:text-red-300"
        >
          {error}
        </p>
      )}

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
                <span className="text-xs tabular-nums">{heldByRole.get(role)!.length}</span>
              </Link>
            );
          })}
        </nav>

        {/* Keyed on the role so React builds the boxes again when the
            selection changes. They are uncontrolled — `defaultChecked`
            is read once, when the input is created — so without this,
            clicking from Admin to Dev kept Admin's ticks on screen and
            a Save would have written them to the wrong role. */}
        <form action={save} key={selected} className="min-w-0">
          <input type="hidden" name="role" value={selected} />
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-lg font-semibold text-foreground">{roleLabel(selected)}</h2>
              <p className="text-sm text-muted">
                {held.size} of {CAPABILITIES.length} capabilities
              </p>
            </div>
            <SubmitButton pendingLabel="Saving…">Save Changes</SubmitButton>
          </div>

          <div className="flex flex-col gap-3">
            {CAPABILITY_GROUPS.map((group) => {
              const on = group.capabilities.filter((capability) =>
                held.has(capability.key),
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
                      {on}/{group.capabilities.length}
                    </span>
                  </header>
                  {/* Three across on a desk, two on a tablet, one on a phone —
                      the labels are sentences, and four columns cut them. */}
                  <div className="grid gap-x-6 gap-y-1 px-4 py-3 sm:grid-cols-2 xl:grid-cols-3">
                    {group.capabilities.map((capability) => {
                      const ticked = held.has(capability.key);
                      const fixed = FIXED.has(capability.key);
                      return (
                        <label
                          key={capability.key}
                          className="flex items-start gap-2.5 py-1.5 text-sm"
                        >
                          <input
                            type="checkbox"
                            name="capability"
                            value={capability.key}
                            defaultChecked={ticked}
                            disabled={fixed}
                            className="mt-0.5 size-4 shrink-0 accent-brand"
                          />
                          {/* A disabled checkbox sends nothing, and sending
                              nothing is how this form says "untick" — so a
                              fixed one carries its value in a hidden field
                              instead. The server refuses to change it either
                              way; this only keeps the form honest. */}
                          {fixed && ticked && (
                            <input type="hidden" name="capability" value={capability.key} />
                          )}
                          <span className={ticked ? "text-foreground" : "text-muted"}>
                            {capability.label}
                            <span className="block text-xs text-muted">
                              {fixed
                                ? "Fixed — this is the way back into Settings"
                                : capability.detail}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </form>
      </div>
    </main>
  );
}
