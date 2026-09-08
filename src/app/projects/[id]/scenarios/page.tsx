import Link from "next/link";
import { auth } from "@/auth";
import { ALL_MEMBER_ROLES, requireProjectRoleOrNotFound } from "@/lib/rbac";
import { isScenarioSortField, listScenariosForProject } from "@/lib/scenarios";
import type { ScenarioPriority, ScenarioStatus } from "@/generated/prisma/client";

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
  }>;
}) {
  const { id: projectId } = await params;
  const { search, status, priority, sortBy, sortOrder } = await searchParams;
  const session = await auth();

  await requireProjectRoleOrNotFound(session!.user.id, projectId, ALL_MEMBER_ROLES);

  const hasFilters = Boolean(search || status || priority);
  const scenarios = await listScenariosForProject(projectId, {
    search,
    status: status as ScenarioStatus | undefined,
    priority: priority as ScenarioPriority | undefined,
    sortBy: isScenarioSortField(sortBy) ? sortBy : undefined,
    sortOrder: sortOrder === "asc" ? "asc" : undefined,
  });

  return (
    <main>
      <p>
        <Link href={`/projects/${projectId}`}>← Back to Project</Link>
      </p>
      <h1>Scenarios</h1>
      <form>
        <input type="text" name="search" placeholder="Search by name" defaultValue={search} />
        <select name="status" defaultValue={status ?? ""}>
          <option value="">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="READY">Ready</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="COMPLETED">Completed</option>
        </select>
        <select name="priority" defaultValue={priority ?? ""}>
          <option value="">All priorities</option>
          <option value="CRITICAL">Critical</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>
        <select name="sortBy" defaultValue={sortBy ?? "createdAt"}>
          <option value="createdAt">Sort: Created date</option>
          <option value="name">Sort: Name</option>
          <option value="priority">Sort: Priority</option>
          <option value="status">Sort: Status</option>
        </select>
        <select name="sortOrder" defaultValue={sortOrder ?? "desc"}>
          <option value="desc">Descending</option>
          <option value="asc">Ascending</option>
        </select>
        <button type="submit">Filter</button>
      </form>

      <p>
        <Link href={`/projects/${projectId}/scenarios/new`}>+ New Scenario</Link>
      </p>

      {scenarios.length === 0 ? (
        <p>
          {hasFilters
            ? "No scenarios match your search/filters."
            : "No scenarios yet. Create one to get started."}
        </p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Priority</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {scenarios.map((scenario) => (
              <tr key={scenario.id}>
                <td>
                  <Link href={`/projects/${projectId}/scenarios/${scenario.id}`}>
                    {scenario.name}
                  </Link>
                </td>
                <td>{scenario.priority}</td>
                <td>{scenario.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
