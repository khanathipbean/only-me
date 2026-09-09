import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ALL_MEMBER_ROLES, EDITOR_ROLES, requireProjectRoleOrNotFound } from "@/lib/rbac";
import { ValidationError, createScenario, isScenarioSortField, listScenariosForProject } from "@/lib/scenarios";
import { getProjectById } from "@/lib/projects";
import { Breadcrumb } from "@/components/Breadcrumb";
import { FilterForm } from "@/components/FilterForm";
import { nameOr, scenariosListBreadcrumb } from "@/lib/breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { ScenarioForm } from "@/components/forms/ScenarioForm";
import { Badge, priorityTone, workflowStatusTone } from "@/components/ui/Badge";
import {
  labelClass,
  mutedTextClass,
  pageClass,
  selectClass,
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
    /** `?new=1` opens the New Scenario modal straight away — lets other pages
     * (e.g. the Dashboard's empty state) link to "create a Scenario" without
     * needing a standalone create page. */
    new?: string;
  }>;
}) {
  const { id: projectId } = await params;
  const { search, status, priority, sortBy, sortOrder, error, new: openNew } = await searchParams;
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
        redirect(
          `/projects/${projectId}/scenarios?error=${encodeURIComponent(err.message)}`,
        );
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
            openOnMount={!!error || openNew === "1"}
          >
            <ScenarioForm action={create} submitLabel="Create Scenario" error={error} />
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
          <select name="status" defaultValue={status ?? ""} className={`${selectClass} max-w-44`}>
            <option value="">All</option>
            <option value="DRAFT">Draft</option>
            <option value="READY">Ready</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="COMPLETED">Completed</option>
          </select>
        </label>
        <label className={labelClass}>
          Priority
          <select name="priority" defaultValue={priority ?? ""} className={`${selectClass} max-w-40`}>
            <option value="">All</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </label>
        <label className={labelClass}>
          Sort By
          <select name="sortBy" defaultValue={sortBy ?? "createdAt"} className={`${selectClass} max-w-48`}>
            <option value="createdAt">Created date</option>
            <option value="name">Name</option>
            <option value="priority">Priority</option>
            <option value="status">Status</option>
          </select>
        </label>
        <label className={labelClass}>
          Order
          <select name="sortOrder" defaultValue={sortOrder ?? "desc"} className={`${selectClass} max-w-36`}>
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
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
            <thead>
              <tr>
                <th className={thClass}>Name</th>
                <th className={thClass}>Priority</th>
                <th className={thClass}>Status</th>
              </tr>
            </thead>
            <tbody>
              {scenarios.map((scenario) => (
                <tr key={scenario.id} className={trHoverClass}>
                  <td className={tdClass}>
                    <Link
                      href={`/projects/${projectId}/scenarios/${scenario.id}`}
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
