import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  ALL_MEMBER_ROLES,
  EDITOR_ROLES,
  getProjectMembership,
  requireProjectRoleOrNotFound,
} from "@/lib/rbac";
import {
  archiveTestCase,
  deleteTestCase,
  duplicateTestCase,
  getTestCaseWithProjectId,
  moveTestCase,
  restoreTestCase,
  updateAssignee,
  updateTestResultAndNotes,
} from "@/lib/test-cases";
import { getTestGroupWithProjectId } from "@/lib/test-groups";
import { getScenarioById } from "@/lib/scenarios";
import { getProjectById } from "@/lib/projects";
import { saveAttachment } from "@/lib/attachments";
import { ConfirmForm } from "@/components/ConfirmForm";
import { Breadcrumb } from "@/components/Breadcrumb";
import { nameOr, testCaseBreadcrumb } from "@/lib/breadcrumb";

export default async function TestCaseDetailPage({
  params,
}: {
  params: Promise<{ id: string; scenarioId: string; testGroupId: string; testCaseId: string }>;
}) {
  const { scenarioId, testGroupId, testCaseId } = await params;
  const session = await auth();

  const testCase = await getTestCaseWithProjectId(testCaseId);
  if (!testCase) {
    notFound();
  }
  const projectId = testCase.projectId;

  await requireProjectRoleOrNotFound(session!.user.id, projectId, ALL_MEMBER_ROLES);
  const membership = await getProjectMembership(session!.user.id, projectId);
  const canEditFully = membership?.role === "ADMIN" || membership?.role === "QA_LEAD";
  const [project, scenario] = await Promise.all([
    getProjectById(projectId),
    getScenarioById(scenarioId),
  ]);

  const basePath = `/projects/${projectId}/scenarios/${scenarioId}/test-groups/${testGroupId}/test-cases`;

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
    const targetTestGroup = await getTestGroupWithProjectId(targetTestGroupId);
    if (!targetTestGroup || targetTestGroup.deletedAt) {
      throw new Error("Target Test Group not found or archived");
    }
    await requireProjectRoleOrNotFound(session!.user.id, targetTestGroup.projectId, EDITOR_ROLES);
    await moveTestCase(testCaseId, targetTestGroupId, session!.user.id);
    redirect(
      `/projects/${targetTestGroup.projectId}/scenarios/${targetTestGroup.scenarioId}/test-groups/${targetTestGroupId}/test-cases/${testCaseId}`,
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
    <main>
      <Breadcrumb
        segments={testCaseBreadcrumb(
          { id: projectId, name: nameOr(project, projectId) },
          { id: scenarioId, name: nameOr(scenario, scenarioId) },
          testCase.testGroup,
          testCase,
        )}
      />
      <p>
        <Link href={basePath}>← Back to Test Cases</Link>
      </p>
      <h1>{testCase.name}</h1>
      {testCase.deletedAt && <p role="status">Archived</p>}
      <p>Priority: {testCase.priority}</p>
      <p>Test Type: {testCase.testType ?? "—"}</p>
      <p>Status: {testCase.status}</p>
      <p>Condition: {testCase.condition ?? "—"}</p>
      <p>Preconditions: {testCase.preconditions ?? "—"}</p>
      <p>Test Data: {testCase.testData ?? "—"}</p>
      <p>Expected Result: {testCase.expectedResult}</p>
      <p>Assignee: {testCase.assigneeId ?? "Unassigned"}</p>

      <h2>Test Steps</h2>
      <ol>
        {testCase.steps.map((step) => (
          <li key={step.id}>
            {step.step} — <em>{step.expectedResult}</em>
          </li>
        ))}
      </ol>

      <h2>Test Result</h2>
      <p>Current: {testCase.testResult}</p>
      <form action={updateResult}>
        <label>
          Test Result
          <select name="testResult" defaultValue={testCase.testResult}>
            <option value="NOT_RUN">Not Run</option>
            <option value="PASSED">Passed</option>
            <option value="FAILED">Failed</option>
            <option value="BLOCKED">Blocked</option>
            <option value="SKIPPED">Skipped</option>
          </select>
        </label>
        <label>
          Notes
          <textarea name="notes" defaultValue={testCase.notes ?? ""} />
        </label>
        <button type="submit">Update Result</button>
      </form>

      <h2>Attachments</h2>
      <ul>
        {testCase.attachments.map((attachment) => (
          <li key={attachment.id}>{attachment.fileName}</li>
        ))}
      </ul>
      <form action={uploadAttachment} encType="multipart/form-data">
        <input type="file" name="file" required />
        <button type="submit">Upload Attachment</button>
      </form>

      {canEditFully && (
        <>
          <h2>Manage</h2>
          <p>
            <Link href={`${basePath}/${testCase.id}/edit`}>Edit</Link>
          </p>

          <form action={changeAssignee}>
            <label>
              Assignee (User ID)
              <input name="assigneeId" defaultValue={testCase.assigneeId ?? ""} />
            </label>
            <button type="submit">Change Assignee</button>
          </form>

          <h3>Move to another Test Group</h3>
          <ConfirmForm action={move} confirmMessage="Move this Test Case?">
            <label>
              Target Test Group ID
              <input name="targetTestGroupId" required />
            </label>
            <button type="submit">Move</button>
          </ConfirmForm>

          <ConfirmForm action={duplicate} confirmMessage="Duplicate this Test Case?">
            <button type="submit">Duplicate</button>
          </ConfirmForm>

          {testCase.deletedAt ? (
            <ConfirmForm action={restore} confirmMessage="Restore this Test Case?">
              <button type="submit">Restore</button>
            </ConfirmForm>
          ) : (
            <ConfirmForm
              action={archive}
              confirmMessage="Archive this Test Case? It can be restored later."
            >
              <button type="submit">Archive</button>
            </ConfirmForm>
          )}

          <ConfirmForm
            action={removeForever}
            confirmMessage="Delete this Test Case? This cannot be undone from the UI."
          >
            <button type="submit">Delete</button>
          </ConfirmForm>
        </>
      )}
    </main>
  );
}
