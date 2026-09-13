import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { ALL_MEMBER_ROLES, EDITOR_ROLES, requireProjectRoleOrNotFound } from "@/lib/rbac";
import { getProjectById } from "@/lib/projects";
import { getModuleById, listModulesForProject } from "@/lib/modules";
import {
  RequirementValidationError,
  archiveRequirement,
  createRequirement,
  deleteRequirement,
  listRequirementsForProjectPage,
  restoreRequirement,
  updateRequirement,
} from "@/lib/requirements";
import { Breadcrumb } from "@/components/Breadcrumb";
import { ConfirmForm } from "@/components/ConfirmForm";
import { FilterForm } from "@/components/FilterForm";
import { nameOr, requirementsListBreadcrumb } from "@/lib/breadcrumb";
import { withToast } from "@/lib/toast";
import { PageHeader } from "@/components/ui/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { RequirementForm } from "@/components/forms/RequirementForm";
import { DialogCloseButton } from "@/components/ui/DialogCloseButton";
import { RowActions } from "@/components/ui/RowActions";
import { Badge, priorityTone, workflowStatusTone } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { TrashIcon } from "@/components/icons";
import { PRIORITY_OPTIONS, WORKFLOW_STATUS_OPTIONS } from "@/lib/enums";
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
import type { Priority, WorkflowStatus } from "@/generated/prisma/client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; moduleId: string }>;
}) {
  const { id, moduleId } = await params;
  const [project, module] = await Promise.all([getProjectById(id), getModuleById(moduleId)]);
  const scope = module ? `${module.name} · ${project?.name ?? ""}` : project?.name;
  return { title: scope ? `Requirements · ${scope}` : "Requirements" };
}

