import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DuplicateCodeError, ValidationError, createProject } from "@/lib/projects";

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  async function create(formData: FormData) {
    "use server";

    const session = await auth();
    const startDate = formData.get("startDate") as string;
    const endDate = formData.get("endDate") as string;

    let project;
    try {
      project = await createProject(
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
        redirect(`/projects/new?error=${encodeURIComponent(err.message)}`);
      }
      throw err;
    }

    redirect(`/projects/${project.id}`);
  }

  return (
    <main>
      <h1>New Project</h1>
      {error && <p role="alert">{error}</p>}
      <form action={create}>
        <label>
          Project Code
          <input name="code" required />
        </label>
        <label>
          Project Name
          <input name="name" required />
        </label>
        <label>
          Description
          <textarea name="description" />
        </label>
        <label>
          Start Date
          <input name="startDate" type="date" />
        </label>
        <label>
          End Date
          <input name="endDate" type="date" />
        </label>
        <label>
          Status
          <select name="status" defaultValue="DRAFT" required>
            <option value="DRAFT">Draft</option>
            <option value="ACTIVE">Active</option>
            <option value="COMPLETED">Completed</option>
          </select>
        </label>
        <button type="submit">Create Project</button>
      </form>
    </main>
  );
}
