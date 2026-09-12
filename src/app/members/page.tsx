import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { requireAdminAnywhereOrNotFound } from "@/lib/rbac";
import { listAllProjectsForPicker } from "@/lib/projects";
import {
  DuplicateEmailError,
  ValidationError,
  createUserWithAccess,
  listMembersGroupedByUser,
  updateUserProjectAccess,
} from "@/lib/members";
import { Breadcrumb } from "@/components/Breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { DialogCloseButton } from "@/components/ui/DialogCloseButton";
import { Select } from "@/components/ui/Select";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { RequiredMark } from "@/components/forms/RequiredMark";
import { Badge, type Tone } from "@/components/ui/Badge";
import { EditIcon } from "@/components/icons";
import { MIN_PASSWORD_LENGTH } from "@/lib/users";
import { PROJECT_ROLE_OPTIONS } from "@/lib/enums";
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

export const metadata = { title: "Members" };

// Color identifies the Project, not the role on it — otherwise the same
// Project's tag shifts color from row to row as the role differs, reading
// as a different project each time instead of the same one throughout.
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
              options={PROJECT_ROLE_OPTIONS}
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
  searchParams: Promise<{ error?: string; userId?: string }>;
}) {
  const { error, userId: erroredUserId } = await searchParams;
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

  async function create(formData: FormData) {
    "use server";
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
        redirect(`/members?error=${encodeURIComponent(err.message)}`);
      }
      throw err;
    }

    redirect("/members");
  }

  function updateAccessAction(targetUserId: string) {
    return async function updateAccess(formData: FormData) {
      "use server";
      const session = await auth();
      await requireAdminAnywhereOrNotFound(session!.user.id);

      const access = readAccessFromForm(formData, projects);

      try {
        await updateUserProjectAccess(targetUserId, access, session!.user.id);
      } catch (err) {
        if (err instanceof ValidationError) {
          redirect(
            `/members?userId=${targetUserId}&error=${encodeURIComponent(err.message)}`,
          );
        }
        throw err;
      }

      redirect("/members");
    };
  }

  return (
    <main className={pageClass}>
      <Breadcrumb segments={[{ label: "Members", href: "/members" }]} />
      <PageHeader
        title="Members"
        subtitle="Accounts created here belong only to the Projects you give them access to."
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
                <Button type="submit">Add User</Button>
              </div>
            </form>
          </Modal>
        }
      />

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
              {members.map((member) => (
                <tr key={member.userId} className={trHoverClass}>
                  <td className={`${tdClass} font-medium text-foreground`}>{member.name}</td>
                  <td className={`${tdClass} text-muted`}>{member.email}</td>
                  <td className={tdClass}>
                    <div className="flex flex-wrap gap-1.5">
                      {member.memberships.map((m) => (
                        <Badge key={m.projectId} tone={projectTone.get(m.projectId) ?? "gray"}>
                          {m.code} · {m.role}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className={tdClass}>
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
                      <form action={updateAccessAction(member.userId)} className="flex flex-col gap-4">
                        <p className={mutedTextClass}>
                          Choose every Project this account should have access to, and their role
                          on each. Unchecking a Project removes their membership there.
                        </p>
                        <ProjectAccessChecklist projects={projects} current={member.memberships} />
                        <div className="mt-2 flex justify-end gap-2">
                          <DialogCloseButton />
                          <Button type="submit">Save</Button>
                        </div>
                      </form>
                    </Modal>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
