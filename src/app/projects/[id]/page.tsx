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
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ProjectForm } from "@/components/forms/ProjectForm";
import { Badge, projectStatusTone } from "@/components/ui/Badge";
import { EditIcon } from "@/components/icons";
import { pageClass } from "@/lib/ui";

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
    const session = await auth();
    await requireProjectRoleOrNotFound(session!.user.id, id, EDITOR_ROLES);
    await archiveProject(id, session!.user.id);
    redirect(`/projects/${id}`);
  }

  async function restore() {
    "use server";
    const session = await auth();
    await requireProjectRoleOrNotFound(session!.user.id, id, EDITOR_ROLES);
    await restoreProject(id, session!.user.id);
    redirect(`/projects/${id}`);
  }

  return (
    <main className={pageClass}>
      <Breadcrumb segments={projectBreadcrumb(project)} />

      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {project.name}
            <span className="text-base font-normal text-muted">({project.code})</span>
          </span>
        }
        subtitle={
          <span className="flex items-center gap-2">
            <Badge tone={projectStatusTone(project.status)}>{project.status}</Badge>
            {project.deletedAt && <Badge tone="gray">Archived</Badge>}
          </span>
        }
        actions={
          <Modal
            triggerLabel="Edit"
            triggerVariant="secondary"
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
        }
      />

      <Card className="flex flex-col gap-2 text-sm">
        <p>
          <span className="text-muted">Description:</span> {project.description ?? "—"}
        </p>
        <p>
          <span className="text-muted">Owner:</span> {project.owner.name}
        </p>
        <p>
          <span className="text-muted">Last updated by:</span> {project.updatedBy?.name ?? "—"} at{" "}
          {project.updatedAt.toISOString()}
        </p>
      </Card>

      <div>
        {project.deletedAt ? (
          <ConfirmForm action={restore} confirmMessage="Restore this project?">
            <Button type="submit" variant="secondary">
              Restore
            </Button>
          </ConfirmForm>
        ) : (
          <ConfirmForm
            action={archive}
            confirmMessage="Archive this project? Its Scenarios, Test Groups, and Test Cases are kept and can be restored later."
          >
            <Button type="submit" variant="secondary">
              Archive
            </Button>
          </ConfirmForm>
        )}
      </div>
    </main>
  );
}
