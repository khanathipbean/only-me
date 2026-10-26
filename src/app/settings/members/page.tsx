import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { requireAdminAnywhereOrNotFound } from "@/lib/rbac";
import { listAllProjectsForPicker } from "@/lib/projects";
import {
  DuplicateEmailError,
  ValidationError,
  createUserWithAccess,
  deleteUser,
  listMembersGroupedByUser,
  updateUserProjectAccess,
} from "@/lib/members";
import { Breadcrumb } from "@/components/Breadcrumb";
import { RoleGuideTooltip } from "@/components/RoleGuideTooltip";
import { membersBreadcrumb } from "@/lib/breadcrumb";
import { withToast } from "@/lib/toast";
import { PageHeader } from "@/components/ui/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { ResultCount } from "@/components/ui/ResultCount";
import { ViewTabs } from "@/components/ui/ViewTabs";
import { ConfirmForm } from "@/components/ConfirmForm";

import { SubmitButton } from "@/components/SubmitButton";
import { DialogCloseButton } from "@/components/ui/DialogCloseButton";
import { Select } from "@/components/ui/Select";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { RequiredMark } from "@/components/forms/RequiredMark";
import { Badge, type Tone } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { ClockIcon, EditIcon, TrashIcon, UnlockIcon, UsersIcon } from "@/components/icons";
import {
  MIN_PASSWORD_LENGTH,
  ProfileValidationError,
  setPasswordForUser,
  unlockUserAccount,
} from "@/lib/users";
import { ASSIGNABLE_PROJECT_ROLE_OPTIONS, PROJECT_ROLE_OPTIONS } from "@/lib/enums";
import {
  checkboxClass,
  inputClass,
  labelClass,
  mutedTextClass,
  pageClass,
  tableClass,
  tableWrapClass,
  tdClass,
  thClass,
  trHoverClass,
} from "@/lib/ui";
import type { ProjectRole } from "@/generated/prisma/client";
import { invalidateRouteCache } from "@/lib/revalidate";
import { errorHref } from "@/lib/hrefs";
import { readLockStates } from "@/lib/login-throttle";
import { listUserAuditLog } from "@/lib/audit-log";
import { Pagination } from "@/components/ui/Pagination";
import { formatTimestamp } from "@/lib/dates";

export const metadata = { title: "Members" };

// Color identifies the Project, not the role on it — otherwise the same
// Project's tag shifts color from row to row as the role differs, reading
// as a different project each time instead of the same one throughout.
/** The stored action strings, in the words a reader would use. */
const ACCOUNT_ACTION_LABELS: Record<string, string> = {
  "set-password": "Password set by an administrator",
  unlock: "Account unlocked",
  delete: "Account deleted",
};

const PROJECT_TONE_PALETTE: Tone[] = ["blue", "purple", "indigo", "cyan", "green", "amber", "gray", "red"];

type PickerProject = { id: string; code: string; name: string };

function projectToneMap(projects: PickerProject[]): Map<string, Tone> {
  return new Map(projects.map((project, index) => [project.id, PROJECT_TONE_PALETTE[index % PROJECT_TONE_PALETTE.length]]));
}

/** Every Project in the system, each a checkbox (in access or not) plus a
 * role Select — shared by the create and edit forms so a project can grant
 * more than one at once instead of forcing a pick-one-project field. */
function ProjectAccessChecklist({
  projects,
  current,
}: {
  projects: PickerProject[];
  current: { projectId: string; role: ProjectRole }[];
}) {
  return (
    <div className="flex flex-col gap-2">
      {projects.map((project) => {
        const existing = current.find((m) => m.projectId === project.id);
        // QA_LEAD/VIEWER are hidden from new picks, but a row already holding
        // one keeps the full list — otherwise the Select would silently show
        // (and, on an untouched save, submit) whatever sorts first instead of
        // the role this account actually has.
        const roleOptions = existing && !ASSIGNABLE_PROJECT_ROLE_OPTIONS.some((o) => o.value === existing.role)
          ? PROJECT_ROLE_OPTIONS
          : ASSIGNABLE_PROJECT_ROLE_OPTIONS;
        return (
          <div
            key={project.id}
            className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3"
          >
            <label className="flex flex-1 items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                name={`access-${project.id}`}
                defaultChecked={!!existing}
                className={checkboxClass}
              />
              {project.code} — {project.name}
            </label>
            <Select
              name={`role-${project.id}`}
              defaultValue={existing?.role ?? "TESTER"}
              options={roleOptions}
              ariaLabel={`Role on ${project.name}`}
              className="w-40"
            />
          </div>
        );
      })}
    </div>
  );
}

