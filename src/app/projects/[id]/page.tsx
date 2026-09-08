import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ALL_MEMBER_ROLES, EDITOR_ROLES, requireProjectRoleOrNotFound } from "@/lib/rbac";
import { archiveProject, getProjectById, restoreProject } from "@/lib/projects";
import { ConfirmForm } from "@/components/ConfirmForm";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();

  await requireProjectRoleOrNotFound(session!.user.id, id, ALL_MEMBER_ROLES);

  const project = await getProjectById(id);
  if (!project) {
    redirect("/projects");
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
    <main>
      <h1>
        {project.name} <small>({project.code})</small>
      </h1>
      {project.deletedAt && <p role="status">Archived</p>}
      <p>Status: {project.status}</p>
      <p>Description: {project.description ?? "—"}</p>
      <p>Owner: {project.owner.name}</p>
      <p>
        Last updated by: {project.updatedBy?.name ?? "—"} at{" "}
        {project.updatedAt.toISOString()}
      </p>

      <p>
        <Link href={`/projects/${project.id}/edit`}>Edit</Link>
      </p>
      <p>
        <Link href={`/projects/${project.id}/scenarios`}>View Scenarios</Link>
      </p>

      {project.deletedAt ? (
        <ConfirmForm action={restore} confirmMessage="Restore this project?">
          <button type="submit">Restore</button>
        </ConfirmForm>
      ) : (
        <ConfirmForm
          action={archive}
          confirmMessage="Archive this project? Its Scenarios, Test Groups, and Test Cases are kept and can be restored later."
        >
          <button type="submit">Archive</button>
        </ConfirmForm>
      )}
    </main>
  );
}
