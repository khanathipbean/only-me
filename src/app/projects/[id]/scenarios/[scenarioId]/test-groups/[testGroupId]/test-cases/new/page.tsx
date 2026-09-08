import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { EDITOR_ROLES, requireProjectRoleOrNotFound } from "@/lib/rbac";
import { ValidationError, createTestCase } from "@/lib/test-cases";
import { parseStepsJson } from "@/lib/test-case-form";
import { TestStepEditor } from "@/components/TestStepEditor";

export default async function NewTestCasePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; scenarioId: string; testGroupId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id: projectId, scenarioId, testGroupId } = await params;
  const { error } = await searchParams;
  const session = await auth();

  await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);

  const basePath = `/projects/${projectId}/scenarios/${scenarioId}/test-groups/${testGroupId}/test-cases`;

  async function create(formData: FormData) {
    "use server";

    const session = await auth();
    await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);

    let testCase;
    try {
      testCase = await createTestCase(
        testGroupId,
        {
          name: formData.get("name") as string,
          condition: (formData.get("condition") as string) || null,
          preconditions: (formData.get("preconditions") as string) || null,
          testData: (formData.get("testData") as string) || null,
          expectedResult: formData.get("expectedResult") as string,
          priority: formData.get("priority") as never,
          testType: ((formData.get("testType") as string) || null) as never,
          status: formData.get("status") as never,
          steps: parseStepsJson(formData.get("stepsJson") as string),
        },
        session!.user.id,
      );
    } catch (err) {
      if (err instanceof ValidationError) {
        redirect(`${basePath}/new?error=${encodeURIComponent(err.message)}`);
      }
      throw err;
    }

    redirect(`${basePath}/${testCase.id}`);
  }

  return (
    <main>
      <h1>New Test Case</h1>
      {error && <p role="alert">{error}</p>}
      <form action={create}>
        <label>
          Test Case Name
          <input name="name" required />
        </label>
        <label>
          Condition
          <textarea name="condition" />
        </label>
        <label>
          Preconditions
          <textarea name="preconditions" />
        </label>
        <label>
          Test Data
          <textarea name="testData" />
        </label>
        <label>Test Steps</label>
        <TestStepEditor fieldName="stepsJson" initialSteps={[]} />
        <label>
          Expected Result (overall)
          <textarea name="expectedResult" required />
        </label>
        <label>
          Priority
          <select name="priority" defaultValue="MEDIUM" required>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </label>
        <label>
          Test Type
          <select name="testType" defaultValue="">
            <option value="">—</option>
            <option value="POSITIVE">Positive</option>
            <option value="NEGATIVE">Negative</option>
            <option value="BOUNDARY">Boundary</option>
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
        <button type="submit">Create Test Case</button>
      </form>
    </main>
  );
}