/** Reads the same `access-<id>`/`role-<id>` fields `ProjectAccessChecklist` renders. */
function readAccessFromForm(formData: FormData, projects: PickerProject[]) {
  return projects
    .filter((project) => formData.get(`access-${project.id}`) === "on")
    .map((project) => ({
      projectId: project.id,
      role: formData.get(`role-${project.id}`) as ProjectRole,
    }));
}

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    userId?: string;
    tab?: string;
    page?: string;
    pageSize?: string;
  }>;
}) {
  const { error, userId: erroredUserId, tab, page, pageSize } = await searchParams;
  /* A tab rather than a page of its own: this is the same audience doing the
   * same job — the only people who can set somebody's password are the only
   * people who need to see that it happened. */
  const onActivity = tab === "activity";
  const session = await auth();

  // Not scoped to one Project on purpose: an ADMIN elsewhere has to be able
  // to add someone to a brand-new Project, whose creator only starts as
  // QA_LEAD — see `requireAdminAnywhereOrNotFound`.
  await requireAdminAnywhereOrNotFound(session!.user.id);

  const [members, projects] = await Promise.all([
    listMembersGroupedByUser(),
    listAllProjectsForPicker(),
  ]);
  const projectTone = projectToneMap(projects);

  /* Only the tab being shown is fetched. The activity list is unbounded and
   * only grows, so loading it to render the other tab would cost every reader
   * of the Members page a query nobody asked for. */
  const activity = onActivity
    ? await listUserAuditLog({
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
      })
    : null;
  /* Who cannot get in right now. This page is where somebody looks the moment
   * a colleague says they are locked out, so the answer is on it rather than
   * one modal deeper. */
  const lockStates = await readLockStates(members.map((member) => member.email));

  async function create(formData: FormData) {
    "use server";
    invalidateRouteCache();
    const session = await auth();
    await requireAdminAnywhereOrNotFound(session!.user.id);

    const access = readAccessFromForm(formData, projects);

    try {
      await createUserWithAccess(
        access,
        {
          email: formData.get("email") as string,
          name: formData.get("name") as string,
          password: formData.get("password") as string,
        },
        session!.user.id,
      );
    } catch (err) {
      if (err instanceof ValidationError || err instanceof DuplicateEmailError) {
        redirect(errorHref("/settings/members", "", err.message));
      }
      throw err;
    }

    redirect(withToast("/settings/members", "User added"));
  }

  function updateAccessAction(targetUserId: string) {
    return async function updateAccess(formData: FormData) {
      "use server";
      invalidateRouteCache();
      const session = await auth();
      await requireAdminAnywhereOrNotFound(session!.user.id);

      const access = readAccessFromForm(formData, projects);

      try {
        await updateUserProjectAccess(targetUserId, access, session!.user.id);
      } catch (err) {
        if (err instanceof ValidationError) {
          redirect(errorHref("/settings/members", "", err.message, { userId: targetUserId }));
        }
        throw err;
      }

      redirect("/settings/members");
    };
  }

  /* The only way a forgotten password gets replaced. The page that used to do
   * it sat outside authentication and asked for nothing but an email address,
   * so it is gone; this is the same hand that creates the account in the first
   * place. */
  function setPasswordAction(targetUserId: string) {
    return async function setPassword(formData: FormData) {
      "use server";
      invalidateRouteCache();
      const session = await auth();
      await requireAdminAnywhereOrNotFound(session!.user.id);

      try {
        await setPasswordForUser(targetUserId, formData.get("password") as string, session!.user.id);
      } catch (err) {
        if (err instanceof ProfileValidationError) {
          redirect(errorHref("/settings/members", "", err.message, { userId: targetUserId }));
        }
        throw err;
      }

      redirect(withToast("/settings/members", "Password set — tell them to change it once they are in"));
    };
  }

  /* Takes the user id now, not the address. The limit still counts addresses
   * — including ones no account owns — but an audit entry has to name an
   * account, and `unlockUserAccount` looks the address up from the id so the
   * entry and the clearing cannot disagree.
   *
   * A plain string crosses into a server action safely; a function would not,
   * and trying once cost this project a page that failed on every request
   * while the build, the types and the tests all stayed green. */
  function unlockAction(targetUserId: string) {
    return async function unlock() {
      "use server";
      invalidateRouteCache();
      const session = await auth();
      await requireAdminAnywhereOrNotFound(session!.user.id);

      await unlockUserAccount(targetUserId, session!.user.id);

      redirect(withToast("/settings/members", "Unlocked — they can sign in again now"));
    };
  }

  function deleteMemberAction(targetUserId: string) {
    return async function deleteMember() {
      "use server";
      invalidateRouteCache();
      const session = await auth();
      await requireAdminAnywhereOrNotFound(session!.user.id);

      try {
        await deleteUser(targetUserId, session!.user.id);
      } catch (err) {
        if (err instanceof ValidationError) {
          redirect(errorHref("/settings/members", "", err.message, { userId: targetUserId }));
        }
        throw err;
      }

      redirect(withToast("/settings/members", "User deleted"));
    };
  }

  return (
    <main className={pageClass}>
      <Breadcrumb segments={membersBreadcrumb()} />
      <PageHeader
        title="Members"
        subtitle={
          <span className="inline-flex items-center gap-1.5">
            Accounts created here belong only to the Projects you give them access to.
            <RoleGuideTooltip />
          </span>
        }
        actions={
          <Modal triggerLabel="+ Add User" title="Add User" openOnMount={!!error && !erroredUserId}>
            {error && !erroredUserId && (
              <p role="alert" className="mb-4 rounded-md bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-900/40 dark:text-red-300">
                {error}
              </p>
            )}
            <form action={create} className="flex flex-col gap-4">
              <label className={labelClass}>
                <span>
                  Name
                  <RequiredMark />
                </span>
                <input name="name" required className={inputClass} placeholder="e.g. Jane Tester" />
              </label>
              <label className={labelClass}>
                <span>
                  Email
                  <RequiredMark />
                </span>
                <input name="email" type="email" required className={inputClass} placeholder="e.g. jane@example.com" />
              </label>
              <label className={labelClass}>
                <span>
                  Password
                  <RequiredMark />
                </span>
                <PasswordInput
                  name="password"
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  autoComplete="new-password"
                  placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                />
              </label>
              <div className={labelClass}>
                <span>
                  Projects
                  <RequiredMark />
                </span>
                <ProjectAccessChecklist projects={projects} current={[]} />
              </div>
              <div className="mt-2 flex justify-end gap-2">
                <DialogCloseButton />
                <SubmitButton>Add User</SubmitButton>
              </div>
            </form>
          </Modal>
        }
      />

      {/* Plain links, not buttons: each tab is an address, so it can be
          bookmarked, opened in another window and gone Back out of. */}
      {/* The count sits on this row rather than on one of its own: it belongs
          to whichever tab is open, and a line of its own below the tabs read
          as a third thing.
          No rule under the row — the active tab's own underline already says
          which one is open, and a second line beneath it only boxed the pair
          in. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ViewTabs
          label="Members view"
          tabs={[
            { label: "People", href: "/settings/members", active: !onActivity, icon: UsersIcon },
            {
              label: "Account activity",
              href: "/settings/members?tab=activity",
              active: onActivity,
              icon: ClockIcon,
            },
          ]}
        />

        {/* No padding of its own: the row centres both, and the tabs carry
            the only vertical space either of them needs. */}
        <ResultCount total={onActivity ? activity!.total : members.length} />
      </div>

      {onActivity ? (
        <>
          <p className={mutedTextClass}>
            What has been done to accounts themselves — a password set by an
            administrator, an account unlocked, an account deleted. Everything that happens
            inside a Project is on that Project&apos;s own Audit Trail.
          </p>

          {activity!.entries.length === 0 ? (
            <p className={mutedTextClass}>Nothing has happened to an account yet.</p>
          ) : (
            <div className={tableWrapClass}>
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th className={thClass}>When</th>
                    <th className={thClass}>Who did it</th>
                    <th className={thClass}>What</th>
                    <th className={thClass}>To whom</th>
                  </tr>
                </thead>
                <tbody>
                  {activity!.entries.map((entry) => (
                    <tr key={entry.id} className={trHoverClass}>
                      <td className={`${tdClass} whitespace-nowrap text-muted`}>
                        <time dateTime={entry.occurredAt.toISOString()}>
                          {formatTimestamp(entry.occurredAt)}
                        </time>
                      </td>
                      {/* An actor can be gone: `actorId` is nulled rather than
                          blocking the deletion of an account, because what
                          happened outlives who did it. */}
                      <td className={`${tdClass} ${entry.actor ? "" : "text-muted italic"}`}>
                        {entry.actor?.name ?? "Deleted user"}
                      </td>
                      <td className={tdClass}>{ACCOUNT_ACTION_LABELS[entry.action] ?? entry.action}</td>
                      {/* And so can the subject — deleting an account is one of
                          the three things listed here. */}
                      <td className={`${tdClass} ${entry.subject ? "" : "text-muted italic"}`}>
                        {entry.subject?.name ?? "Deleted account"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Pagination
            page={activity!.page}
            totalPages={activity!.totalPages}
            total={activity!.total}
            pageSize={activity!.pageSize}
          />
        </>
      ) : (
        <>
      {members.length === 0 ? (
        <p className={mutedTextClass}>No members yet.</p>
      ) : (
        <div className={tableWrapClass}>
          <table className={tableClass}>
            <colgroup>
              <col className="w-[20%]" />
              <col className="w-[25%]" />
              <col className="w-[45%]" />
              <col className="w-[10%]" />
            </colgroup>
            <thead>
              <tr>
                <th className={thClass}>Name</th>
                <th className={thClass}>Email</th>
                <th className={thClass}>Projects</th>
                <th className={thClass} />
              </tr>
            </thead>
            <tbody>
              {members.map((member) => {
                const lock = lockStates.get(member.email);
                return (
                <tr key={member.userId} className={trHoverClass}>
                  <td className={`${tdClass} font-medium text-foreground`}>{member.name}</td>
                  <td className={`${tdClass} text-muted`}>
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      {member.email}
                      {/* Only while it is true, and it carries the number of
                          minutes: "Locked" on its own leaves the reader
                          wondering whether to wait or to do something. */}
                      {lock?.locked && (
                        <Badge tone="red">Locked · {lock.minutesLeft} min</Badge>
                      )}
                    </span>
                  </td>
                  <td className={tdClass}>
                    <div className="flex flex-wrap gap-1.5">
                      {/* The Project's name, not its code. A reader looking
                          down this column is asking which Projects somebody
                          is in, and "prom-001" is the answer to a different
                          question — the code is how the system tells two
                          apart, which is the one thing a name cannot be
                          trusted to do, so it stays on hover. */}
                      {member.memberships.map((m) => (
                        <span key={m.projectId} title={`${m.code} · ${m.name}`}>
                          <Badge tone={projectTone.get(m.projectId) ?? "gray"}>
                            {m.name} · {m.role}
                          </Badge>
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className={tdClass}>
                    <span className="inline-flex items-center gap-1">
                    {/* Beside the Edit button rather than inside it: the whole
                        point is getting somebody back in quickly, and three
                        clicks for a one-line fix is two too many. No
                        confirmation either — letting a colleague in early is
                        undone by the next five wrong passwords. */}
                    {lock?.locked && (
                      <form action={unlockAction(member.userId)}>
                        <IconButton
                          type="submit"
                          aria-label={`Unlock ${member.name}`}
                          title={`Unlock ${member.name} — ${lock.minutesLeft} minutes left otherwise`}
                        >
                          <UnlockIcon />
                        </IconButton>
                      </form>
                    )}
                    <Modal
                      triggerLabel="Edit access"
                      triggerVariant="ghost"
                      triggerIcon={<EditIcon />}
                      title={`Edit access — ${member.name}`}
                      openOnMount={!!error && erroredUserId === member.userId}
                    >
                      {error && erroredUserId === member.userId && (
                        <p role="alert" className="mb-4 rounded-md bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-900/40 dark:text-red-300">
                          {error}
                        </p>
                      )}
                      <form
                        id={`edit-access-${member.userId}`}
                        action={updateAccessAction(member.userId)}
                        className="flex flex-col gap-4"
                      >
                        <p className={mutedTextClass}>
                          Choose every Project this account should have access to, and their role
                          on each. Unchecking a Project removes their membership there.
                        </p>
                        <ProjectAccessChecklist projects={projects} current={member.memberships} />
                      </form>
                      <form
                        action={setPasswordAction(member.userId)}
                        className="mt-6 flex flex-col gap-3 border-t border-border pt-5"
                      >
                        <p className={mutedTextClass}>
                          Set a new password for this account. There is no self-serve reset —
                          hand it over yourself, and ask them to change it from their profile
                          once they are signed in.
                        </p>
                        <div className="flex flex-wrap items-end gap-2">
                          <label className={`${labelClass} flex-1`}>
                            New password
                            <PasswordInput
                              name="password"
                              required
                              minLength={MIN_PASSWORD_LENGTH}
                              autoComplete="new-password"
                              placeholder="At least 8 characters"
                            />
                          </label>
                          <SubmitButton variant="secondary" pendingLabel="Setting…">
                            Set password
                          </SubmitButton>
                        </div>
                      </form>

                      <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-5">
                        <ConfirmForm
                          action={deleteMemberAction(member.userId)}
                          confirmMessage={`Delete ${member.name}? This removes the account and every Project membership it has. This cannot be undone.`}
                          variant="danger"
                        >
                          <IconButton
                            type="submit"
                            variant="danger"
                            aria-label={`Delete ${member.name}`}
                            title="Delete user"
                          >
                            <TrashIcon />
                          </IconButton>
                        </ConfirmForm>
                        <div className="flex items-center gap-2">
                          <DialogCloseButton />
                          <Button type="submit" form={`edit-access-${member.userId}`}>
                            Save
                          </Button>
                        </div>
                      </div>
                    </Modal>
                    </span>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
        </>
      )}
    </main>
  );
}
