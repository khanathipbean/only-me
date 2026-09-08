import Link from "next/link";
import { auth } from "@/auth";
import { listProjectsForUser } from "@/lib/projects";
import type { ProjectStatus } from "@/generated/prisma/client";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; owner?: string }>;
}) {
  const session = await auth();
  const { search, status, owner } = await searchParams;
  const hasFilters = Boolean(search || status || owner);

  const projects = await listProjectsForUser(session!.user.id, {
    search,
    status: status as ProjectStatus | undefined,
    owner,
  });

  return (
    <main>
      <h1>Projects</h1>
      <form>
        <input type="text" name="search" placeholder="Search by name or code" defaultValue={search} />
        <select name="status" defaultValue={status ?? ""}>
          <option value="">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="ACTIVE">Active</option>
          <option value="COMPLETED">Completed</option>
        </select>
        <input type="text" name="owner" placeholder="Owner user ID" defaultValue={owner} />
        <button type="submit">Filter</button>
      </form>

      <p>
        <Link href="/projects/new">+ New Project</Link>
      </p>

      {projects.length === 0 ? (
        <p>
          {hasFilters
            ? "No projects match your search/filters."
            : "No projects yet. Create one to get started."}
        </p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => (
              <tr key={project.id}>
                <td>{project.code}</td>
                <td>
                  <Link href={`/projects/${project.id}`}>{project.name}</Link>
                </td>
                <td>{project.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
