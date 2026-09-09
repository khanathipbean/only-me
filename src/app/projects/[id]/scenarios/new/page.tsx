import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { EDITOR_ROLES, requireProjectRoleOrNotFound } from "@/lib/rbac";
import { ValidationError, createScenario } from "@/lib/scenarios";
import { Card } from "@/components/ui/Card";
import { ScenarioForm } from "@/components/forms/ScenarioForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { pageClass } from "@/lib/ui";

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
    <main className={pageClass}>
      <PageHeader title="New Scenario" />

      <Card className="max-w-4xl">
        <ScenarioForm action={create} submitLabel="Create Scenario" error={error} />
      </Card>
    </main>
  );
}
