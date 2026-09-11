import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { EDITOR_ROLES, requireProjectRoleOrNotFound } from "@/lib/rbac";
import {
  DuplicateCodeError,
  ValidationError,
  getProjectById,
  updateProject,
} from "@/lib/projects";
import { Card } from "@/components/ui/Card";
import { ProjectForm } from "@/components/forms/ProjectForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { pageClass } from "@/lib/ui";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProjectById(id);
  return { title: project ? `Edit · ${project.name}` : "Edit Project" };
}

export default async function EditProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const session = await auth();

  await requireProjectRoleOrNotFound(session!.user.id, id, EDITOR_ROLES);

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
        redirect(`/projects/${id}/edit?error=${encodeURIComponent(err.message)}`);
      }
      throw err;
    }

    redirect(`/projects/${id}`);
  }

  return (
    <main className={pageClass}>
      <PageHeader title="Edit Project" />

      <Card className="max-w-4xl">
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
      </Card>
    </main>
  );
}
