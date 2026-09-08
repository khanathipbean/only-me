import Link from "next/link";
import { auth } from "@/auth";
import { ALL_MEMBER_ROLES, EDITOR_ROLES, requireProjectRoleOrNotFound } from "@/lib/rbac";
import { getScenarioById } from "@/lib/scenarios";
import { listTestGroupsForScenario, reorderTestGroups } from "@/lib/test-groups";
import { notFound, redirect } from "next/navigation";

export default async function TestGroupsPage({
  params,
}: {
  params: Promise<{ id: string; scenarioId: string }>;
}) {
  const { id: projectId, scenarioId } = await params;
  const session = await auth();

  const scenario = await getScenarioById(scenarioId);
  if (!scenario) {
    notFound();
  }

  await requireProjectRoleOrNotFound(session!.user.id, projectId, ALL_MEMBER_ROLES);

  const testGroups = await listTestGroupsForScenario(scenarioId);

  async function move(id: string, delta: -1 | 1) {
    "use server";
    const session = await auth();
    await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);

    const current = await listTestGroupsForScenario(scenarioId);
    const index = current.findIndex((tg) => tg.id === id);
    const swapWith = index + delta;
    if (index !== -1 && swapWith >= 0 && swapWith < current.length) {
      const orderedIds = current.map((tg) => tg.id);
      [orderedIds[index], orderedIds[swapWith]] = [orderedIds[swapWith], orderedIds[index]];
      await reorderTestGroups(scenarioId, orderedIds, session!.user.id);
    }
    redirect(`/projects/${projectId}/scenarios/${scenarioId}/test-groups`);
  }

  async function moveUp(formData: FormData) {
    "use server";
    await move(formData.get("id") as string, -1);
  }

  async function moveDown(formData: FormData) {
    "use server";
    await move(formData.get("id") as string, 1);
  }

  return (
    <main>
      <p>
        <Link href={`/projects/${projectId}/scenarios/${scenarioId}`}>← Back to Scenario</Link>
      </p>
      <h1>Test Groups for {scenario.name}</h1>

      <p>
        <Link href={`/projects/${projectId}/scenarios/${scenarioId}/test-groups/new`}>
          + New Test Group
        </Link>
      </p>

      {testGroups.length === 0 ? (
        <p>No Test Groups yet. Create one to get started.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Sequence</th>
              <th>Name</th>
              <th>Status</th>
              <th>Reorder</th>
            </tr>
          </thead>
          <tbody>
            {testGroups.map((testGroup) => (
              <tr key={testGroup.id}>
                <td>{testGroup.sequence}</td>
                <td>
                  <Link
                    href={`/projects/${projectId}/scenarios/${scenarioId}/test-groups/${testGroup.id}`}
                  >
                    {testGroup.name}
                  </Link>
                </td>
                <td>{testGroup.status}</td>
                <td>
                  <form action={moveUp} style={{ display: "inline" }}>
                    <input type="hidden" name="id" value={testGroup.id} />
                    <button type="submit">↑</button>
                  </form>
                  <form action={moveDown} style={{ display: "inline" }}>
                    <input type="hidden" name="id" value={testGroup.id} />
                    <button type="submit">↓</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
