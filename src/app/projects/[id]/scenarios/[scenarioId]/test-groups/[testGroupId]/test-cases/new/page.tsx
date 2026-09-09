import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { EDITOR_ROLES, requireProjectRoleOrNotFound } from "@/lib/rbac";
import { ValidationError, createTestCase } from "@/lib/test-cases";
import { parseStepsJson } from "@/lib/test-case-form";
import { Card } from "@/components/ui/Card";
import { TestCaseForm } from "@/components/forms/TestCaseForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { pageClass } from "@/lib/ui";

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
    <main className={pageClass}>
      <PageHeader title="New Test Case" />

      <Card className="max-w-5xl">
        <TestCaseForm action={create} submitLabel="Create Test Case" error={error} />
      </Card>
    </main>
  );
}
