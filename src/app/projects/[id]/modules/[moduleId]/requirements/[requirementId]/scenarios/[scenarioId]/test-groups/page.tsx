import Link from "next/link";
import { auth } from "@/auth";
import { ALL_MEMBER_ROLES, EDITOR_ROLES, requireProjectRoleOrNotFound } from "@/lib/rbac";
import {
  getScenarioById,
  getScenarioLocation,
  listScenariosForProject,
} from "@/lib/scenarios";
import {
  ValidationError,
  archiveTestGroup,
  createTestGroup,
  deleteTestGroup,
  duplicateTestGroup,
  getTestGroupDescendantCountsForMany,
  listTestGroupsForScenario,
  listTestGroupsForScenarioPage,
  moveTestGroup,
  reorderTestGroups,
  restoreTestGroup,
  updateTestGroup,
} from "@/lib/test-groups";
import { notFound, redirect } from "next/navigation";
import { Breadcrumb } from "@/components/Breadcrumb";
import { nameOr, testGroupsListBreadcrumb } from "@/lib/breadcrumb";
import { withToast } from "@/lib/toast";
import { testGroupsListHref } from "@/lib/hrefs";
import { getProjectById } from "@/lib/projects";
import { getRequirementById } from "@/lib/requirements";
import { PageHeader } from "@/components/ui/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { TestGroupForm } from "@/components/forms/TestGroupForm";
import { Badge, workflowStatusTone } from "@/components/ui/Badge";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { SubmitAction } from "@/components/SubmitButton";
import { FilterForm } from "@/components/FilterForm";
import { Select } from "@/components/ui/Select";
import { Pagination } from "@/components/ui/Pagination";
import { ResultCount } from "@/components/ui/ResultCount";
import { DialogCloseButton } from "@/components/ui/DialogCloseButton";
import { DetailField, DetailFields } from "@/components/ui/DetailFields";
import { ExpandableRow } from "@/components/ui/ExpandableRow";
import { RowActions } from "@/components/ui/RowActions";
import { EntityManageSection } from "@/components/EntityManageSection";
import { WORKFLOW_STATUS_OPTIONS } from "@/lib/enums";
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
import type { WorkflowStatus } from "@/generated/prisma/client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ scenarioId: string }>;
}) {
  const { scenarioId } = await params;
  const scenario = await getScenarioById(scenarioId);
  return { title: scenario ? `Test Groups · ${scenario.name}` : "Test Groups" };
}

