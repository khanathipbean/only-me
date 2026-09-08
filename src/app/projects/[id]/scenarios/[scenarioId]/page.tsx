import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { ALL_MEMBER_ROLES, EDITOR_ROLES, requireProjectRoleOrNotFound } from "@/lib/rbac";
import {
  archiveScenario,
  deleteScenario,
  duplicateScenario,
  getScenarioById,
  restoreScenario,
} from "@/lib/scenarios";
import { ConfirmForm } from "@/components/ConfirmForm";

export default async function ScenarioDetailPage({
  params,
}: {
  params: Promise<{ id: string; scenarioId: string }>;
}) {
  const { scenarioId } = await params;
  const session = await auth();

  const scenario = await getScenarioById(scenarioId);
  if (!scenario) {
    notFound();
  }
  const projectId = scenario.projectId;

  await requireProjectRoleOrNotFound(session!.user.id, projectId, ALL_MEMBER_ROLES);

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
    <main>
      <p>
        <Link href={`/projects/${projectId}/scenarios`}>← Back to Scenarios</Link>
      </p>
      <h1>{scenario.name}</h1>
      {scenario.deletedAt && <p role="status">Archived</p>}
      <p>Priority: {scenario.priority}</p>
      <p>Status: {scenario.status}</p>
      <p>Expected Result: {scenario.expectedResult}</p>
      <p>Description: {scenario.description ?? "—"}</p>
      <p>Preconditions: {scenario.preconditions ?? "—"}</p>
      <p>Tags: {scenario.tags.length > 0 ? scenario.tags.join(", ") : "—"}</p>

      <p>
        <Link href={`/projects/${projectId}/scenarios/${scenario.id}/test-groups`}>
          View Test Groups
        </Link>
      </p>

      <p>
        <Link href={`/projects/${projectId}/scenarios/${scenario.id}/edit`}>Edit</Link>
      </p>

      <ConfirmForm action={duplicate} confirmMessage="Duplicate this scenario?">
        <button type="submit">Duplicate</button>
      </ConfirmForm>

      {scenario.deletedAt ? (
        <ConfirmForm action={restore} confirmMessage="Restore this scenario?">
          <button type="submit">Restore</button>
        </ConfirmForm>
      ) : (
        <ConfirmForm
          action={archive}
          confirmMessage="Archive this scenario? It can be restored later."
        >
          <button type="submit">Archive</button>
        </ConfirmForm>
      )}

      <ConfirmForm
        action={removeForever}
        confirmMessage="Delete this scenario? This cannot be undone from the UI."
      >
        <button type="submit">Delete</button>
      </ConfirmForm>
    </main>
  );
}
