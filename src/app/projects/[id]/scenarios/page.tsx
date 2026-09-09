import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ALL_MEMBER_ROLES, EDITOR_ROLES, requireProjectRoleOrNotFound } from "@/lib/rbac";
import {
  ValidationError,
  createScenario,
  isScenarioSortField,
  listScenariosForProject,
  updateScenario,
} from "@/lib/scenarios";
import { getProjectById } from "@/lib/projects";
import { Breadcrumb } from "@/components/Breadcrumb";
import { FilterForm } from "@/components/FilterForm";
import { nameOr, scenariosListBreadcrumb } from "@/lib/breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { ScenarioForm } from "@/components/forms/ScenarioForm";
import { Badge, priorityTone, workflowStatusTone } from "@/components/ui/Badge";
import { IconLinkButton } from "@/components/ui/Button";
import { ChevronRightIcon, EditIcon } from "@/components/icons";
import {
  labelClass,
  mutedTextClass,
  pageClass,
  inputClass,
  tableClass,
  tableWrapClass,
  tdClass,
  thClass,
  trHoverClass,
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
    error?: string;
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
    error,
    editId,
    new: openNew,
  } = await searchParams;
  const session = await auth();

  await requireProjectRoleOrNotFound(session!.user.id, projectId, ALL_MEMBER_ROLES);

  const project = await getProjectById(projectId);
  const hasFilters = Boolean(search || status || priority);
  const scenarios = await listScenariosForProject(projectId, {
    search,
    status: status as WorkflowStatus | undefined,
    priority: priority as Priority | undefined,
    sortBy: isScenarioSortField(sortBy) ? sortBy : undefined,
    sortOrder: sortOrder === "asc" ? "asc" : undefined,
  });

  /** The list URL with the active filters/sort kept, so an inline save (or a
   * failed one) returns to the same view the user was looking at. */
  const listQuery = new URLSearchParams(
    Object.entries({ search, status, priority, sortBy, sortOrder }).filter(
      (entry): entry is [string, string] => Boolean(entry[1]),
    ),
  );
  const listPath = `/projects/${projectId}/scenarios`;
  const listHref = listQuery.size > 0 ? `${listPath}?${listQuery}` : listPath;

  function listHrefWithError(message: string, rowId?: string) {
    const query = new URLSearchParams(listQuery);
    query.set("error", message);
    if (rowId) {
      query.set("editId", rowId);
    }
    return `${listPath}?${query}`;
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
          redirect(listHrefWithError(err.message, scenarioId));
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

    let scenario;
    try {
      scenario = await createScenario(
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
        redirect(listHrefWithError(err.message));
      }
      throw err;
    }

    redirect(`/projects/${projectId}/scenarios/${scenario.id}`);
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
          {hasFilters
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
                <tr key={scenario.id} className={trHoverClass}>
                  <td className={tdClass}>
                    {/* Straight to the children, not this Scenario's own detail
                        page: drilling down is the common move, and the detail
                        page is one click away via the arrow on the right. */}
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
                  <td className={tdClass}>
                    <div className="flex items-center justify-end gap-1">
                      <Modal
                        triggerLabel="Edit"
                        triggerVariant="ghost"
                        triggerIcon={<EditIcon />}
                        title="Edit Scenario"
                        openOnMount={!!error && editId === scenario.id}
                      >
                        <ScenarioForm
                          action={updateAction(scenario.id)}
                          submitLabel="Save"
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
                      </Modal>
                      <IconLinkButton
                        href={`/projects/${projectId}/scenarios/${scenario.id}`}
                        aria-label={`View details for ${scenario.name}`}
                        title="View details"
                      >
                        <ChevronRightIcon />
                      </IconLinkButton>
                    </div>
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
