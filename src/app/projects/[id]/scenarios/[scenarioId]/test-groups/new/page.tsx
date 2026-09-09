import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { EDITOR_ROLES, requireProjectRoleOrNotFound } from "@/lib/rbac";
import { ValidationError, createTestGroup } from "@/lib/test-groups";
import { Card } from "@/components/ui/Card";
import { TestGroupForm } from "@/components/forms/TestGroupForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { pageClass } from "@/lib/ui";

export default async function NewTestGroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; scenarioId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id: projectId, scenarioId } = await params;
  const { error } = await searchParams;
  const session = await auth();

  await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);

  async function create(formData: FormData) {
    "use server";

    const session = await auth();
    await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);

    let testGroup;
    try {
      testGroup = await createTestGroup(
        scenarioId,
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
          `/projects/${projectId}/scenarios/${scenarioId}/test-groups/new?error=${encodeURIComponent(err.message)}`,
        );
      }
      throw err;
    }

    redirect(`/projects/${projectId}/scenarios/${scenarioId}/test-groups/${testGroup.id}`);
  }

  return (
    <main className={pageClass}>
      <PageHeader title="New Test Group" />

      <Card className="max-w-3xl">
        <TestGroupForm action={create} submitLabel="Create Test Group" error={error} />
      </Card>
    </main>
  );
}
