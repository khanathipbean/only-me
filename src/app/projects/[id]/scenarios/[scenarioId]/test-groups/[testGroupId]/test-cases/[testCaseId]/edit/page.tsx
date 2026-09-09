import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { EDITOR_ROLES, requireProjectRoleOrNotFound } from "@/lib/rbac";
import {
  ValidationError,
  getTestCaseWithProjectId,
  updateTestCase,
} from "@/lib/test-cases";
import { parseStepsJson } from "@/lib/test-case-form";
import { Card } from "@/components/ui/Card";
import { TestCaseForm } from "@/components/forms/TestCaseForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { pageClass } from "@/lib/ui";

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
    <main className={pageClass}>
      <PageHeader title="Edit Test Case" />

      <Card className="max-w-5xl">
        <TestCaseForm
          action={update}
          submitLabel="Save"
          error={error}
          defaults={{
            name: testCase.name,
            condition: testCase.condition,
            preconditions: testCase.preconditions,
            testData: testCase.testData,
            expectedResult: testCase.expectedResult,
            priority: testCase.priority,
            testType: testCase.testType,
            status: testCase.status,
            steps: testCase.steps.map((s) => ({ step: s.step, expectedResult: s.expectedResult })),
          }}
        />
      </Card>
    </main>
  );
}
