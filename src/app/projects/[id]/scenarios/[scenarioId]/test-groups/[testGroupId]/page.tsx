import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { ALL_MEMBER_ROLES, EDITOR_ROLES, requireProjectRoleOrNotFound } from "@/lib/rbac";
import {
  archiveTestGroup,
  deleteTestGroup,
  duplicateTestGroup,
  getTestGroupDescendantCounts,
  getTestGroupWithProjectId,
  moveTestGroup,
  restoreTestGroup,
} from "@/lib/test-groups";
import { getScenarioById } from "@/lib/scenarios";
import { getProjectById } from "@/lib/projects";
import { ConfirmForm } from "@/components/ConfirmForm";
import { Breadcrumb } from "@/components/Breadcrumb";
import { nameOr, testGroupBreadcrumb } from "@/lib/breadcrumb";

export default async function TestGroupDetailPage({
  params,
}: {
  params: Promise<{ id: string; scenarioId: string; testGroupId: string }>;
}) {
  const { scenarioId, testGroupId } = await params;
  const session = await auth();

  const testGroup = await getTestGroupWithProjectId(testGroupId);
  if (!testGroup) {
    notFound();
  }
  const projectId = testGroup.projectId;

  await requireProjectRoleOrNotFound(session!.user.id, projectId, ALL_MEMBER_ROLES);
  const [project, scenario] = await Promise.all([
    getProjectById(projectId),
    getScenarioById(scenarioId),
  ]);
  const descendantCounts = await getTestGroupDescendantCounts(testGroupId);
  const impact = `${descendantCounts.testCases} Test Case(s)`;

  async function move(formData: FormData) {
    "use server";
    const session = await auth();
    await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
    const targetScenarioId = formData.get("targetScenarioId") as string;
    const targetScenario = await getScenarioById(targetScenarioId);
    if (!targetScenario || targetScenario.deletedAt) {
      throw new Error("Target Scenario not found or archived");
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
    <main>
      <Breadcrumb
        segments={testGroupBreadcrumb(
          { id: projectId, name: nameOr(project, projectId) },
          { id: scenarioId, name: nameOr(scenario, scenarioId) },
          testGroup,
        )}
      />
      <p>
        <Link href={`/projects/${projectId}/scenarios/${scenarioId}/test-groups`}>
          ← Back to Test Groups
        </Link>
      </p>
      <h1>{testGroup.name}</h1>
      {testGroup.deletedAt && <p role="status">Archived</p>}
      <p>Status: {testGroup.status}</p>
      <p>Description: {testGroup.description ?? "—"}</p>
      <p>Test Objective: {testGroup.testObjective ?? "—"}</p>

      <p>
        <Link
          href={`/projects/${projectId}/scenarios/${scenarioId}/test-groups/${testGroup.id}/test-cases`}
        >
          View Test Cases
        </Link>
      </p>

      <p>
        <Link
          href={`/projects/${projectId}/scenarios/${scenarioId}/test-groups/${testGroup.id}/edit`}
        >
          Edit
        </Link>
      </p>

      <h2>Move to another Scenario</h2>
      <ConfirmForm
        action={move}
        confirmMessage={`Move this Test Group? It carries ${impact} with it.`}
      >
        <label>
          Target Scenario ID
          <input name="targetScenarioId" required />
        </label>
        <button type="submit">Move</button>
      </ConfirmForm>

      <ConfirmForm action={duplicate} confirmMessage="Duplicate this Test Group?">
        <button type="submit">Duplicate</button>
      </ConfirmForm>

      {testGroup.deletedAt ? (
        <ConfirmForm action={restore} confirmMessage="Restore this Test Group?">
          <button type="submit">Restore</button>
        </ConfirmForm>
      ) : (
        <ConfirmForm
          action={archive}
          confirmMessage={`Archive this Test Group? It carries ${impact}, kept and restorable later.`}
        >
          <button type="submit">Archive</button>
        </ConfirmForm>
      )}

      <ConfirmForm
        action={removeForever}
        confirmMessage={`Delete this Test Group? It carries ${impact}. This cannot be undone from the UI.`}
      >
        <button type="submit">Delete</button>
      </ConfirmForm>
    </main>
  );
}
