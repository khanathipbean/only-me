import Link from "next/link";
import { auth } from "@/auth";
import { ALL_MEMBER_ROLES, EDITOR_ROLES, requireProjectRoleOrNotFound } from "@/lib/rbac";
import { getScenarioById, listScenariosForProject } from "@/lib/scenarios";
import { getProjectById } from "@/lib/projects";
import {
  ValidationError,
  archiveTestGroup,
  createTestGroup,
  deleteTestGroup,
  duplicateTestGroup,
  getTestGroupDescendantCountsForMany,
  listTestGroupsForScenario,
  moveTestGroup,
  reorderTestGroups,
  restoreTestGroup,
  updateTestGroup,
} from "@/lib/test-groups";
import { notFound, redirect } from "next/navigation";
import { Breadcrumb } from "@/components/Breadcrumb";
import { nameOr, testGroupsListBreadcrumb } from "@/lib/breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { TestGroupForm } from "@/components/forms/TestGroupForm";
import { Badge, workflowStatusTone } from "@/components/ui/Badge";
import { Button, LinkButton } from "@/components/ui/Button";
import { DialogCloseButton } from "@/components/ui/DialogCloseButton";
import { DetailField, DetailFields, ExpandableRow } from "@/components/ui/ExpandableRow";
import { RowActions } from "@/components/ui/RowActions";
import { EntityManageSection } from "@/components/EntityManageSection";
import {
  mutedTextClass,
  pageClass,
  tableClass,
  tableWrapClass,
  tdClass,
  thClass,
} from "@/lib/ui";

