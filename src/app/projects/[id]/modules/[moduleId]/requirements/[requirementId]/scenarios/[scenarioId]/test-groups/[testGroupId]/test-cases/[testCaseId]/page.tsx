import { TEST_RESULT_OPTIONS } from "@/lib/enums";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  ALL_MEMBER_ROLES,
  EDITOR_ROLES,
  getProjectMembership,
  requireProjectRoleOrNotFound,
} from "@/lib/rbac";
import {
  ValidationError,
  archiveTestCase,
  deleteTestCase,
  duplicateTestCase,
  getTestCaseWithProjectId,
  moveTestCase,
  restoreTestCase,
  updateAssignee,
  updateTestCase,
  updateTestResultAndNotes,
} from "@/lib/test-cases";
import { parseStepsJson } from "@/lib/test-case-form";
import { getTestGroupWithProjectId, listTestGroupsForProject } from "@/lib/test-groups";
import { getScenarioById, getScenarioLocation } from "@/lib/scenarios";
import { getProjectById } from "@/lib/projects";
import { saveAttachment } from "@/lib/attachments";
import { ConfirmForm } from "@/components/ConfirmForm";
import { Breadcrumb } from "@/components/Breadcrumb";
import { nameOr, testCaseBreadcrumb } from "@/lib/breadcrumb";
import { testCasesListHref } from "@/lib/hrefs";
import { getRequirementById } from "@/lib/requirements";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { Card } from "@/components/ui/Card";
import { Button, IconButton } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { TestCaseForm } from "@/components/forms/TestCaseForm";
import { Badge, priorityTone, testResultTone, workflowStatusTone } from "@/components/ui/Badge";
import { EditIcon, TrashIcon } from "@/components/icons";
import { inputClass, labelClass, pageClass, textareaClass } from "@/lib/ui";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ testCaseId: string }>;
}) {
  const { testCaseId } = await params;
  const testCase = await getTestCaseWithProjectId(testCaseId);
  return { title: testCase?.name ?? "Test Case" };
}

