import Link from "next/link";
import { auth } from "@/auth";
import { ALL_MEMBER_ROLES, requireProjectRoleOrNotFound } from "@/lib/rbac";
import { getTestGroupWithProjectId } from "@/lib/test-groups";
import { listTestCasesForTestGroup } from "@/lib/test-cases";
import { notFound } from "next/navigation";

export default async function TestCasesPage({
  params,
}: {
  params: Promise<{ id: string; scenarioId: string; testGroupId: string }>;
}) {
  const { id: projectId, scenarioId, testGroupId } = await params;
  const session = await auth();

  const testGroup = await getTestGroupWithProjectId(testGroupId);
  if (!testGroup) {
    notFound();
  }

  await requireProjectRoleOrNotFound(session!.user.id, projectId, ALL_MEMBER_ROLES);

  const testCases = await listTestCasesForTestGroup(testGroupId);

  return (
    <main>
      <p>
        <Link href={`/projects/${projectId}/scenarios/${scenarioId}/test-groups/${testGroupId}`}>
          ← Back to Test Group
        </Link>
      </p>
      <h1>Test Cases for {testGroup.name}</h1>

      <p>
        <Link
          href={`/projects/${projectId}/scenarios/${scenarioId}/test-groups/${testGroupId}/test-cases/new`}
        >
          + New Test Case
        </Link>
      </p>

      {testCases.length === 0 ? (
        <p>No Test Cases yet. Create one to get started.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Priority</th>
              <th>Test Result</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {testCases.map((testCase) => (
              <tr key={testCase.id}>
                <td>
                  <Link
                    href={`/projects/${projectId}/scenarios/${scenarioId}/test-groups/${testGroupId}/test-cases/${testCase.id}`}
                  >
                    {testCase.name}
                  </Link>
                </td>
                <td>{testCase.priority}</td>
                <td>{testCase.testResult}</td>
                <td>{testCase.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
