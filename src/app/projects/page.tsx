import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DuplicateCodeError, ValidationError, createProject, listProjectsForUserPage } from "@/lib/projects";
import { isAdminAnywhere } from "@/lib/rbac";
import { Breadcrumb } from "@/components/Breadcrumb";
import { FilterForm } from "@/components/FilterForm";
import { Pagination } from "@/components/ui/Pagination";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { ProjectForm } from "@/components/forms/ProjectForm";
import { Badge, projectStatusTone } from "@/components/ui/Badge";
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
  trHoverClass,
} from "@/lib/ui";
import type { ProjectStatus } from "@/generated/prisma/client";

export const metadata = { title: "Projects" };

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string;
    status?: string;
    page?: string;
    pageSize?: string;
    error?: string;
  }>;
}) {
  const session = await auth();
  const { search, status, page, pageSize, error } = await searchParams;
  const hasFilters = Boolean(search || status);
  const canCreateProject = await isAdminAnywhere(session!.user.id);

  const result = await listProjectsForUserPage(session!.user.id, {
    search,
    status: status as ProjectStatus | undefined,
    page: page ? Number(page) : undefined,
    pageSize: pageSize ? Number(pageSize) : undefined,
  });
  const projects = result.items;

  async function create(formData: FormData) {
    "use server";

    const session = await auth();
    if (!(await isAdminAnywhere(session!.user.id))) {
      redirect(`/projects?error=${encodeURIComponent("Only an Admin can create new projects")}`);
    }

    const startDate = formData.get("startDate") as string;
    const endDate = formData.get("endDate") as string;

    let project;
    try {
      project = await createProject(
        {
          code: formData.get("code") as string,
          name: formData.get("name") as string,
          description: (formData.get("description") as string) || null,
          status: formData.get("status") as never,
          startDate: startDate ? new Date(startDate) : null,
          endDate: endDate ? new Date(endDate) : null,
        },
        session!.user.id,
      );
    } catch (err) {
      if (err instanceof ValidationError || err instanceof DuplicateCodeError) {
        redirect(`/projects?error=${encodeURIComponent(err.message)}`);
      }
      throw err;
    }

    redirect(`/projects/${project.id}`);
  }

  return (
    <main className={pageClass}>
      <Breadcrumb segments={[{ label: "Projects", href: "/projects" }]} />
      <PageHeader
        title="Projects"
        actions={
          canCreateProject && (
            <Modal triggerLabel="+ New Project" title="New Project" openOnMount={!!error}>
              <ProjectForm action={create} submitLabel="Create Project" error={error} />
            </Modal>
          )
        }
      />

      <FilterForm showClear={hasFilters}>
        <input
          type="text"
          name="search"
          placeholder="Search by name or code"
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
              { value: "ACTIVE", label: "Active" },
              { value: "COMPLETED", label: "Completed" },
            ]}
            ariaLabel="Status"
            className="max-w-40"
          />
        </label>
      </FilterForm>

      {projects.length === 0 ? (
        <p className={mutedTextClass}>
          {hasFilters
            ? "No projects match your search/filters."
            : "No projects yet. Create one to get started."}
        </p>
      ) : (
        <div className={tableWrapClass}>
          <table className={tableClass}>
            <colgroup>
              <col className="w-[18%]" />
              <col className="w-[57%]" />
              <col className="w-[25%]" />
            </colgroup>
            <thead>
              <tr>
                <th className={thClass}>Code</th>
                <th className={thClass}>Name</th>
                <th className={thCenterClass}>Status</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.id} className={trHoverClass}>
                  <td className={`${tdClass} font-mono text-xs text-muted`}>{project.code}</td>
                  <td className={tdClass}>
                    <Link href={`/projects/${project.id}`} className="font-medium text-foreground hover:text-brand hover:underline">
                      {project.name}
                    </Link>
                  </td>
                  <td className={tdCenterClass}>
                    <Badge tone={projectStatusTone(project.status)}>{project.status}</Badge>
                  </td>
                </tr>
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
