import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { ALL_MEMBER_ROLES, EDITOR_ROLES, requireProjectRoleOrNotFound } from "@/lib/rbac";
import {
  ValidationError,
  archiveTestGroup,
  deleteTestGroup,
  duplicateTestGroup,
  getTestGroupDescendantCounts,
  getTestGroupWithProjectId,
  moveTestGroup,
  restoreTestGroup,
  updateTestGroup,
} from "@/lib/test-groups";
import { getScenarioById, listScenariosForProject } from "@/lib/scenarios";
import { getProjectById } from "@/lib/projects";
import { ConfirmForm } from "@/components/ConfirmForm";
import { Breadcrumb } from "@/components/Breadcrumb";
import { nameOr, testGroupBreadcrumb } from "@/lib/breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button, IconButton, LinkButton } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { TestGroupForm } from "@/components/forms/TestGroupForm";
import { Badge, workflowStatusTone } from "@/components/ui/Badge";
import { EditIcon, TrashIcon } from "@/components/icons";
import { labelClass, pageClass, selectClass } from "@/lib/ui";

export default async function TestGroupDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; scenarioId: string; testGroupId: string }>;
  searchParams: Promise<{ error?: string; moveError?: string }>;
}) {
  const { scenarioId, testGroupId } = await params;
  const { error, moveError } = await searchParams;
  const session = await auth();

  const testGroup = await getTestGroupWithProjectId(testGroupId);
  if (!testGroup) {
    notFound();
  }
  const projectId = testGroup.projectId;

  await requireProjectRoleOrNotFound(session!.user.id, projectId, ALL_MEMBER_ROLES);
  const [project, scenario, allScenarios] = await Promise.all([
    getProjectById(projectId),
    getScenarioById(scenarioId),
    listScenariosForProject(projectId),
  ]);
  const moveTargets = allScenarios.filter((s) => s.id !== scenarioId);
  const descendantCounts = await getTestGroupDescendantCounts(testGroupId);
  const impact = `${descendantCounts.testCases} Test Case(s)`;

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
          `/projects/${projectId}/scenarios/${scenarioId}/test-groups/${testGroupId}?error=${encodeURIComponent(err.message)}`,
        );
      }
      throw err;
    }

    redirect(`/projects/${projectId}/scenarios/${scenarioId}/test-groups/${testGroupId}`);
  }

  async function move(formData: FormData) {
    "use server";
    const session = await auth();
    await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
    const targetScenarioId = formData.get("targetScenarioId") as string;
    const targetScenario = targetScenarioId ? await getScenarioById(targetScenarioId) : null;
    if (!targetScenario || targetScenario.deletedAt) {
      redirect(
        `/projects/${projectId}/scenarios/${scenarioId}/test-groups/${testGroupId}?moveError=${encodeURIComponent("Target Scenario not found or archived")}`,
      );
    }
    await requireProjectRoleOrNotFound(session!.user.id, targetScenario.projectId, EDITOR_ROLES);
    await moveTestGroup(testGroupId, targetScenarioId, session!.user.id);
    redirect(`/projects/${targetScenario.projectId}/scenarios/${targetScenarioId}/test-groups/${testGroupId}`);
  }

  async function archive() {
    "use server";
    const session = await auth();
    await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
    await archiveTestGroup(testGroupId, session!.user.id);
    redirect(`/projects/${projectId}/scenarios/${scenarioId}/test-groups/${testGroupId}`);
  }

  async function restore() {
    "use server";
    const session = await auth();
    await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
    await restoreTestGroup(testGroupId, session!.user.id);
    redirect(`/projects/${projectId}/scenarios/${scenarioId}/test-groups/${testGroupId}`);
  }

  async function duplicate() {
    "use server";
    const session = await auth();
    await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
    const copy = await duplicateTestGroup(testGroupId, session!.user.id);
    redirect(`/projects/${projectId}/scenarios/${scenarioId}/test-groups/${copy.id}`);
  }

  async function removeForever() {
    "use server";
    const session = await auth();
    await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
    await deleteTestGroup(testGroupId, session!.user.id, true);
    redirect(`/projects/${projectId}/scenarios/${scenarioId}/test-groups`);
  }

  return (
    <main className={pageClass}>
      <Breadcrumb
        segments={testGroupBreadcrumb(
          { id: projectId, name: nameOr(project, projectId) },
          { id: scenarioId, name: nameOr(scenario, scenarioId) },
          testGroup,
        )}
      />
      <PageHeader
        title={testGroup.name}
        subtitle={
          <span className="flex items-center gap-2">
            <Badge tone={workflowStatusTone(testGroup.status)}>{testGroup.status}</Badge>
            {testGroup.deletedAt && <Badge tone="gray">Archived</Badge>}
          </span>
        }
        actions={
          <>
            <LinkButton
              href={`/projects/${projectId}/scenarios/${scenarioId}/test-groups/${testGroup.id}/test-cases`}
              variant="secondary"
            >
              View Test Cases
            </LinkButton>
            <Modal
              triggerLabel="Edit"
              triggerVariant="secondary"
              triggerIcon={<EditIcon />}
              title="Edit Test Group"
              openOnMount={!!error}
            >
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
            </Modal>
          </>
        }
      />

      <Card className="flex flex-col gap-2 text-sm">
        <p>
          <span className="text-muted">Description:</span> {testGroup.description ?? "—"}
        </p>
        <p>
          <span className="text-muted">Test Objective:</span> {testGroup.testObjective ?? "—"}
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
          confirmMessage={`Move this Test Group? It carries ${impact} with it.`}
        >
          <div className="flex flex-wrap items-end gap-3">
            <label className={`${labelClass} max-w-sm`}>
              Move to another Scenario
              <select name="targetScenarioId" required defaultValue="" className={selectClass}>
                <option value="" disabled>
                  Select a Scenario…
                </option>
                {moveTargets.map((targetScenario) => (
                  <option key={targetScenario.id} value={targetScenario.id}>
                    {targetScenario.name}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" variant="secondary">
              Move
            </Button>
          </div>
        </ConfirmForm>

        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <ConfirmForm action={duplicate} confirmMessage="Duplicate this Test Group?">
            <Button type="submit" variant="secondary">
              Duplicate
            </Button>
          </ConfirmForm>

          {testGroup.deletedAt ? (
            <ConfirmForm action={restore} confirmMessage="Restore this Test Group?">
              <Button type="submit" variant="secondary">
                Restore
              </Button>
            </ConfirmForm>
          ) : (
            <ConfirmForm
              action={archive}
              confirmMessage={`Archive this Test Group? It carries ${impact}, kept and restorable later.`}
            >
              <Button type="submit" variant="secondary">
                Archive
              </Button>
            </ConfirmForm>
          )}

          <ConfirmForm
            action={removeForever}
            confirmMessage={`Delete this Test Group? It carries ${impact}. This cannot be undone from the UI.`}
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
