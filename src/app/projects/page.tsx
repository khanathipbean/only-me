import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  DuplicateCodeError,
  ValidationError,
  archiveProject,
  createProject,
  listProjectsForUserPage,
  restoreProject,
  updateProject,
} from "@/lib/projects";
import { withToast } from "@/lib/toast";
import { EDITOR_ROLES, isAdminAnywhere, requireProjectRoleOrNotFound } from "@/lib/rbac";
import { Breadcrumb } from "@/components/Breadcrumb";
import { FilterForm } from "@/components/FilterForm";
import { ResultCount } from "@/components/ui/ResultCount";
import { Pagination } from "@/components/ui/Pagination";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { ConfirmForm } from "@/components/ConfirmForm";
import { SubmitButton } from "@/components/SubmitButton";
import { RowActions } from "@/components/ui/RowActions";
import { ExpandableRow } from "@/components/ui/ExpandableRow";
import { DetailField, DetailFields } from "@/components/ui/DetailFields";
import { Avatar } from "@/components/ui/Avatar";
import { ProjectForm } from "@/components/forms/ProjectForm";
import { Badge, projectStatusTone } from "@/components/ui/Badge";
import { ClockIcon } from "@/components/icons";
import { formatTimestamp } from "@/lib/dates";
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
import type { ProjectStatus } from "@/generated/prisma/client";
import { invalidateRouteCache } from "@/lib/revalidate";

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
    projectId?: string;
    /** Opens the New Project dialog on arrival, so the header's Project
     *  picker can link straight to it instead of dropping someone on this
     *  page to hunt for the button. */
    new?: string;
    /** Paired with `projectId`: opens that row's Edit dialog on arrival, so a
     *  "Project settings"/"Edit details" link elsewhere (the Overview tab's
     *  summary) can jump straight into editing instead of dropping someone
     *  on the bare list to find the row themselves. */
    edit?: string;
  }>;
}) {
  const session = await auth();
  const {
    search,
    status,
    page,
    pageSize,
    error,
    projectId: erroredProjectId,
    new: openNew,
    edit: openEdit,
  } = await searchParams;
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
    invalidateRouteCache();

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

    redirect(withToast(`/projects/${project.id}`, "Project created"));
  }

  /** Bound per row: an inline Edit dialog and Archive/Restore need one action
   * each per Project, and every failure has to redirect back to this same
   * row rather than a shared one. */
  function rowActions(id: string) {
    return {
      async update(formData: FormData) {
        "use server";
        invalidateRouteCache();
        const session = await auth();
        await requireProjectRoleOrNotFound(session!.user.id, id, EDITOR_ROLES);
        const startDate = formData.get("startDate") as string;
        const endDate = formData.get("endDate") as string;

        try {
          await updateProject(
            id,
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
            redirect(`/projects?projectId=${id}&error=${encodeURIComponent(err.message)}`);
          }
          throw err;
        }
        redirect("/projects");
      },
      async archive() {
        "use server";
        invalidateRouteCache();
        const session = await auth();
        await requireProjectRoleOrNotFound(session!.user.id, id, EDITOR_ROLES);
        await archiveProject(id, session!.user.id);
        redirect("/projects");
      },
      async restore() {
        "use server";
        invalidateRouteCache();
        const session = await auth();
        await requireProjectRoleOrNotFound(session!.user.id, id, EDITOR_ROLES);
        await restoreProject(id, session!.user.id);
        redirect("/projects");
      },
    };
  }

  return (
    <main className={pageClass}>
      <Breadcrumb segments={[{ label: "Projects", href: "/projects" }]} />
      <PageHeader
        title="Projects"
        actions={
          canCreateProject && (
            <Modal
              triggerLabel="+ New Project"
              title="New Project"
              openOnMount={(!!error && !erroredProjectId) || openNew === "1"}
            >
              <ProjectForm
                action={create}
                submitLabel="Create Project"
                error={!erroredProjectId ? error : undefined}
              />
            </Modal>
          )
        }
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <FilterForm showClear={hasFilters} className="flex-1">
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
        <ResultCount total={result.total} />
      </div>

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
              <col className="w-[15%]" />
              <col className="w-[50%]" />
              <col className="w-[20%]" />
              <col className="w-[15%]" />
            </colgroup>
            <thead>
              <tr>
                <th className={thClass}>Code</th>
                <th className={thClass}>Name</th>
                <th className={thCenterClass}>Status</th>
                <th className={thCenterClass} />
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => {
                const actions = rowActions(project.id);
                const role = project.members[0]?.role;
                const canEdit = !!role && EDITOR_ROLES.includes(role);
                return (
                  <ExpandableRow
                    key={project.id}
                    colSpan={4}
                    detailLabel={project.name}
                    cells={
                      <>
                        <td className={`${tdClass} font-mono text-xs text-muted`}>
                          {project.code}
                        </td>
                        <td className={tdClass}>
                          <Link
                            href={`/projects/${project.id}`}
                            className="font-medium text-foreground hover:text-brand hover:underline"
                          >
                            {project.name}
                          </Link>
                        </td>
                        <td className={tdCenterClass}>
                          <span className="inline-flex items-center gap-1.5">
                            <Badge tone={projectStatusTone(project.status)}>{project.status}</Badge>
                            {project.deletedAt && <Badge tone="gray">Archived</Badge>}
                          </span>
                        </td>
                      </>
                    }
                    actions={
                      canEdit && (
                        <RowActions
                          label={project.name}
                          title="Edit Project"
                          openOnMount={
                            (!!error && erroredProjectId === project.id) ||
                            (openEdit === "1" && erroredProjectId === project.id)
                          }
                        >
                          <ProjectForm
                            action={actions.update}
                            submitLabel="Save"
                            error={erroredProjectId === project.id ? error : undefined}
                            defaults={{
                              code: project.code,
                              name: project.name,
                              description: project.description,
                              status: project.status,
                              startDate: project.startDate?.toISOString().slice(0, 10),
                              endDate: project.endDate?.toISOString().slice(0, 10),
                            }}
                          />
                        </RowActions>
                      )
                    }
                    detail={
                      <div className="flex flex-col gap-5">
                        <DetailFields>
                          <DetailField label="Description" wide>
                            {project.description}
                          </DetailField>
                        </DetailFields>

                        <div className="border-t border-border pt-5">
                          <DetailFields>
                            <DetailField
                              label="Owner"
                              icon={
                                <Avatar
                                  name={project.owner.name ?? project.owner.email}
                                  src={
                                    project.owner.avatarKey
                                      ? `/api/users/${project.owner.id}/avatar`
                                      : null
                                  }
                                  size="size-9"
                                />
                              }
                            >
                              {project.owner.name}
                            </DetailField>
                            <DetailField
                              label="Last updated"
                              icon={
                                <span className="flex size-9 items-center justify-center rounded-full border border-border bg-black/[.06] text-muted dark:bg-white/[.10]">
                                  <ClockIcon />
                                </span>
                              }
                            >
                              {project.updatedBy?.name ?? "—"} at{" "}
                              <time
                                dateTime={project.updatedAt.toISOString()}
                                title={project.updatedAt.toISOString()}
                              >
                                {formatTimestamp(project.updatedAt)}
                              </time>
                            </DetailField>
                          </DetailFields>
                        </div>

                        {canEdit && (
                          <div className="flex justify-end border-t border-border pt-4">
                            {project.deletedAt ? (
                              <ConfirmForm action={actions.restore} confirmMessage="Restore this project?">
                                <SubmitButton variant="secondary" pendingLabel="Restoring…">
                                  Restore
                                </SubmitButton>
                              </ConfirmForm>
                            ) : (
                              <ConfirmForm
                                action={actions.archive}
                                confirmMessage="Archive this project? Its Modules, Requirements, Scenarios, Test Groups, and Test Cases are kept and can be restored later."
                              >
                                <SubmitButton variant="secondary" pendingLabel="Archiving…">
                                  Archive
                                </SubmitButton>
                              </ConfirmForm>
                            )}
                          </div>
                        )}
                      </div>
                    }
                  />
                );
              })}
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
