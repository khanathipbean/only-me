import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { EDITOR_ROLES, requireProjectRoleOrNotFound } from "@/lib/rbac";
import { ValidationError, createScenario } from "@/lib/scenarios";

export default async function NewScenarioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id: projectId } = await params;
  const { error } = await searchParams;
  const session = await auth();

  await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);

  async function create(formData: FormData) {
    "use server";

    const session = await auth();
    await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);

    const tags = (formData.get("tags") as string)
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    let scenario;
    try {
      scenario = await createScenario(
        projectId,
        {
          name: formData.get("name") as string,
          description: (formData.get("description") as string) || null,
          preconditions: (formData.get("preconditions") as string) || null,
          testData: (formData.get("testData") as string) || null,
          steps: (formData.get("steps") as string) || null,
          expectedResult: formData.get("expectedResult") as string,
          priority: formData.get("priority") as never,
          status: formData.get("status") as never,
          tags,
        },
        session!.user.id,
      );
    } catch (err) {
      if (err instanceof ValidationError) {
        redirect(
          `/projects/${projectId}/scenarios/new?error=${encodeURIComponent(err.message)}`,
        );
      }
      throw err;
    }

    redirect(`/projects/${projectId}/scenarios/${scenario.id}`);
  }

  return (
    <main>
      <h1>New Scenario</h1>
      {error && <p role="alert">{error}</p>}
      <form action={create}>
        <label>
          Scenario Name
          <input name="name" required />
        </label>
        <label>
          Description
          <textarea name="description" />
        </label>
        <label>
          Preconditions
          <textarea name="preconditions" />
        </label>
        <label>
          Test Data
          <textarea name="testData" />
        </label>
        <label>
          Scenario Steps
          <textarea name="steps" />
        </label>
        <label>
          Expected Result
          <textarea name="expectedResult" required />
        </label>
        <label>
          Priority
          <select name="priority" required defaultValue="MEDIUM">
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </label>
        <label>
          Status
          <select name="status" defaultValue="DRAFT">
            <option value="DRAFT">Draft</option>
            <option value="READY">Ready</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="COMPLETED">Completed</option>
          </select>
        </label>
        <label>
          Tags (comma-separated)
          <input name="tags" />
        </label>
        <button type="submit">Create Scenario</button>
      </form>
    </main>
  );
}