export default async function TestCaseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{
    id: string;
    moduleId: string;
    requirementId: string;
    scenarioId: string;
    testGroupId: string;
    testCaseId: string;
  }>;
  searchParams: Promise<{ error?: string; moveError?: string }>;
}) {
  const { moduleId, requirementId, scenarioId, testGroupId, testCaseId } = await params;
  const { error, moveError } = await searchParams;
  const session = await auth();

  const testCase = await getTestCaseWithProjectId(testCaseId);
  if (!testCase) {
    notFound();
  }
  const projectId = testCase.projectId;

  await requireProjectRoleOrNotFound(session!.user.id, projectId, ALL_MEMBER_ROLES);
  const membership = await getProjectMembership(session!.user.id, projectId);
  const canEditFully = membership?.role === "ADMIN" || membership?.role === "QA_LEAD";
  const [project, scenario, requirement, allTestGroups] = await Promise.all([
    getProjectById(projectId),
    getScenarioById(scenarioId),
    getRequirementById(requirementId),
    listTestGroupsForProject(projectId),
  ]);

  // The ancestors in the URL must be this Test Case's actual ancestors.
  if (
    testCase.testGroup.scenarioId !== scenarioId ||
    !scenario ||
    scenario.requirementId !== requirementId ||
    !requirement ||
    requirement.moduleId !== moduleId ||
    !requirement.module
  ) {
    notFound();
  }
  const moveTargets = allTestGroups.filter((tg) => tg.id !== testGroupId);

  const basePath = testCasesListHref({
    projectId,
    moduleId,
    requirementId,
    scenarioId,
    testGroupId,
  });

  async function update(formData: FormData) {
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
        redirect(`${basePath}/${testCaseId}?error=${encodeURIComponent(err.message)}`);
      }
      throw err;
    }

    redirect(`${basePath}/${testCaseId}`);
  }

  async function updateResult(formData: FormData) {
    "use server";
    const session = await auth();
    await requireProjectRoleOrNotFound(session!.user.id, projectId, [
      ...EDITOR_ROLES,
      "TESTER",
    ]);
    await updateTestResultAndNotes(
      testCaseId,
      {
        testResult: formData.get("testResult") as never,
        notes: (formData.get("notes") as string) || null,
      },
      session!.user.id,
    );
    redirect(`${basePath}/${testCaseId}`);
  }

  async function uploadAttachment(formData: FormData) {
    "use server";
    const session = await auth();
    await requireProjectRoleOrNotFound(session!.user.id, projectId, [
      ...EDITOR_ROLES,
      "TESTER",
    ]);
    const file = formData.get("file");
    if (file instanceof File && file.size > 0) {
      await saveAttachment(testCaseId, file, session!.user.id);
    }
    redirect(`${basePath}/${testCaseId}`);
  }

  async function changeAssignee(formData: FormData) {
    "use server";
    const session = await auth();
    await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
    await updateAssignee(testCaseId, (formData.get("assigneeId") as string) || null, session!.user.id);
    redirect(`${basePath}/${testCaseId}`);
  }

  async function move(formData: FormData) {
    "use server";
    const session = await auth();
    await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
    const targetTestGroupId = formData.get("targetTestGroupId") as string;
    const targetTestGroup = targetTestGroupId ? await getTestGroupWithProjectId(targetTestGroupId) : null;
    if (!targetTestGroup || targetTestGroup.deletedAt) {
      redirect(
        `${basePath}/${testCaseId}?moveError=${encodeURIComponent("Target Test Group not found or archived")}`,
      );
    }
    await requireProjectRoleOrNotFound(session!.user.id, targetTestGroup.projectId, EDITOR_ROLES);
    await moveTestCase(testCaseId, targetTestGroupId, session!.user.id);
    const location = await getScenarioLocation(targetTestGroup.scenarioId);
    redirect(
      location
        ? `${testCasesListHref({ ...location, testGroupId: targetTestGroupId })}/${testCaseId}`
        : `${basePath}/${testCaseId}`,
    );
  }

  async function duplicate() {
    "use server";
    const session = await auth();
    await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
    const copy = await duplicateTestCase(testCaseId, session!.user.id);
    redirect(`${basePath}/${copy.id}`);
  }

  async function archive() {
    "use server";
    const session = await auth();
    await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
    await archiveTestCase(testCaseId, session!.user.id);
    redirect(`${basePath}/${testCaseId}`);
  }

  async function restore() {
    "use server";
    const session = await auth();
    await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
    await restoreTestCase(testCaseId, session!.user.id);
    redirect(`${basePath}/${testCaseId}`);
  }

  async function removeForever() {
    "use server";
    const session = await auth();
    await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
    await deleteTestCase(testCaseId, session!.user.id, true);
    redirect(basePath);
  }

  return (
    <main className={pageClass}>
      <Breadcrumb
        segments={testCaseBreadcrumb(
          { id: projectId, name: nameOr(project, projectId) },
          requirement.module,
          requirement,
          scenario,
          testCase.testGroup,
          testCase,
        )}
      />
      <PageHeader
        title={testCase.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={priorityTone(testCase.priority)}>{testCase.priority}</Badge>
            <Badge tone={workflowStatusTone(testCase.status)}>{testCase.status}</Badge>
            {testCase.testType && <Badge tone="gray">{testCase.testType}</Badge>}
            {testCase.deletedAt && <Badge tone="gray">Archived</Badge>}
          </span>
        }
        actions={
          canEditFully && (
            <Modal
              triggerLabel="Edit"
              triggerVariant="secondary"
              triggerIcon={<EditIcon />}
              title="Edit Test Case"
              openOnMount={!!error}
            >
              <TestCaseForm
                action={update}
                submitLabel="Save"
                error={error}
                defaults={{
                  name: testCase.name,
                  condition: testCase.condition,
                  preconditions: testCase.preconditions,
                  testData: testCase.testData,
                  expectedResult: testCase.expectedResult,
                  priority: testCase.priority,
                  testType: testCase.testType,
                  status: testCase.status,
                  steps: testCase.steps.map((s) => ({ step: s.step, expectedResult: s.expectedResult })),
                }}
              />
            </Modal>
          )
        }
      />

      <Card className="flex flex-col gap-2 text-sm">
        <p>
          <span className="text-muted">Condition:</span> {testCase.condition ?? "—"}
        </p>
        <p>
          <span className="text-muted">Preconditions:</span> {testCase.preconditions ?? "—"}
        </p>
        <p>
          <span className="text-muted">Test Data:</span> {testCase.testData ?? "—"}
        </p>
        <p>
          <span className="text-muted">Expected Result:</span> {testCase.expectedResult}
        </p>
        <p>
          <span className="text-muted">Assignee:</span> {testCase.assigneeId ?? "Unassigned"}
        </p>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-foreground">Test Steps</h2>
        <ol className="mt-3 flex flex-col gap-2">
          {testCase.steps.map((step, index) => (
            <li key={step.id} className="flex gap-3 text-sm">
              <span className="w-5 shrink-0 text-muted">{index + 1}.</span>
              <span>
                <span className="whitespace-pre-wrap">{step.step}</span>{" "}
                <span className="text-muted">→</span>{" "}
                <span className="whitespace-pre-wrap italic">{step.expectedResult}</span>
              </span>
            </li>
          ))}
        </ol>
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Test Result</h2>
          <Badge tone={testResultTone(testCase.testResult)}>
            {testCase.testResult.replace(/_/g, " ")}
          </Badge>
        </div>
        <form action={updateResult} className="mt-3 flex flex-col gap-4">
          <label className={labelClass}>
            Test Result
            <Select
              name="testResult"
              defaultValue={testCase.testResult}
              options={TEST_RESULT_OPTIONS}
              ariaLabel="Test Result"
            />
          </label>
          <label className={labelClass}>
            Notes
            <textarea name="notes" defaultValue={testCase.notes ?? ""} className={textareaClass} />
          </label>
          <Button type="submit" className="self-start">
            Update Result
          </Button>
        </form>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-foreground">Attachments</h2>
        {testCase.attachments.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1 text-sm">
            {testCase.attachments.map((attachment) => (
              <li key={attachment.id} className="text-foreground">
                {attachment.fileName}
              </li>
            ))}
          </ul>
        )}
        <form action={uploadAttachment} encType="multipart/form-data" className="mt-3 flex items-center gap-3">
          <input
            type="file"
            name="file"
            required
            className="text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-brand file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-brand-hover"
          />
          <Button type="submit" variant="secondary">
            Upload Attachment
          </Button>
        </form>
      </Card>

      {canEditFully && (
        <Card className="flex flex-col gap-5">
          <h2 className="text-sm font-semibold text-foreground">Manage</h2>

          <form action={changeAssignee} className="flex flex-wrap items-end gap-3">
            <label className={`${labelClass} max-w-xs`}>
              Assignee (User ID)
              <input name="assigneeId" defaultValue={testCase.assigneeId ?? ""} className={inputClass} />
            </label>
            <Button type="submit" variant="secondary">
              Change Assignee
            </Button>
          </form>

          {moveError && (
            <p role="alert" className="rounded-md bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-900/40 dark:text-red-300">
              {moveError}
            </p>
          )}
          <ConfirmForm action={move} confirmMessage="Move this Test Case?">
            <div className="flex flex-wrap items-end gap-3">
              <label className={`${labelClass} max-w-sm`}>
                Move to another Test Group
                <Select
                  name="targetTestGroupId"
                  defaultValue=""
                  required
                  options={[
                    { value: "", label: "Select a Test Group…" },
                    ...moveTargets.map((testGroup) => ({
                      value: testGroup.id,
                      label: `${testGroup.scenario.name} → ${testGroup.name}`,
                    })),
                  ]}
                  ariaLabel="Move to another Test Group"
                />
              </label>
              <Button type="submit" variant="secondary">
                Move
              </Button>
            </div>
          </ConfirmForm>

          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            <ConfirmForm action={duplicate} confirmMessage="Duplicate this Test Case?">
              <Button type="submit" variant="secondary">
                Duplicate
              </Button>
            </ConfirmForm>

            {testCase.deletedAt ? (
              <ConfirmForm action={restore} confirmMessage="Restore this Test Case?">
                <Button type="submit" variant="secondary">
                  Restore
                </Button>
              </ConfirmForm>
            ) : (
              <ConfirmForm
                action={archive}
                confirmMessage="Archive this Test Case? It can be restored later."
              >
                <Button type="submit" variant="secondary">
                  Archive
                </Button>
              </ConfirmForm>
            )}

            <ConfirmForm
              action={removeForever}
              confirmMessage="Delete this Test Case? This cannot be undone from the UI."
              variant="danger"
            >
              <IconButton
                type="submit"
                variant="danger"
                iconSize="lg"
                aria-label="Delete"
                title="Delete"
              >
                <TrashIcon />
              </IconButton>
            </ConfirmForm>
          </div>
        </Card>
      )}
    </main>
  );
}