export default async function RequirementsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; moduleId: string }>;
  searchParams: Promise<{
    search?: string;
    status?: string;
    priority?: string;
    archived?: string;
    page?: string;
    pageSize?: string;
    error?: string;
    editId?: string;
  }>;
}) {
  const { id: projectId, moduleId } = await params;
  const { search, status, priority, archived, page, pageSize, error, editId } =
    await searchParams;
  const session = await auth();

  await requireProjectRoleOrNotFound(session!.user.id, projectId, ALL_MEMBER_ROLES);

  const showArchived = archived === "1";
  const hasFilters = Boolean(search || status || priority || showArchived);

  const [project, module, modules, result] = await Promise.all([
    getProjectById(projectId),
    getModuleById(moduleId),
    listModulesForProject(projectId),
    listRequirementsForProjectPage(projectId, {
      search,
      status: status as WorkflowStatus | undefined,
      priority: priority as Priority | undefined,
      moduleId,
      archived: showArchived,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    }),
  ]);

  // A Module id from another project would otherwise expose its name and let
  // Requirements be filed into it, since the role check above only covers the
  // project in the URL.
  if (!module || module.projectId !== projectId) {
    notFound();
  }

  const requirements = result.items;

  /* Plain strings only: a server action may close over serialisable values,
   * and capturing a helper function stops React encoding the action at all,
   * which leaves the form working only once JS has loaded. */
  const listQueryString = new URLSearchParams(
    Object.entries({ search, status, priority, archived }).filter(
      (entry): entry is [string, string] => Boolean(entry[1]),
    ),
  ).toString();
  const listPath = `/projects/${projectId}/modules/${moduleId}/requirements`;
  const listHref = listQueryString ? `${listPath}?${listQueryString}` : listPath;

  async function create(formData: FormData) {
    "use server";
    const session = await auth();
    await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
    try {
      await createRequirement(
        projectId,
        {
          name: formData.get("name") as string,
          code: formData.get("code") as string,
          description: formData.get("description") as string,
          moduleId: formData.get("moduleId") as string,
          priority: formData.get("priority") as never,
          status: formData.get("status") as never,
        },
        session!.user.id,
      );
    } catch (err) {
      if (err instanceof RequirementValidationError) {
        const query = new URLSearchParams(listQueryString);
        query.set("error", err.message);
        redirect(`${listPath}?${query}`);
      }
      throw err;
    }
    redirect(withToast(listHref, "Requirement created"));
  }

  /** Bound per row: an inline Edit dialog needs one action per Requirement. */
  function rowActions(requirementId: string) {
    return {
      async update(formData: FormData) {
        "use server";
        const session = await auth();
        await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
        try {
          await updateRequirement(
            requirementId,
            {
              name: formData.get("name") as string,
              code: formData.get("code") as string,
              description: formData.get("description") as string,
              moduleId: formData.get("moduleId") as string,
              priority: formData.get("priority") as never,
              status: formData.get("status") as never,
            },
            session!.user.id,
          );
        } catch (err) {
          if (err instanceof RequirementValidationError) {
            const query = new URLSearchParams(listQueryString);
            query.set("error", err.message);
            query.set("editId", requirementId);
            redirect(`${listPath}?${query}`);
          }
          throw err;
        }
        redirect(listHref);
      },
      async archive() {
        "use server";
        const session = await auth();
        await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
        try {
          await archiveRequirement(requirementId, session!.user.id);
        } catch (err) {
          if (err instanceof RequirementValidationError) {
            const query = new URLSearchParams(listQueryString);
            query.set("error", err.message);
            redirect(`${listPath}?${query}`);
          }
          throw err;
        }
        redirect(listHref);
      },
      async restore() {
        "use server";
        const session = await auth();
        await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
        await restoreRequirement(requirementId, session!.user.id);
        redirect(listHref);
      },
      async remove() {
        "use server";
        const session = await auth();
        await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
        try {
          await deleteRequirement(requirementId, session!.user.id, true);
        } catch (err) {
          if (err instanceof RequirementValidationError) {
            const query = new URLSearchParams(listQueryString);
            query.set("error", err.message);
            redirect(`${listPath}?${query}`);
          }
          throw err;
        }
        redirect(withToast(listHref, "Requirement deleted"));
      },
    };
  }

  return (
    <main className={pageClass}>
      <Breadcrumb
        segments={requirementsListBreadcrumb(
          { id: projectId, name: nameOr(project, projectId) },
          module,
        )}
      />
      <PageHeader
        title={`Requirements in ${module.name}`}
        subtitle="What the Feature docs ask for. Scenarios hang off these."
        actions={
          <Modal
            triggerLabel="+ New Requirement"
            title="New Requirement"
            openOnMount={!!error && !editId}
          >
            <RequirementForm
              action={create}
              submitLabel="Create Requirement"
              error={editId ? undefined : error}
              modules={modules}
              defaults={{ moduleId }}
            />
          </Modal>
        }
      />

      <FilterForm showClear={hasFilters}>
        <input
          type="text"
          name="search"
          placeholder="Search name or reference"
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
          Priority
          <Select
            name="priority"
            defaultValue={priority ?? ""}
            options={[{ value: "", label: "All" }, ...PRIORITY_OPTIONS]}
            ariaLabel="Priority"
            className="max-w-40"
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

      {requirements.length === 0 ? (
        <p className={mutedTextClass}>
          {showArchived
            ? "No archived Requirements in this Module."
            : hasFilters
              ? "No Requirements match your search/filters."
              : "No Requirements yet. Create one to get started."}
        </p>
      ) : (
        <div className={tableWrapClass}>
          <table className={tableClass}>
            <colgroup>
              <col className="w-[14%]" />
              <col className="w-[46%]" />
              <col className="w-[13%]" />
              <col className="w-[13%]" />
              <col className="w-[14%]" />
            </colgroup>
            <thead>
              <tr>
                <th className={thClass}>Reference</th>
                <th className={thClass}>Name</th>
                <th className={thCenterClass}>Priority</th>
                <th className={thCenterClass}>Status</th>
                <th className={thCenterClass}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {requirements.map((requirement) => {
                const actions = rowActions(requirement.id);
                return (
                  <tr key={requirement.id} className={trHoverClass}>
                    <td className={`${tdClass} text-muted`}>{requirement.code ?? "—"}</td>
                    <td className={tdClass}>
                      {/* Straight to what it covers, like every other level. */}
                      <Link
                        href={`${listPath}/${requirement.id}/scenarios`}
                        className="font-medium text-foreground hover:text-brand hover:underline"
                      >
                        {requirement.name}
                      </Link>
                      <span className="ml-2 text-xs text-muted">
                        {requirement._count.scenarios} scenario(s)
                      </span>
                    </td>
                    <td className={tdCenterClass}>
                      <Badge tone={priorityTone(requirement.priority)}>
                        {requirement.priority}
                      </Badge>
                    </td>
                    <td className={tdCenterClass}>
                      <Badge tone={workflowStatusTone(requirement.status)}>
                        {requirement.status}
                      </Badge>
                    </td>
                    <td className={tdCenterClass}>
                      <div className="inline-flex items-center gap-1">
                        <RowActions
                          key={`${requirement.id}-${editId === requirement.id}`}
                          label={requirement.name}
                          title="Edit Requirement"
                          openOnMount={!!error && editId === requirement.id}
                        >
                          <RequirementForm
                            action={actions.update}
                            submitLabel="Save"
                            error={editId === requirement.id ? error : undefined}
                            modules={modules}
                            formId={`edit-requirement-${requirement.id}`}
                            hideActions
                            defaults={{
                              name: requirement.name,
                              code: requirement.code,
                              description: requirement.description,
                              moduleId: requirement.moduleId,
                              priority: requirement.priority,
                              status: requirement.status,
                            }}
                          />
                          <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-5">
                            <div className="flex items-center gap-2">
                              {showArchived ? (
                                <ConfirmForm
                                  action={actions.restore}
                                  confirmMessage="Restore this Requirement?"
                                >
                                  <Button type="submit" variant="secondary">
                                    Restore
                                  </Button>
                                </ConfirmForm>
                              ) : (
                                <ConfirmForm
                                  action={actions.archive}
                                  confirmMessage="Archive this Requirement?"
                                >
                                  <Button type="submit" variant="secondary">
                                    Archive
                                  </Button>
                                </ConfirmForm>
                              )}
                              <ConfirmForm
                                action={actions.remove}
                                confirmMessage="Delete this Requirement? This cannot be undone from the UI."
                                variant="danger"
                              >
                                <IconButton
                                  type="submit"
                                  variant="danger"
                                  iconSize="lg"
                                  aria-label="Delete"
                                  title="Delete"
                                >
                                  <TrashIcon />
                                </IconButton>
                              </ConfirmForm>
                            </div>
                            <div className="flex items-center gap-2">
                              <DialogCloseButton />
                              <Button type="submit" form={`edit-requirement-${requirement.id}`}>
                                Save
                              </Button>
                            </div>
                          </div>
                        </RowActions>
                      </div>
                    </td>
                  </tr>
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
