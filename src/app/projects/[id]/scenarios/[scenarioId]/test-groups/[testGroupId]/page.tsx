import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { ALL_MEMBER_ROLES, EDITOR_ROLES, requireProjectRoleOrNotFound } from "@/lib/rbac";
import {
  archiveTestGroup,
  deleteTestGroup,
  duplicateTestGroup,
  getTestGroupWithProjectId,
  restoreTestGroup,
} from "@/lib/test-groups";
import { ConfirmForm } from "@/components/ConfirmForm";

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

      <h2>Test Cases</h2>
      <p>No Test Cases yet.</p>

      <p>
        <Link
          href={`/projects/${projectId}/scenarios/${scenarioId}/test-groups/${testGroup.id}/edit`}
        >
          Edit
        </Link>
      </p>

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
          confirmMessage="Archive this Test Group? It can be restored later."
        >
          <button type="submit">Archive</button>
        </ConfirmForm>
      )}

      <ConfirmForm
        action={removeForever}
        confirmMessage="Delete this Test Group? This cannot be undone from the UI."
      >
        <button type="submit">Delete</button>
      </ConfirmForm>
    </main>
  );
}