export default async function TestGroupsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; moduleId: string; requirementId: string; scenarioId: string }>;
  searchParams: Promise<{
    error?: string;
    /** Surfaced inside the row's Manage section when a Move is rejected. */
    moveError?: string;
    search?: string;
    status?: string;
    /** `?archived=1` lists archived Test Groups so they can be restored. */
    archived?: string;
    page?: string;
    pageSize?: string;
    /** Which row's inline Edit modal to reopen after a failed save — without
     * it a validation error would reopen every row's modal at once. */
    editId?: string;
  }>;
}) {
  const { id: projectId, moduleId, requirementId, scenarioId } = await params;
  const { error, moveError, search, status, archived, page, pageSize, editId } =
    await searchParams;
  const showArchived = archived === "1";
  const hasFilters = Boolean(search || status || showArchived);
  const session = await auth();

  const scenario = await getScenarioById(scenarioId);
  // The ancestors in the URL must be this Scenario's actual ancestors, or the
  // breadcrumb would climb to a Requirement that doesn't own it.
  if (
    !scenario ||
    scenario.projectId !== projectId ||
    scenario.requirementId !== requirementId
  ) {
    notFound();
  }
  const requirement = await getRequirementById(requirementId);
  if (!requirement || requirement.moduleId !== moduleId || !requirement.module) {
    notFound();
  }

  await requireProjectRoleOrNotFound(session!.user.id, projectId, ALL_MEMBER_ROLES);

  const result = await listTestGroupsForScenarioPage(scenarioId, {
    search,
    status: status as WorkflowStatus | undefined,
    archived: showArchived,
    page: page ? Number(page) : undefined,
    pageSize: pageSize ? Number(pageSize) : undefined,
  });
  const testGroups = result.items;

  // Batched, not per row — one query per row would be N round trips.
  const [project, descendantCounts, projectScenarios] = await Promise.all([
    getProjectById(projectId),
    getTestGroupDescendantCountsForMany(testGroups.map((testGroup) => testGroup.id)),
    listScenariosForProject(projectId),
  ]);
  const moveTargets = projectScenarios
    .filter((target) => target.id !== scenarioId)
    .map((target) => ({ value: target.id, label: target.name }));

  /* Plain strings only: a server action may close over serialisable values,
   * and capturing a helper function stops React encoding the action at all,
   * which leaves the form working only once JS has loaded. */
  const listQueryString = new URLSearchParams(
    Object.entries({ search, status, archived, page, pageSize }).filter(
      (entry): entry is [string, string] => Boolean(entry[1]),
    ),
  ).toString();
  const listPath = testGroupsListHref({ projectId, moduleId, requirementId, scenarioId });
  const listHref = listQueryString ? `${listPath}?${listQueryString}` : listPath;

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
        // The target Scenario may sit under a different Requirement, so its
        // path is resolved rather than rebuilt from this page's ids.
        const location = await getScenarioLocation(targetScenarioId);
        redirect(location ? testGroupsListHref(location) : listPath);
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
        redirect(withToast(listHref, "Test Group deleted"));
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
          const query = new URLSearchParams(listQueryString);
          query.set("error", err.message);
          query.set("editId", testGroupId);
          redirect(`${listPath}?${query}`);
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
        const query = new URLSearchParams(listQueryString);
        query.set("error", err.message);
        redirect(`${listPath}?${query}`);
      }
      throw err;
    }

    redirect(withToast(listHref, "Test Group created"));
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
    redirect(listHref);
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
          requirement.module,
          requirement,
          scenario,
        )}
      />
      <PageHeader
        title={
          <>
            Test Groups{" "}
            <span className="text-base font-normal text-muted">({scenario.name})</span>
          </>
        }
        actions={
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
            Status
            <Select
              name="status"
              defaultValue={status ?? ""}
              options={[{ value: "", label: "All" }, ...WORKFLOW_STATUS_OPTIONS]}
              ariaLabel="Status"
              className="max-w-44"
            />
          </label>
          <label className={labelClass}>
            Show
            <Select
              name="archived"
              defaultValue={archived ?? ""}
              options={[
                { value: "", label: "Active" },
                { value: "1", label: "Archived" },
              ]}
              ariaLabel="Show"
              className="max-w-36"
            />
          </label>
        </FilterForm>
        <ResultCount total={result.total} />
      </div>

      {testGroups.length === 0 ? (
        <p className={mutedTextClass}>
          {showArchived
            ? "No archived Test Groups."
            : hasFilters
              ? "No Test Groups match your search/filters."
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
                <th className={thCenterClass}>Status</th>
                <th className={thCenterClass}>Reorder</th>
                <th className={thCenterClass}>Actions</th>
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
                        <span className="ml-2 text-xs text-muted">
                          {descendantCounts.get(testGroup.id)?.testCases ?? 0} test case(s)
                        </span>
                      </td>
                      <td className={tdCenterClass}>
                        <Badge tone={workflowStatusTone(testGroup.status)}>
                          {testGroup.status}
                        </Badge>
                      </td>
                      <td className={tdCenterClass}>
                        <div className="flex items-center justify-center gap-1">
                          <form action={moveUp}>
                            <input type="hidden" name="id" value={testGroup.id} />
                            <SubmitAction
                              className="rounded-md border border-border px-2 py-1 text-sm text-muted transition-opacity hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              ↑
                            </SubmitAction>
                          </form>
                          <form action={moveDown}>
                            <input type="hidden" name="id" value={testGroup.id} />
                            <SubmitAction
                              className="rounded-md border border-border px-2 py-1 text-sm text-muted transition-opacity hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              ↓
                            </SubmitAction>
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
                            <FormSubmitButton formId={`edit-test-group-${testGroup.id}`}>
                              Save
                            </FormSubmitButton>
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

      <Pagination
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
        pageSize={result.pageSize}
      />
    </main>
  );
}
