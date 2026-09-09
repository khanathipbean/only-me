import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { EDITOR_ROLES, requireProjectRoleOrNotFound } from "@/lib/rbac";
import {
  ValidationError,
  getTestGroupWithProjectId,
  updateTestGroup,
} from "@/lib/test-groups";
import { Card } from "@/components/ui/Card";
import { TestGroupForm } from "@/components/forms/TestGroupForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { pageClass } from "@/lib/ui";

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
    <main className={pageClass}>
      <PageHeader title="Edit Test Group" />

      <Card className="max-w-3xl">
        <TestGroupForm
          action={update}
          submitLabel="Save"
          error={error}
          defaults={{
            name: testGroup.name,
            description: testGroup.description,
            testObjective: testGroup.testObjective,
            status: testGroup.status,
          }}
        />
      </Card>
    </main>
  );
}