export default async function TestGroupsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; scenarioId: string }>;
  searchParams: Promise<{
    error?: string;
    /** Surfaced inside the row's Manage section when a Move is rejected. */
    moveError?: string;
    /** `?archived=1` lists archived Test Groups so they can be restored. */
    archived?: string;
    /** Which row's inline Edit modal to reopen after a failed save — without
     * it a validation error would reopen every row's modal at once. */
    editId?: string;
  }>;
}) {
  const { id: projectId, scenarioId } = await params;
  const { error, moveError, archived, editId } = await searchParams;
  const showArchived = archived === "1";
  const session = await auth();

  const scenario = await getScenarioById(scenarioId);
  if (!scenario) {
    notFound();
  }

  await requireProjectRoleOrNotFound(session!.user.id, projectId, ALL_MEMBER_ROLES);

  const project = await getProjectById(projectId);
  const testGroups = await listTestGroupsForScenario(scenarioId, { archived: showArchived });

  // Batched, not per row — one query per row would be N round trips.
  const [descendantCounts, projectScenarios] = await Promise.all([
    getTestGroupDescendantCountsForMany(testGroups.map((testGroup) => testGroup.id)),
    listScenariosForProject(projectId),
  ]);
  const moveTargets = projectScenarios
    .filter((target) => target.id !== scenarioId)
    .map((target) => ({ value: target.id, label: target.name }));

  const listPath = `/projects/${projectId}/scenarios/${scenarioId}/test-groups`;
  const listHref = showArchived ? `${listPath}?archived=1` : listPath;

  function impact(testGroupId: string) {
    const counts = descendantCounts.get(testGroupId) ?? { testCases: 0 };
    return `${counts.testCases} Test Case(s)`;
  }

  /** Manage actions bound to one row. They live here now that the Test Group
   * detail page is gone — its only unique content was this Manage card. */
  function manageActions(testGroupId: string) {
    return {
      async move(formData: FormData) {
        "use server";
        const session = await auth();
        await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
        const actorId = session!.user.id;
        const targetScenarioId = formData.get("targetScenarioId") as string;
        const target = targetScenarioId ? await getScenarioById(targetScenarioId) : null;
        if (!target || target.deletedAt) {
          redirect(
            `${listPath}?moveError=${encodeURIComponent("Target Scenario not found or archived")}&editId=${testGroupId}`,
          );
        }
        await requireProjectRoleOrNotFound(actorId, target.projectId, EDITOR_ROLES);
        await moveTestGroup(testGroupId, targetScenarioId, actorId);
        redirect(`/projects/${target.projectId}/scenarios/${targetScenarioId}/test-groups`);
      },
      async duplicate() {
        "use server";
        const session = await auth();
        await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
        const actorId = session!.user.id;
        await duplicateTestGroup(testGroupId, actorId);
        redirect(listHref);
      },
      async archive() {
        "use server";
        const session = await auth();
        await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
        const actorId = session!.user.id;
        await archiveTestGroup(testGroupId, actorId);
        redirect(listHref);
      },
      async restore() {
        "use server";
        const session = await auth();
        await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
        const actorId = session!.user.id;
        await restoreTestGroup(testGroupId, actorId);
        redirect(listHref);
      },
      async removeForever() {
        "use server";
        const session = await auth();
        await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
        const actorId = session!.user.id;
        await deleteTestGroup(testGroupId, actorId, true);
        redirect(listHref);
      },
    };
  }

  /** Bound per row: an inline Edit modal on a list needs one action per Test
   * Group, unlike the detail page where a single closed-over id suffices. */
  function updateAction(testGroupId: string) {
    return async function update(formData: FormData) {
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
            `${listPath}?error=${encodeURIComponent(err.message)}&editId=${testGroupId}`,
          );
        }
        throw err;
      }

      redirect(listPath);
    };
  }

  async function create(formData: FormData) {
    "use server";

    const session = await auth();
    await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);

    try {
      await createTestGroup(
        scenarioId,
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
          `/projects/${projectId}/scenarios/${scenarioId}/test-groups?error=${encodeURIComponent(err.message)}`,
        );
      }
      throw err;
    }

    redirect(listHref);
  }

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
    <main className={pageClass}>
      <Breadcrumb
        segments={testGroupsListBreadcrumb(
          { id: projectId, name: nameOr(project, projectId) },
          scenario,
        )}
      />
      <PageHeader
        title={`Test Groups for ${scenario.name}`}
        actions={
          <>
            {/* The only route to an archived Test Group now that the detail
                page is gone; without it "restorable later" wouldn't be true. */}
            <LinkButton href={showArchived ? listPath : `${listPath}?archived=1`} variant="secondary">
              {showArchived ? "Show active" : "Show archived"}
            </LinkButton>
            <Modal
            triggerLabel="+ New Test Group"
            title="New Test Group"
            openOnMount={!!error && !editId}
          >
            <TestGroupForm
              action={create}
              submitLabel="Create Test Group"
              error={editId ? undefined : error}
            />
            </Modal>
          </>
        }
      />

      {testGroups.length === 0 ? (
        <p className={mutedTextClass}>
          {showArchived
            ? "No archived Test Groups."
            : "No Test Groups yet. Create one to get started."}
        </p>
      ) : (
        <div className={tableWrapClass}>
          <table className={tableClass}>
            <colgroup>
              <col className="w-[10%]" />
              <col className="w-[38%]" />
              <col className="w-[18%]" />
              <col className="w-[20%]" />
              <col className="w-[14%]" />
            </colgroup>
            <thead>
              <tr>
                <th className={thClass}>Sequence</th>
                <th className={thClass}>Name</th>
                <th className={thClass}>Status</th>
                <th className={thClass}>Reorder</th>
                <th className={`${thClass} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {testGroups.map((testGroup) => (
                <ExpandableRow
                  key={testGroup.id}
                  colSpan={5}
                  detailLabel={testGroup.name}
                  cells={
                    <>
                      <td className={`${tdClass} text-muted`}>{testGroup.sequence}</td>
                      <td className={tdClass}>
                        {/* Straight to the children, not this Test Group's own
                            detail page: drilling down is the common move, and
                            the panel below covers a quick look. */}
                        <Link
                          href={`${listPath}/${testGroup.id}/test-cases`}
                          className="font-medium text-foreground hover:text-brand hover:underline"
                        >
                          {testGroup.name}
                        </Link>
                      </td>
                      <td className={tdClass}>
                        <Badge tone={workflowStatusTone(testGroup.status)}>
                          {testGroup.status}
                        </Badge>
                      </td>
                      <td className={tdClass}>
                        <div className="flex items-center gap-1">
                          <form action={moveUp}>
                            <input type="hidden" name="id" value={testGroup.id} />
                            <button
                              type="submit"
                              className="rounded-md border border-border px-2 py-1 text-sm text-muted hover:text-foreground"
                            >
                              ↑
                            </button>
                          </form>
                          <form action={moveDown}>
                            <input type="hidden" name="id" value={testGroup.id} />
                            <button
                              type="submit"
                              className="rounded-md border border-border px-2 py-1 text-sm text-muted hover:text-foreground"
                            >
                              ↓
                            </button>
                          </form>
                        </div>
                      </td>
                    </>
                  }
                  actions={
                    <RowActions
                      /* Keyed on the flag so a redirect that turns it on remounts the
                         component: `openOnMount` seeds state and is never read again,
                         so a reused instance would ignore it and stay shut. */
                      key={`${testGroup.id}-${editId === testGroup.id}`}
                      label={testGroup.name}
                      title="Edit Test Group"
                      openOnMount={!!error && editId === testGroup.id}
                    >
                      <TestGroupForm
                        action={updateAction(testGroup.id)}
                        submitLabel="Save"
                        formId={`edit-test-group-${testGroup.id}`}
                        hideActions
                        error={editId === testGroup.id ? error : undefined}
                        defaults={{
                          name: testGroup.name,
                          description: testGroup.description,
                          testObjective: testGroup.testObjective,
                          status: testGroup.status,
                        }}
                      />
                      <EntityManageSection
                        moveLabel="Move to another Scenario"
                        moveFieldName="targetScenarioId"
                        moveOptions={moveTargets}
                        movePlaceholder="Select a Scenario…"
                        moveAction={manageActions(testGroup.id).move}
                        moveConfirm={`Move this Test Group? It carries ${impact(testGroup.id)} with it.`}
                        moveError={editId === testGroup.id ? moveError : undefined}
                        duplicateAction={manageActions(testGroup.id).duplicate}
                        duplicateConfirm="Duplicate this Test Group?"
                        archiveAction={manageActions(testGroup.id).archive}
                        archiveConfirm={`Archive this Test Group? It carries ${impact(testGroup.id)}, kept and restorable later.`}
                        restoreAction={manageActions(testGroup.id).restore}
                        restoreConfirm="Restore this Test Group?"
                        deleteAction={manageActions(testGroup.id).removeForever}
                        deleteConfirm={`Delete this Test Group? It carries ${impact(testGroup.id)}. This cannot be undone from the UI.`}
                        isArchived={showArchived}
                        trailing={
                          <>
                            <DialogCloseButton />
                            <Button type="submit" form={`edit-test-group-${testGroup.id}`}>
                              Save
                            </Button>
                          </>
                        }
                      />
                    </RowActions>
                  }
                  detail={
                    <DetailFields>
                      <DetailField label="Test Objective" wide>
                        {testGroup.testObjective}
                      </DetailField>
                      <DetailField label="Description" wide>
                        {testGroup.description}
                      </DetailField>
                      <DetailField label="Sequence">{testGroup.sequence}</DetailField>
                    </DetailFields>
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
