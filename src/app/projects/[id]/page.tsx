import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ALL_MEMBER_ROLES, EDITOR_ROLES, requireProjectRoleOrNotFound } from "@/lib/rbac";
import {
  DuplicateCodeError,
  ValidationError,
  archiveProject,
  getProjectById,
  restoreProject,
  updateProject,
} from "@/lib/projects";
import { ConfirmForm } from "@/components/ConfirmForm";
import { Breadcrumb } from "@/components/Breadcrumb";
import { projectBreadcrumb } from "@/lib/breadcrumb";
import { Card } from "@/components/ui/Card";
import { DetailField, DetailFields } from "@/components/ui/DetailFields";

import { SubmitButton } from "@/components/SubmitButton";
import { Modal } from "@/components/ui/Modal";
import { ProjectForm } from "@/components/forms/ProjectForm";
import { Badge, projectStatusTone } from "@/components/ui/Badge";
import { ClockIcon, EditIcon } from "@/components/icons";
import { Avatar } from "@/components/ui/Avatar";
import { formatTimestamp } from "@/lib/dates";
import { pageClass } from "@/lib/ui";
import { invalidateRouteCache } from "@/lib/revalidate";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProjectById(id);
  return { title: project?.name ?? "Project" };
}

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const session = await auth();

  await requireProjectRoleOrNotFound(session!.user.id, id, ALL_MEMBER_ROLES);

  const project = await getProjectById(id);
  if (!project) {
    redirect("/projects");
  }

  async function update(formData: FormData) {
    "use server";
    invalidateRouteCache();

    const session = await auth();
    await requireProjectRoleOrNotFound(session!.user.id, id, EDITOR_ROLES);

    const startDate = formData.get("startDate") as string;
    const endDate = formData.get("endDate") as string;

    try {
      await updateProject(
        id,
        {
          code: formData.get("code") as string,
          name: formData.get("name") as string,
          description: (formData.get("description") as string) || null,
          status: formData.get("status") as never,
          startDate: startDate ? new Date(startDate) : null,
          endDate: endDate ? new Date(endDate) : null,
        },
        session!.user.id,
      );
    } catch (err) {
      if (err instanceof ValidationError || err instanceof DuplicateCodeError) {
        redirect(`/projects/${id}?error=${encodeURIComponent(err.message)}`);
      }
      throw err;
    }

    redirect(`/projects/${id}`);
  }

  async function archive() {
    "use server";
    invalidateRouteCache();
    const session = await auth();
    await requireProjectRoleOrNotFound(session!.user.id, id, EDITOR_ROLES);
    await archiveProject(id, session!.user.id);
    redirect(`/projects/${id}`);
  }

  async function restore() {
    "use server";
    invalidateRouteCache();
    const session = await auth();
    await requireProjectRoleOrNotFound(session!.user.id, id, EDITOR_ROLES);
    await restoreProject(id, session!.user.id);
    redirect(`/projects/${id}`);
  }

  return (
    <main className={pageClass}>
      <Breadcrumb segments={projectBreadcrumb(project)} />

      {/* One card, not a page header plus a detached card plus a loose
          button: every part of this page describes the same Project, so it
          reads as one object with its own actions rather than three
          unrelated blocks stacked down the page. */}
      <Card className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
              {project.name}
              <span className="text-base font-normal text-muted">({project.code})</span>
              <Badge tone={projectStatusTone(project.status)}>{project.status}</Badge>
              {project.deletedAt && <Badge tone="gray">Archived</Badge>}
            </h1>
          </div>

          <Modal
            triggerLabel="Edit"
            triggerVariant="ghost"
            triggerIcon={<EditIcon />}
            title="Edit Project"
            openOnMount={!!error}
          >
            <ProjectForm
              action={update}
              submitLabel="Save"
              error={error}
              defaults={{
                code: project.code,
                name: project.name,
                description: project.description,
                status: project.status,
                startDate: project.startDate?.toISOString().slice(0, 10),
                endDate: project.endDate?.toISOString().slice(0, 10),
              }}
            />
          </Modal>
        </div>

        {/* Its own block, not a wide row in the same list: free-form prose
            shares nothing with the two one-line facts below it. Sharing a
            list looked fine for a short blurb, but a genuinely long
            description stretched the row and stranded Owner and Last updated
            at the top of a column of empty space. */}
        <div className="border-t border-border pt-5">
          <DetailFields>
            <DetailField label="Description" wide>{project.description}</DetailField>
          </DetailFields>
        </div>

        {/* A rule of its own, so the description ends somewhere: who owns the
            Project and when it last moved are facts about the record, not
            more of what it says. */}
        <div className="border-t border-border pt-5">
          <DetailFields>
            <DetailField
              label="Owner"
              /* Their actual face where they have uploaded one, their
                 monogram otherwise — the same disc the header wears, so one
                 person looks like one person across the app. */
              icon={
                <Avatar
                  name={project.owner.name ?? project.owner.email}
                  src={project.owner.avatarKey ? `/api/users/${project.owner.id}/avatar` : null}
                  size="size-9"
                />
              }
            >
              {project.owner.name}
            </DetailField>
            <DetailField
              label="Last updated"
              /* A clock, not another face: the fact here is the moment. Who
                 made the change is named in the value beside it. */
              icon={
                <span className="flex size-9 items-center justify-center rounded-full border border-border bg-black/[.06] text-muted dark:bg-white/[.10]">
                  <ClockIcon />
                </span>
              }
            >
              {project.updatedBy?.name ?? "—"} at{" "}
              {/* The exact value stays reachable — `title` on hover, and
                  `dateTime` for anything reading the page rather than
                  looking at it. */}
              <time
                dateTime={project.updatedAt.toISOString()}
                title={project.updatedAt.toISOString()}
              >
                {formatTimestamp(project.updatedAt)}
              </time>
            </DetailField>
          </DetailFields>
        </div>

        <div className="flex justify-end border-t border-border pt-4">
          {project.deletedAt ? (
            <ConfirmForm action={restore} confirmMessage="Restore this project?">
              <SubmitButton variant="secondary" pendingLabel="Restoring…">
                Restore
              </SubmitButton>
            </ConfirmForm>
          ) : (
            <ConfirmForm
              action={archive}
              confirmMessage="Archive this project? Its Modules, Requirements, Scenarios, Test Groups, and Test Cases are kept and can be restored later."
            >
              <SubmitButton variant="secondary" pendingLabel="Archiving…">
                Archive
              </SubmitButton>
            </ConfirmForm>
          )}
        </div>
      </Card>

    </main>
  );
}
