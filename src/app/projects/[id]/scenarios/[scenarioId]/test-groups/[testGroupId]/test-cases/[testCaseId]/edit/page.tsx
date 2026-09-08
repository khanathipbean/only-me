import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { EDITOR_ROLES, requireProjectRoleOrNotFound } from "@/lib/rbac";
import {
  ValidationError,
  getTestCaseWithProjectId,
  updateTestCase,
} from "@/lib/test-cases";
import { parseStepsJson } from "@/lib/test-case-form";
import { TestStepEditor } from "@/components/TestStepEditor";

export default async function EditTestCasePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; scenarioId: string; testGroupId: string; testCaseId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { scenarioId, testGroupId, testCaseId } = await params;
  const { error } = await searchParams;
  const session = await auth();

  const testCase = await getTestCaseWithProjectId(testCaseId);
  if (!testCase) {
    notFound();
  }
  const projectId = testCase.projectId;

  await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);

  const basePath = `/projects/${projectId}/scenarios/${scenarioId}/test-groups/${testGroupId}/test-cases`;

  async function update(formData: FormData) {
    "use server";

    const session = await auth();
    await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);

    try {
      await updateTestCase(
        testCaseId,
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
        redirect(`${basePath}/${testCaseId}/edit?error=${encodeURIComponent(err.message)}`);
      }
      throw err;
    }

    redirect(`${basePath}/${testCaseId}`);
  }

  return (
    <main>
      <h1>Edit Test Case</h1>
      {error && <p role="alert">{error}</p>}
      <form action={update}>
        <label>
          Test Case Name
          <input name="name" defaultValue={testCase.name} required />
        </label>
        <label>
          Condition
          <textarea name="condition" defaultValue={testCase.condition ?? ""} />
        </label>
        <label>
          Preconditions
          <textarea name="preconditions" defaultValue={testCase.preconditions ?? ""} />
        </label>
        <label>
          Test Data
          <textarea name="testData" defaultValue={testCase.testData ?? ""} />
        </label>
        <label>Test Steps</label>
        <TestStepEditor
          fieldName="stepsJson"
          initialSteps={testCase.steps.map((s) => ({ step: s.step, expectedResult: s.expectedResult }))}
        />
        <label>
          Expected Result (overall)
          <textarea name="expectedResult" defaultValue={testCase.expectedResult} required />
        </label>
        <label>
          Priority
          <select name="priority" defaultValue={testCase.priority} required>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </label>
        <label>
          Test Type
          <select name="testType" defaultValue={testCase.testType ?? ""}>
            <option value="">—</option>
            <option value="POSITIVE">Positive</option>
            <option value="NEGATIVE">Negative</option>
            <option value="BOUNDARY">Boundary</option>
          </select>
        </label>
        <label>
          Status
          <select name="status" defaultValue={testCase.status}>
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
