import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { EDITOR_ROLES, requireProjectRoleOrNotFound } from "@/lib/rbac";
import { ValidationError, getScenarioById, updateScenario } from "@/lib/scenarios";
import { Card } from "@/components/ui/Card";
import { ScenarioForm } from "@/components/forms/ScenarioForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { pageClass } from "@/lib/ui";

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
    <main className={pageClass}>
      <PageHeader title="Edit Scenario" />

      <Card className="max-w-4xl">
        <ScenarioForm
          action={update}
          submitLabel="Save"
          error={error}
          defaults={{
            name: scenario.name,
            description: scenario.description,
            preconditions: scenario.preconditions,
            testData: scenario.testData,
            steps: scenario.steps,
            expectedResult: scenario.expectedResult,
            priority: scenario.priority,
            status: scenario.status,
            tags: scenario.tags.join(", "),
          }}
        />
      </Card>
    </main>
  );
}
