import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ALL_MEMBER_ROLES, EDITOR_ROLES, requireProjectRoleOrNotFound } from "@/lib/rbac";
import {
  ValidationError,
  archiveScenario,
  createScenario,
  deleteScenario,
  duplicateScenario,
  getScenarioDescendantCountsForMany,
  isScenarioSortField,
  listScenariosForProject,
  moveScenario,
  restoreScenario,
  updateScenario,
} from "@/lib/scenarios";
import { getProjectById, listProjectsForUserWithRole } from "@/lib/projects";
import { Button } from "@/components/ui/Button";
import { DialogCloseButton } from "@/components/ui/DialogCloseButton";
import { EntityManageSection } from "@/components/EntityManageSection";
import { Breadcrumb } from "@/components/Breadcrumb";
import { FilterForm } from "@/components/FilterForm";
import { nameOr, scenariosListBreadcrumb } from "@/lib/breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { ScenarioForm } from "@/components/forms/ScenarioForm";
import { Badge, priorityTone, workflowStatusTone } from "@/components/ui/Badge";
import { DetailField, DetailFields, ExpandableRow } from "@/components/ui/ExpandableRow";
import { RowActions } from "@/components/ui/RowActions";
import {
  labelClass,
  mutedTextClass,
  pageClass,
  inputClass,
  tableClass,
  tableWrapClass,
  tdClass,
  thClass,
} from "@/lib/ui";
import type { Priority, WorkflowStatus } from "@/generated/prisma/client";

