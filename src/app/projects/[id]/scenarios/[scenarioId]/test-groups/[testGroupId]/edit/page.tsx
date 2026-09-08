import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { EDITOR_ROLES, requireProjectRoleOrNotFound } from "@/lib/rbac";
import {
  ValidationError,
  getTestGroupWithProjectId,
  updateTestGroup,
} from "@/lib/test-groups";

export default async function EditTestGroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; scenarioId: string; testGroupId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { scenarioId, testGroupId } = await params;
  const { error } = await searchParams;
  const session = await auth();

  const testGroup = await getTestGroupWithProjectId(testGroupId);
  if (!testGroup) {
    notFound();
  }
  const projectId = testGroup.projectId;

  await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);

  async function update(formData: FormData) {
    "use server";

    const session = await auth();
    await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);

    try {
      await updateTestGroup(
        testGroupId,
        {
          name: formData.get("name") as string,
          description: (formData.get("description") as string) || null,
          testObjective: (formData.get("testObjective") as string) || null,
          status: formData.get("status") as never,
        },
        session!.user.id,
      );
    } catch (err) {
      if (err instanceof ValidationError) {
        redirect(
          `/projects/${projectId}/scenarios/${scenarioId}/test-groups/${testGroupId}/edit?error=${encodeURIComponent(err.message)}`,
        );
      }
      throw err;
    }

    redirect(`/projects/${projectId}/scenarios/${scenarioId}/test-groups/${testGroupId}`);
  }

  return (
    <main>
      <h1>Edit Test Group</h1>
      {error && <p role="alert">{error}</p>}
      <form action={update}>
        <label>
          Test Group Name
          <input name="name" defaultValue={testGroup.name} required />
        </label>
        <label>
          Description
          <textarea name="description" defaultValue={testGroup.description ?? ""} />
        </label>
        <label>
          Test Objective
          <textarea name="testObjective" defaultValue={testGroup.testObjective ?? ""} />
        </label>
        <label>
          Status
          <select name="status" defaultValue={testGroup.status}>
            <option value="DRAFT">Draft</option>
            <option value="READY">Ready</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="COMPLETED">Completed</option>
          </select>
        </label>
        <button type="submit">Save</button>
      </form>
    </main>
  );
}
