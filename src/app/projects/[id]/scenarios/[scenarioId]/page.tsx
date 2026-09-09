import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { ALL_MEMBER_ROLES, EDITOR_ROLES, requireProjectRoleOrNotFound } from "@/lib/rbac";
import {
  ValidationError,
  archiveScenario,
  deleteScenario,
  duplicateScenario,
  getScenarioById,
  getScenarioDescendantCounts,
  moveScenario,
  restoreScenario,
  updateScenario,
} from "@/lib/scenarios";
import { getProjectById, listProjectsForUserWithRole } from "@/lib/projects";
import { ConfirmForm } from "@/components/ConfirmForm";
import { Breadcrumb } from "@/components/Breadcrumb";
import { nameOr, scenarioBreadcrumb } from "@/lib/breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { Card } from "@/components/ui/Card";
import { Button, IconButton, LinkButton } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ScenarioForm } from "@/components/forms/ScenarioForm";
import { Badge, priorityTone, workflowStatusTone } from "@/components/ui/Badge";
import { EditIcon, TrashIcon } from "@/components/icons";
import { labelClass, pageClass } from "@/lib/ui";

export default async function ScenarioDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; scenarioId: string }>;
  searchParams: Promise<{ error?: string; moveError?: string }>;
}) {
  const { scenarioId } = await params;
  const { error, moveError } = await searchParams;
  const session = await auth();

  const scenario = await getScenarioById(scenarioId);
  if (!scenario) {
    notFound();
  }
  const projectId = scenario.projectId;

  await requireProjectRoleOrNotFound(session!.user.id, projectId, ALL_MEMBER_ROLES);
  const [project, editableProjects] = await Promise.all([
    getProjectById(projectId),
    listProjectsForUserWithRole(session!.user.id, EDITOR_ROLES),
  ]);
  const moveTargets = editableProjects.filter((p) => p.id !== projectId);
  const descendantCounts = await getScenarioDescendantCounts(scenarioId);
  const impact = `${descendantCounts.testGroups} Test Group(s) and ${descendantCounts.testCases} Test Case(s)`;

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
          `/projects/${projectId}/scenarios/${scenarioId}?error=${encodeURIComponent(err.message)}`,
        );
      }
      throw err;
    }

    redirect(`/projects/${projectId}/scenarios/${scenarioId}`);
  }

  async function move(formData: FormData) {
    "use server";
    const session = await auth();
    await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
    const targetProjectId = formData.get("targetProjectId") as string;
    const targetProject = targetProjectId ? await getProjectById(targetProjectId) : null;
    if (!targetProject || targetProject.deletedAt) {
      redirect(
        `/projects/${projectId}/scenarios/${scenarioId}?moveError=${encodeURIComponent("Target Project not found or archived")}`,
      );
    }
    await requireProjectRoleOrNotFound(session!.user.id, targetProjectId, EDITOR_ROLES);
    await moveScenario(scenarioId, targetProjectId, session!.user.id);
    redirect(`/projects/${targetProjectId}/scenarios/${scenarioId}`);
  }

  async function archive() {
    "use server";
    const session = await auth();
    await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
    await archiveScenario(scenarioId, session!.user.id);
    redirect(`/projects/${projectId}/scenarios/${scenarioId}`);
  }

  async function restore() {
    "use server";
    const session = await auth();
    await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
    await restoreScenario(scenarioId, session!.user.id);
    redirect(`/projects/${projectId}/scenarios/${scenarioId}`);
  }

  async function duplicate() {
    "use server";
    const session = await auth();
    await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
    const copy = await duplicateScenario(scenarioId, session!.user.id);
    redirect(`/projects/${projectId}/scenarios/${copy.id}`);
  }

  async function removeForever() {
    "use server";
    const session = await auth();
    await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
    await deleteScenario(scenarioId, session!.user.id, true);
    redirect(`/projects/${projectId}/scenarios`);
  }

  return (
    <main className={pageClass}>
      <Breadcrumb
        segments={scenarioBreadcrumb(
          { id: projectId, name: nameOr(project, projectId) },
          scenario,
        )}
      />
      <PageHeader
        title={scenario.name}
        subtitle={
          <span className="flex items-center gap-2">
            <Badge tone={priorityTone(scenario.priority)}>{scenario.priority}</Badge>
            <Badge tone={workflowStatusTone(scenario.status)}>{scenario.status}</Badge>
            {scenario.deletedAt && <Badge tone="gray">Archived</Badge>}
          </span>
        }
        actions={
          <>
            <LinkButton href={`/projects/${projectId}/scenarios/${scenario.id}/test-groups`} variant="secondary">
              View Test Groups
            </LinkButton>
            <Modal
              triggerLabel="Edit"
              triggerVariant="secondary"
              triggerIcon={<EditIcon />}
              title="Edit Scenario"
              openOnMount={!!error}
            >
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
            </Modal>
          </>
        }
      />

      <Card className="flex flex-col gap-2 text-sm">
        <p>
          <span className="text-muted">Expected Result:</span> {scenario.expectedResult}
        </p>
        <p>
          <span className="text-muted">Description:</span> {scenario.description ?? "—"}
        </p>
        <p>
          <span className="text-muted">Preconditions:</span> {scenario.preconditions ?? "—"}
        </p>
        <p>
          <span className="text-muted">Tags:</span>{" "}
          {scenario.tags.length > 0 ? scenario.tags.join(", ") : "—"}
        </p>
      </Card>

      <Card className="flex flex-col gap-5">
        <h2 className="text-sm font-semibold text-foreground">Manage</h2>

        {moveError && (
          <p role="alert" className="rounded-md bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-900/40 dark:text-red-300">
            {moveError}
          </p>
        )}
        <ConfirmForm
          action={move}
          confirmMessage={`Move this scenario? It carries ${impact} with it.`}
        >
          <div className="flex flex-wrap items-end gap-3">
            <label className={`${labelClass} max-w-sm`}>
              Move to another Project
              <Select
                name="targetProjectId"
                defaultValue=""
                required
                options={[
                  { value: "", label: "Select a Project…" },
                  ...moveTargets.map((targetProject) => ({
                    value: targetProject.id,
                    label: `${targetProject.code} — ${targetProject.name}`,
                  })),
                ]}
                ariaLabel="Move to another Project"
              />
            </label>
            <Button type="submit" variant="secondary">
              Move
            </Button>
          </div>
        </ConfirmForm>

        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <ConfirmForm action={duplicate} confirmMessage="Duplicate this scenario?">
            <Button type="submit" variant="secondary">
              Duplicate
            </Button>
          </ConfirmForm>

          {scenario.deletedAt ? (
            <ConfirmForm action={restore} confirmMessage="Restore this scenario?">
              <Button type="submit" variant="secondary">
                Restore
              </Button>
            </ConfirmForm>
          ) : (
            <ConfirmForm
              action={archive}
              confirmMessage={`Archive this scenario? It carries ${impact}, kept and restorable later.`}
            >
              <Button type="submit" variant="secondary">
                Archive
              </Button>
            </ConfirmForm>
          )}

          <ConfirmForm
            action={removeForever}
            confirmMessage={`Delete this scenario? It carries ${impact}. This cannot be undone from the UI.`}
            variant="danger"
          >
            <IconButton type="submit" variant="danger" aria-label="Delete" title="Delete">
              <TrashIcon />
            </IconButton>
          </ConfirmForm>
        </div>
      </Card>
    </main>
  );
}