export default async function ScenariosPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    search?: string;
    status?: string;
    priority?: string;
    sortBy?: string;
    sortOrder?: string;
    /** `?archived=1` lists archived Scenarios so they can be restored. */
    archived?: string;
    error?: string;
    /** Surfaced inside the row's Manage section when a Move is rejected. */
    moveError?: string;
    /** Which row's inline Edit modal to reopen after a failed save. Without it
     * a validation error would reopen every row's modal at once, since each
     * only knows `?error=` is present. */
    editId?: string;
    /** `?new=1` opens the New Scenario modal straight away — lets other pages
     * (e.g. the Dashboard's empty state) link to "create a Scenario" without
     * needing a standalone create page. */
    new?: string;
  }>;
}) {
  const { id: projectId } = await params;
  const {
    search,
    status,
    priority,
    sortBy,
    sortOrder,
    archived,
    error,
    moveError,
    editId,
    new: openNew,
  } = await searchParams;
  const session = await auth();

  await requireProjectRoleOrNotFound(session!.user.id, projectId, ALL_MEMBER_ROLES);

  const project = await getProjectById(projectId);
  const showArchived = archived === "1";
  const hasFilters = Boolean(search || status || priority);
  const scenarios = await listScenariosForProject(projectId, {
    search,
    status: status as WorkflowStatus | undefined,
    priority: priority as Priority | undefined,
    sortBy: isScenarioSortField(sortBy) ? sortBy : undefined,
    sortOrder: sortOrder === "asc" ? "asc" : undefined,
    archived: showArchived,
  });

  // Batched, not per row: the Manage section needs each Scenario's descendant
  // counts to word its confirmations, and one query per row would be N round
  // trips to a remote database.
  const [descendantCounts, editableProjects] = await Promise.all([
    getScenarioDescendantCountsForMany(scenarios.map((scenario) => scenario.id)),
    listProjectsForUserWithRole(session!.user.id, EDITOR_ROLES),
  ]);
  const moveTargets = editableProjects
    .filter((target) => target.id !== projectId)
    .map((target) => ({ value: target.id, label: `${target.code} — ${target.name}` }));

  /** The list URL with the active filters/sort kept, so an inline save (or a
   * failed one) returns to the same view the user was looking at. */
  const listQuery = new URLSearchParams(
    Object.entries({ search, status, priority, sortBy, sortOrder, archived }).filter(
      (entry): entry is [string, string] => Boolean(entry[1]),
    ),
  );
  const listPath = `/projects/${projectId}/scenarios`;
  const listHref = listQuery.size > 0 ? `${listPath}?${listQuery}` : listPath;

  /** Plain strings, because a server action may only close over serialisable
   * values. Capturing a helper *function* here made React give up encoding
   * these actions and render `action="javascript:throw …"` — the form then
   * only works once JS has loaded, with no no-JS fallback at all. */
  const listQueryString = listQuery.toString();


  function impact(scenarioId: string) {
    const counts = descendantCounts.get(scenarioId) ?? { testGroups: 0, testCases: 0 };
    return `${counts.testGroups} Test Group(s) and ${counts.testCases} Test Case(s)`;
  }

  /** Manage actions bound to one row. They live here now that the Scenario
   * detail page is gone — its only unique content was this Manage card. */
  function manageActions(scenarioId: string) {
    return {
      async move(formData: FormData) {
        "use server";
        const session = await auth();
        await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
        const actorId = session!.user.id;
        const targetProjectId = formData.get("targetProjectId") as string;
        const targetProject = targetProjectId ? await getProjectById(targetProjectId) : null;
        if (!targetProject || targetProject.deletedAt) {
          const query = new URLSearchParams(listQueryString);
          query.set("moveError", "Target Project not found or archived");
          query.set("editId", scenarioId);
          redirect(`${listPath}?${query}`);
        }
        await requireProjectRoleOrNotFound(actorId, targetProjectId, EDITOR_ROLES);
        await moveScenario(scenarioId, targetProjectId, actorId);
        redirect(`/projects/${targetProjectId}/scenarios`);
      },
      async duplicate() {
        "use server";
        const session = await auth();
        await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
        const actorId = session!.user.id;
        await duplicateScenario(scenarioId, actorId);
        redirect(listHref);
      },
      async archive() {
        "use server";
        const session = await auth();
        await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
        const actorId = session!.user.id;
        await archiveScenario(scenarioId, actorId);
        redirect(listHref);
      },
      async restore() {
        "use server";
        const session = await auth();
        await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
        const actorId = session!.user.id;
        await restoreScenario(scenarioId, actorId);
        redirect(listHref);
      },
      async removeForever() {
        "use server";
        const session = await auth();
        await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
        const actorId = session!.user.id;
        await deleteScenario(scenarioId, actorId, true);
        redirect(listHref);
      },
    };
  }

  /** Bound per row: an inline Edit modal on a list needs one action per
   * Scenario, unlike the detail page where a single closed-over id suffices. */
  function updateAction(scenarioId: string) {
    return async function update(formData: FormData) {
      "use server";

      const session = await auth();
      await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);

      const tags = (formData.get("tags") as string)
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);

      try {
        await updateScenario(
          scenarioId,
          {
            name: formData.get("name") as string,
            description: (formData.get("description") as string) || null,
            preconditions: (formData.get("preconditions") as string) || null,
            testData: (formData.get("testData") as string) || null,
            steps: (formData.get("steps") as string) || null,
            expectedResult: formData.get("expectedResult") as string,
            priority: formData.get("priority") as never,
            status: formData.get("status") as never,
            tags,
          },
          session!.user.id,
        );
      } catch (err) {
        if (err instanceof ValidationError) {
          const query = new URLSearchParams(listQueryString);
          query.set("error", err.message);
          query.set("editId", scenarioId);
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

    const tags = (formData.get("tags") as string)
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    try {
      await createScenario(
        projectId,
        {
          name: formData.get("name") as string,
          description: (formData.get("description") as string) || null,
          preconditions: (formData.get("preconditions") as string) || null,
          testData: (formData.get("testData") as string) || null,
          steps: (formData.get("steps") as string) || null,
          expectedResult: formData.get("expectedResult") as string,
          priority: formData.get("priority") as never,
          status: formData.get("status") as never,
          tags,
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

    redirect(listHref);
  }

  return (
    <main className={pageClass}>
      <Breadcrumb
        segments={scenariosListBreadcrumb({ id: projectId, name: nameOr(project, projectId) })}
      />
      <PageHeader
        title="Scenarios"
        actions={
          <Modal
            triggerLabel="+ New Scenario"
            title="New Scenario"
            openOnMount={(!!error && !editId) || openNew === "1"}
          >
            <ScenarioForm
              action={create}
              submitLabel="Create Scenario"
              error={editId ? undefined : error}
            />
          </Modal>
        }
      />

      <FilterForm>
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
            options={[
              { value: "", label: "All" },
              { value: "DRAFT", label: "Draft" },
              { value: "READY", label: "Ready" },
              { value: "IN_PROGRESS", label: "In Progress" },
              { value: "COMPLETED", label: "Completed" },
            ]}
            ariaLabel="Status"
            className="max-w-44"
          />
        </label>
        <label className={labelClass}>
          Priority
          <Select
            name="priority"
            defaultValue={priority ?? ""}
            options={[
              { value: "", label: "All" },
              { value: "CRITICAL", label: "Critical" },
              { value: "HIGH", label: "High" },
              { value: "MEDIUM", label: "Medium" },
              { value: "LOW", label: "Low" },
            ]}
            ariaLabel="Priority"
            className="max-w-40"
          />
        </label>
        <label className={labelClass}>
          Sort By
          <Select
            name="sortBy"
            defaultValue={sortBy ?? "createdAt"}
            options={[
              { value: "createdAt", label: "Created date" },
              { value: "name", label: "Name" },
              { value: "priority", label: "Priority" },
              { value: "status", label: "Status" },
            ]}
            ariaLabel="Sort By"
            className="max-w-48"
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
        <label className={labelClass}>
          Order
          <Select
            name="sortOrder"
            defaultValue={sortOrder ?? "desc"}
            options={[
              { value: "desc", label: "Descending" },
              { value: "asc", label: "Ascending" },
            ]}
            ariaLabel="Order"
            className="max-w-36"
          />
        </label>
      </FilterForm>

      {scenarios.length === 0 ? (
        <p className={mutedTextClass}>
          {showArchived
            ? "No archived Scenarios."
            : hasFilters
              ? "No scenarios match your search/filters."
              : "No scenarios yet. Create one to get started."}
        </p>
      ) : (
        <div className={tableWrapClass}>
          <table className={tableClass}>
            <colgroup>
              <col className="w-[46%]" />
              <col className="w-[20%]" />
              <col className="w-[20%]" />
              <col className="w-[14%]" />
            </colgroup>
            <thead>
              <tr>
                <th className={thClass}>Name</th>
                <th className={thClass}>Priority</th>
                <th className={thClass}>Status</th>
                <th className={`${thClass} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {scenarios.map((scenario) => (
                <ExpandableRow
                  key={scenario.id}
                  colSpan={4}
                  detailLabel={scenario.name}
                  cells={
                    <>
                      <td className={tdClass}>
                        {/* Straight to the children, not this Scenario's own
                            detail page: drilling down is the common move, and
                            the panel below covers a quick look. */}
                        <Link
                          href={`/projects/${projectId}/scenarios/${scenario.id}/test-groups`}
                          className="font-medium text-foreground hover:text-brand hover:underline"
                        >
                          {scenario.name}
                        </Link>
                      </td>
                      <td className={tdClass}>
                        <Badge tone={priorityTone(scenario.priority)}>{scenario.priority}</Badge>
                      </td>
                      <td className={tdClass}>
                        <Badge tone={workflowStatusTone(scenario.status)}>{scenario.status}</Badge>
                      </td>
                    </>
                  }
                  actions={
                    <RowActions
                      /* Keyed on the flag so a redirect that turns it on remounts the
                         component: `openOnMount` seeds state and is never read again,
                         so a reused instance would ignore it and stay shut. */
                      key={`${scenario.id}-${editId === scenario.id}`}
                      label={scenario.name}
                      title="Edit Scenario"
                      openOnMount={!!error && editId === scenario.id}
                    >
                      <ScenarioForm
                        action={updateAction(scenario.id)}
                        submitLabel="Save"
                        formId={`edit-scenario-${scenario.id}`}
                        hideActions
                        error={editId === scenario.id ? error : undefined}
                        defaults={{
                          name: scenario.name,
                          description: scenario.description,
                          preconditions: scenario.preconditions,
                          testData: scenario.testData,
                          steps: scenario.steps,
                          expectedResult: scenario.expectedResult,
                          priority: scenario.priority,
                          status: scenario.status,
                          tags: scenario.tags.join(", "),
                        }}
                      />
                      <EntityManageSection
                        moveLabel="Move to another Project"
                        moveFieldName="targetProjectId"
                        moveOptions={moveTargets}
                        movePlaceholder="Select a Project…"
                        moveAction={manageActions(scenario.id).move}
                        moveConfirm={`Move this Scenario? It carries ${impact(scenario.id)} with it.`}
                        moveError={editId === scenario.id ? moveError : undefined}
                        duplicateAction={manageActions(scenario.id).duplicate}
                        duplicateConfirm="Duplicate this Scenario?"
                        archiveAction={manageActions(scenario.id).archive}
                        archiveConfirm={`Archive this Scenario? It carries ${impact(scenario.id)}, kept and restorable later.`}
                        restoreAction={manageActions(scenario.id).restore}
                        restoreConfirm="Restore this Scenario?"
                        deleteAction={manageActions(scenario.id).removeForever}
                        deleteConfirm={`Delete this Scenario? It carries ${impact(scenario.id)}. This cannot be undone from the UI.`}
                        isArchived={showArchived}
                        trailing={
                          <>
                            <DialogCloseButton />
                            <Button type="submit" form={`edit-scenario-${scenario.id}`}>
                              Save
                            </Button>
                          </>
                        }
                      />
                    </RowActions>
                  }
                  detail={
                    <DetailFields>
                      <DetailField label="Expected Result" wide>
                        {scenario.expectedResult}
                      </DetailField>
                      <DetailField label="Description">{scenario.description}</DetailField>
                      <DetailField label="Preconditions">{scenario.preconditions}</DetailField>
                      <DetailField label="Test Data">{scenario.testData}</DetailField>
                      <DetailField label="Steps">{scenario.steps}</DetailField>
                      <DetailField label="Tags">
                        {scenario.tags.length > 0 ? scenario.tags.join(", ") : null}
                      </DetailField>
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
