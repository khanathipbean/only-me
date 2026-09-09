import Link from "next/link";
import { auth } from "@/auth";
import { EDITOR_ROLES, ALL_MEMBER_ROLES, requireProjectRoleOrNotFound } from "@/lib/rbac";
import { getTestGroupWithProjectId } from "@/lib/test-groups";
import { ValidationError, createTestCase, listTestCasesForTestGroup } from "@/lib/test-cases";
import { parseStepsJson } from "@/lib/test-case-form";
import { getScenarioById } from "@/lib/scenarios";
import { getProjectById } from "@/lib/projects";
import { notFound, redirect } from "next/navigation";
import { Breadcrumb } from "@/components/Breadcrumb";
import { nameOr, testCasesListBreadcrumb } from "@/lib/breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { TestCaseForm } from "@/components/forms/TestCaseForm";
import { Badge, priorityTone, testResultTone, workflowStatusTone } from "@/components/ui/Badge";
import {
  mutedTextClass,
  pageClass,
  tableClass,
  tableWrapClass,
  tdClass,
  thClass,
  trHoverClass,
} from "@/lib/ui";

export default async function TestCasesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; scenarioId: string; testGroupId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id: projectId, scenarioId, testGroupId } = await params;
  const { error } = await searchParams;
  const session = await auth();

  const testGroup = await getTestGroupWithProjectId(testGroupId);
  if (!testGroup) {
    notFound();
  }

  await requireProjectRoleOrNotFound(session!.user.id, projectId, ALL_MEMBER_ROLES);

  const [project, scenario, testCases] = await Promise.all([
    getProjectById(projectId),
    getScenarioById(scenarioId),
    listTestCasesForTestGroup(testGroupId),
  ]);

  const basePath = `/projects/${projectId}/scenarios/${scenarioId}/test-groups/${testGroupId}/test-cases`;

  async function create(formData: FormData) {
    "use server";

    const session = await auth();
    await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);

    let testCase;
    try {
      testCase = await createTestCase(
        testGroupId,
        {
          name: formData.get("name") as string,
          condition: (formData.get("condition") as string) || null,
          preconditions: (formData.get("preconditions") as string) || null,
          testData: (formData.get("testData") as string) || null,
          expectedResult: formData.get("expectedResult") as string,
          priority: formData.get("priority") as never,
          testType: ((formData.get("testType") as string) || null) as never,
          status: formData.get("status") as never,
          steps: parseStepsJson(formData.get("stepsJson") as string),
        },
        session!.user.id,
      );
    } catch (err) {
      if (err instanceof ValidationError) {
        redirect(`${basePath}?error=${encodeURIComponent(err.message)}`);
      }
      throw err;
    }

    redirect(`${basePath}/${testCase.id}`);
  }

  return (
    <main className={pageClass}>
      <Breadcrumb
        segments={testCasesListBreadcrumb(
          { id: projectId, name: nameOr(project, projectId) },
          { id: scenarioId, name: nameOr(scenario, scenarioId) },
          testGroup,
        )}
      />
      <PageHeader
        title={`Test Cases for ${testGroup.name}`}
        actions={
          <Modal triggerLabel="+ New Test Case" title="New Test Case" openOnMount={!!error}>
            <TestCaseForm action={create} submitLabel="Create Test Case" error={error} />
          </Modal>
        }
      />

      {testCases.length === 0 ? (
        <p className={mutedTextClass}>No Test Cases yet. Create one to get started.</p>
      ) : (
        <div className={tableWrapClass}>
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>Name</th>
                <th className={thClass}>Priority</th>
                <th className={thClass}>Test Result</th>
                <th className={thClass}>Status</th>
              </tr>
            </thead>
            <tbody>
              {testCases.map((testCase) => (
                <tr key={testCase.id} className={trHoverClass}>
                  <td className={tdClass}>
                    <Link
                      href={`/projects/${projectId}/scenarios/${scenarioId}/test-groups/${testGroupId}/test-cases/${testCase.id}`}
                      className="font-medium text-foreground hover:text-brand hover:underline"
                    >
                      {testCase.name}
                    </Link>
                  </td>
                  <td className={tdClass}>
                    <Badge tone={priorityTone(testCase.priority)}>{testCase.priority}</Badge>
                  </td>
                  <td className={tdClass}>
                    <Badge tone={testResultTone(testCase.testResult)}>
                      {testCase.testResult.replace(/_/g, " ")}
                    </Badge>
                  </td>
                  <td className={tdClass}>
                    <Badge tone={workflowStatusTone(testCase.status)}>{testCase.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
