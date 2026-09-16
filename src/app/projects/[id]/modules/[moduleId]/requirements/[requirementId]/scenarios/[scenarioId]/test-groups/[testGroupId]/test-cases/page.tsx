import Link from "next/link";
import { auth } from "@/auth";
import { EDITOR_ROLES, ALL_MEMBER_ROLES, requireProjectRoleOrNotFound } from "@/lib/rbac";
import { getTestGroupWithProjectId } from "@/lib/test-groups";
import {
  ValidationError,
  createTestCase,
  listTestCasesWithStepsForTestGroupPage,
  updateTestCase,
} from "@/lib/test-cases";
import { parseStepsJson } from "@/lib/test-case-form";
import { getScenarioById } from "@/lib/scenarios";
import { notFound, redirect } from "next/navigation";
import { Breadcrumb } from "@/components/Breadcrumb";
import { nameOr, testCasesListBreadcrumb } from "@/lib/breadcrumb";
import { withToast } from "@/lib/toast";
import { testCasesListHref } from "@/lib/hrefs";
import { getProjectById } from "@/lib/projects";
import { getRequirementById } from "@/lib/requirements";
import { ASSIGNEE_ENABLED } from "@/lib/features";
import { PageHeader } from "@/components/ui/PageHeader";
import { FilterForm } from "@/components/FilterForm";
import { Select } from "@/components/ui/Select";
import { Pagination } from "@/components/ui/Pagination";
import { ResultCount } from "@/components/ui/ResultCount";
import { Modal } from "@/components/ui/Modal";
import { TestCaseForm } from "@/components/forms/TestCaseForm";
import { Badge, priorityTone, testResultTone, workflowStatusTone } from "@/components/ui/Badge";
import { DetailField, DetailFields } from "@/components/ui/DetailFields";
import { ExpandableRow } from "@/components/ui/ExpandableRow";
import { RowActions } from "@/components/ui/RowActions";
import { PRIORITY_OPTIONS, TEST_RESULT_OPTIONS, WORKFLOW_STATUS_OPTIONS } from "@/lib/enums";
import {
  inputClass,
  labelClass,
  mutedTextClass,
  pageClass,
  tableClass,
  tableWrapClass,
  tdCenterClass,
  tdClass,
  thCenterClass,
  thClass,
} from "@/lib/ui";
import type { Priority, TestResult, WorkflowStatus } from "@/generated/prisma/client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ testGroupId: string }>;
}) {
  const { testGroupId } = await params;
  const testGroup = await getTestGroupWithProjectId(testGroupId);
  return { title: testGroup ? `Test Cases · ${testGroup.name}` : "Test Cases" };
}

