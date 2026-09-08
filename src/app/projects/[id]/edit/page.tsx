import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { EDITOR_ROLES, requireProjectRoleOrNotFound } from "@/lib/rbac";
import {
  DuplicateCodeError,
  ValidationError,
  getProjectById,
  updateProject,
} from "@/lib/projects";

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
    <main>
      <h1>Edit Project</h1>
      {error && <p role="alert">{error}</p>}
      <form action={update}>
        <label>
          Project Code
          <input name="code" defaultValue={project.code} required />
        </label>
        <label>
          Project Name
          <input name="name" defaultValue={project.name} required />
        </label>
        <label>
          Description
          <textarea name="description" defaultValue={project.description ?? ""} />
        </label>
        <label>
          Start Date
          <input
            name="startDate"
            type="date"
            defaultValue={project.startDate?.toISOString().slice(0, 10) ?? ""}
          />
        </label>
        <label>
          End Date
          <input
            name="endDate"
            type="date"
            defaultValue={project.endDate?.toISOString().slice(0, 10) ?? ""}
          />
        </label>
        <label>
          Status
          <select name="status" defaultValue={project.status} required>
            <option value="DRAFT">Draft</option>
            <option value="ACTIVE">Active</option>
            <option value="COMPLETED">Completed</option>
          </select>
        </label>
        <button type="submit">Save</button>
      </form>
    </main>
  );
}
