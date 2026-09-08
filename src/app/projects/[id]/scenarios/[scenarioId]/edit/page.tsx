import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { EDITOR_ROLES, requireProjectRoleOrNotFound } from "@/lib/rbac";
import { ValidationError, getScenarioById, updateScenario } from "@/lib/scenarios";

export default async function EditScenarioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; scenarioId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { scenarioId } = await params;
  const { error } = await searchParams;
  const session = await auth();

  const scenario = await getScenarioById(scenarioId);
  if (!scenario) {
    notFound();
  }
  const projectId = scenario.projectId;

  await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);

  async function update(formData: FormData) {
    "use server";

    const session = await auth();
    await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);

    const tags = (formData.get("tags") as string)
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    try {
      await updateScenario(
        scenarioId,
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
          `/projects/${projectId}/scenarios/${scenarioId}/edit?error=${encodeURIComponent(err.message)}`,
        );
      }
      throw err;
    }

    redirect(`/projects/${projectId}/scenarios/${scenarioId}`);
  }

  return (
    <main>
      <h1>Edit Scenario</h1>
      {error && <p role="alert">{error}</p>}
      <form action={update}>
        <label>
          Scenario Name
          <input name="name" defaultValue={scenario.name} required />
        </label>
        <label>
          Description
          <textarea name="description" defaultValue={scenario.description ?? ""} />
        </label>
        <label>
          Preconditions
          <textarea name="preconditions" defaultValue={scenario.preconditions ?? ""} />
        </label>
        <label>
          Test Data
          <textarea name="testData" defaultValue={scenario.testData ?? ""} />
        </label>
        <label>
          Scenario Steps
          <textarea name="steps" defaultValue={scenario.steps ?? ""} />
        </label>
        <label>
          Expected Result
          <textarea name="expectedResult" defaultValue={scenario.expectedResult} required />
        </label>
        <label>
          Priority
          <select name="priority" defaultValue={scenario.priority} required>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </label>
        <label>
          Status
          <select name="status" defaultValue={scenario.status}>
            <option value="DRAFT">Draft</option>
            <option value="READY">Ready</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="COMPLETED">Completed</option>
          </select>
        </label>
        <label>
          Tags (comma-separated)
          <input name="tags" defaultValue={scenario.tags.join(", ")} />
        </label>
        <button type="submit">Save</button>
      </form>
    </main>
  );
}