export default async function TestCasesPage({
  params,
  searchParams,
}: {
  params: Promise<{
    id: string;
    moduleId: string;
    requirementId: string;
    scenarioId: string;
    testGroupId: string;
  }>;
  searchParams: Promise<{
    error?: string;
    /** Which row's inline Edit modal to reopen after a failed save — without
     * it a validation error would reopen every row's modal at once. */
    editId?: string;
    search?: string;
    priority?: string;
    testResult?: string;
    status?: string;
    page?: string;
    pageSize?: string;
  }>;
}) {
  const { id: projectId, moduleId, requirementId, scenarioId, testGroupId } = await params;
  const { error, editId, search, priority, testResult, status, page, pageSize } =
    await searchParams;
  const hasFilters = Boolean(search || priority || testResult || status);
  const session = await auth();

  const testGroup = await getTestGroupWithProjectId(testGroupId);
  if (!testGroup || testGroup.scenarioId !== scenarioId) {
    notFound();
  }

  await requireProjectRoleOrNotFound(session!.user.id, projectId, ALL_MEMBER_ROLES);

  const [project, scenario, requirement, testCasePage] = await Promise.all([
    getProjectById(projectId),
    getScenarioById(scenarioId),
    getRequirementById(requirementId),
    // Steps included: each row's inline Edit modal seeds a TestStepEditor,
    // which would silently wipe the steps if it mounted with an empty list.
    listTestCasesWithStepsForTestGroupPage(testGroupId, {
      search,
      priority: priority as Priority | undefined,
      testResult: testResult as TestResult | undefined,
      status: status as WorkflowStatus | undefined,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    }),
  ]);
  const testCases = testCasePage.items;

  // The ancestors in the URL must be this Test Group's actual ancestors.
  if (
    !scenario ||
    scenario.projectId !== projectId ||
    scenario.requirementId !== requirementId ||
    !requirement ||
    requirement.moduleId !== moduleId ||
    !requirement.module
  ) {
    notFound();
  }

  const basePath = testCasesListHref({
    projectId,
    moduleId,
    requirementId,
    scenarioId,
    testGroupId,
  });
  /* Plain strings only: a server action may close over serialisable values,
   * and capturing a helper function stops React encoding the action at all,
   * which leaves the form working only once JS has loaded. */
  const listQueryString = new URLSearchParams(
    Object.entries({ search, priority, testResult, status }).filter(
      (entry): entry is [string, string] => Boolean(entry[1]),
    ),
  ).toString();
  const listHref = listQueryString ? `${basePath}?${listQueryString}` : basePath;

  /** Bound per row: an inline Edit modal on a list needs one action per Test
   * Case, unlike the detail page where a single closed-over id suffices. */
  function updateAction(testCaseId: string) {
    return async function update(formData: FormData) {
      "use server";

      const session = await auth();
      await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);

      try {
        await updateTestCase(
          testCaseId,
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
          const query = new URLSearchParams(listQueryString);
          query.set("error", err.message);
          query.set("editId", testCaseId);
          redirect(`${basePath}?${query}`);
        }
        throw err;
      }

      redirect(listHref);
    };
  }

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
        const query = new URLSearchParams(listQueryString);
        query.set("error", err.message);
        redirect(`${basePath}?${query}`);
      }
      throw err;
    }

    redirect(withToast(`${basePath}/${testCase.id}`, "Test Case created"));
  }

  return (
    <main className={pageClass}>
      <Breadcrumb
        segments={testCasesListBreadcrumb(
          { id: projectId, name: nameOr(project, projectId) },
          requirement.module,
          requirement,
          scenario,
          testGroup,
        )}
      />
      <PageHeader
        title={
          <>
            Test Cases{" "}
            <span className="text-base font-normal text-muted">({testGroup.name})</span>
          </>
        }
        actions={
          <Modal
            triggerLabel="+ New Test Case"
            title="New Test Case"
            openOnMount={!!error && !editId}
          >
            <TestCaseForm
              action={create}
              submitLabel="Create Test Case"
              error={editId ? undefined : error}
            />
          </Modal>
        }
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <FilterForm showClear={hasFilters} className="flex-1">
          <input
            type="text"
            name="search"
            placeholder="Search by name"
            defaultValue={search}
            className={`${inputClass} max-w-xs`}
          />
          <label className={labelClass}>
            Priority
            <Select
              name="priority"
              defaultValue={priority ?? ""}
              options={[{ value: "", label: "All" }, ...PRIORITY_OPTIONS]}
              ariaLabel="Priority"
              className="max-w-40"
            />
          </label>
          <label className={labelClass}>
            Test Result
            <Select
              name="testResult"
              defaultValue={testResult ?? ""}
              options={[{ value: "", label: "All" }, ...TEST_RESULT_OPTIONS]}
              ariaLabel="Test Result"
              className="max-w-44"
            />
          </label>
          <label className={labelClass}>
            Status
            <Select
              name="status"
              defaultValue={status ?? ""}
              options={[{ value: "", label: "All" }, ...WORKFLOW_STATUS_OPTIONS]}
              ariaLabel="Status"
              className="max-w-44"
            />
          </label>
        </FilterForm>
        <ResultCount total={testCasePage.total} />
      </div>

      {testCases.length === 0 ? (
        <p className={mutedTextClass}>
          {hasFilters
            ? "No Test Cases match your search/filters."
            : "No Test Cases yet. Create one to get started."}
        </p>
      ) : (
        <div className={tableWrapClass}>
          <table className={tableClass}>
            <colgroup>
              <col className="w-[34%]" />
              <col className="w-[18%]" />
              <col className="w-[17%]" />
              <col className="w-[17%]" />
              <col className="w-[14%]" />
            </colgroup>
            <thead>
              <tr>
                <th className={thClass}>Name</th>
                <th className={thCenterClass}>Priority</th>
                <th className={thCenterClass}>Test Result</th>
                <th className={thCenterClass}>Status</th>
                <th className={thCenterClass}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {testCases.map((testCase) => (
                <ExpandableRow
                  key={testCase.id}
                  colSpan={5}
                  detailLabel={testCase.name}
                  cells={
                    <>
                      <td className={tdClass}>
                        {/* A Test Case is the leaf of the hierarchy — nothing to
                            drill into — so the name keeps going to its own
                            detail page, unlike the two lists above it. */}
                        <Link
                          href={`${basePath}/${testCase.id}`}
                          className="font-medium text-foreground hover:text-brand hover:underline"
                        >
                          {testCase.name}
                        </Link>
                      </td>
                      <td className={tdCenterClass}>
                        <Badge tone={priorityTone(testCase.priority)}>{testCase.priority}</Badge>
                      </td>
                      <td className={tdCenterClass}>
                        <Badge tone={testResultTone(testCase.testResult)}>
                          {testCase.testResult.replace(/_/g, " ")}
                        </Badge>
                      </td>
                      <td className={tdCenterClass}>
                        <Badge tone={workflowStatusTone(testCase.status)}>{testCase.status}</Badge>
                      </td>
                    </>
                  }
                  actions={
                    <RowActions
                      /* Keyed on the flag so a redirect that turns it on remounts the
                         component: `openOnMount` seeds state and is never read again,
                         so a reused instance would ignore it and stay shut. */
                      key={`${testCase.id}-${editId === testCase.id}`}
                      label={testCase.name}
                      title="Edit Test Case"
                      openOnMount={!!error && editId === testCase.id}
                    >
                      <TestCaseForm
                        action={updateAction(testCase.id)}
                        submitLabel="Save"
                        error={editId === testCase.id ? error : undefined}
                        defaults={{
                          name: testCase.name,
                          condition: testCase.condition,
                          preconditions: testCase.preconditions,
                          testData: testCase.testData,
                          expectedResult: testCase.expectedResult,
                          priority: testCase.priority,
                          testType: testCase.testType,
                          status: testCase.status,
                          steps: testCase.steps.map((step) => ({
                            step: step.step,
                            expectedResult: step.expectedResult,
                          })),
                        }}
                      />
                    </RowActions>
                  }
                  detail={
                    <DetailFields>
                      <DetailField label="Expected Result" wide>
                        {testCase.expectedResult}
                      </DetailField>
                      <DetailField label="Condition">{testCase.condition}</DetailField>
                      <DetailField label="Preconditions">{testCase.preconditions}</DetailField>
                      <DetailField label="Test Data">{testCase.testData}</DetailField>
                      <DetailField label="Test Type">{testCase.testType}</DetailField>
                      {ASSIGNEE_ENABLED && (
                        <DetailField label="Assignee">
                          {testCase.assigneeId ?? "Unassigned"}
                        </DetailField>
                      )}
                      <DetailField label="Notes">{testCase.notes}</DetailField>
                      <DetailField label="Test Steps" wide>
                        {testCase.steps.length === 0 ? null : (
                          <ol className="flex flex-col gap-1.5">
                            {testCase.steps.map((step, index) => (
                              <li key={step.id} className="flex gap-2">
                                <span className="w-5 shrink-0 text-muted">{index + 1}.</span>
                                <span>
                                  <span className="whitespace-pre-wrap">{step.step}</span>{" "}
                                  <span className="text-muted">→</span>{" "}
                                  <span className="whitespace-pre-wrap italic">
                                    {step.expectedResult}
                                  </span>
                                </span>
                              </li>
                            ))}
                          </ol>
                        )}
                      </DetailField>
                    </DetailFields>
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        page={testCasePage.page}
        totalPages={testCasePage.totalPages}
        total={testCasePage.total}
        pageSize={testCasePage.pageSize}
      />
    </main>
  );
}
