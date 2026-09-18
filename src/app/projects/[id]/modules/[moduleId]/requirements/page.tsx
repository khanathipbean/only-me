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
  listFeaturesForModule,
  listRequirementsForProjectPage,
  restoreRequirement,
  updateRequirement,
} from "@/lib/requirements";
import { Breadcrumb } from "@/components/Breadcrumb";
import { ConfirmForm } from "@/components/ConfirmForm";
import { FilterForm } from "@/components/FilterForm";
import { ResultCount } from "@/components/ui/ResultCount";
import { nameOr, requirementsListBreadcrumb } from "@/lib/breadcrumb";
import { withToast } from "@/lib/toast";
import { PageHeader } from "@/components/ui/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { RequirementForm } from "@/components/forms/RequirementForm";
import { DialogCloseButton } from "@/components/ui/DialogCloseButton";
import { DetailField, DetailFields } from "@/components/ui/DetailFields";
import { ExpandableRow } from "@/components/ui/ExpandableRow";
import { RowActions } from "@/components/ui/RowActions";
import { Badge, priorityTone, workflowStatusTone } from "@/components/ui/Badge";
import { IconButton } from "@/components/ui/Button";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { SubmitButton } from "@/components/SubmitButton";
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
} from "@/lib/ui";
import type { Priority, WorkflowStatus } from "@/generated/prisma/client";
import { invalidateRouteCache } from "@/lib/revalidate";

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
    feature?: string;
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
  const { search, feature, status, priority, archived, page, pageSize, error, editId } =
    await searchParams;
  const session = await auth();

  await requireProjectRoleOrNotFound(session!.user.id, projectId, ALL_MEMBER_ROLES);

  const showArchived = archived === "1";
  const hasFilters = Boolean(search || feature || status || priority || showArchived);

  const [project, module, modules, features, result] = await Promise.all([
    getProjectById(projectId),
    getModuleById(moduleId),
    listModulesForProject(projectId),
    listFeaturesForModule(moduleId),
    listRequirementsForProjectPage(projectId, {
      feature,
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
    Object.entries({ search, feature, status, priority, archived, page, pageSize }).filter(
      (entry): entry is [string, string] => Boolean(entry[1]),
    ),
  ).toString();
  const listPath = `/projects/${projectId}/modules/${moduleId}/requirements`;
  const listHref = listQueryString ? `${listPath}?${listQueryString}` : listPath;

  async function create(formData: FormData) {
    "use server";
    invalidateRouteCache();
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
          feature: formData.get("feature") as string,
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
        invalidateRouteCache();
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
              feature: formData.get("feature") as string,
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
        // The rest of the form shows up in the row on the way back; a change
        // of Module does not, because the row is no longer in this list.
        // Looked up here, not read off the page's own `modules`: an action may
        // only close over serialisable values.
        const nextModuleId = formData.get("moduleId") as string;
        if (nextModuleId && nextModuleId !== moduleId) {
          const target = await getModuleById(nextModuleId);
          redirect(
            withToast(
              listHref,
              target ? `Moved to ${target.name}` : "Moved to another Module",
            ),
          );
        }
        redirect(listHref);
      },
      async archive() {
        "use server";
        invalidateRouteCache();
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
        // The row leaves the default view entirely — without this it reads
        // like a delete, or like nothing happened.
        redirect(withToast(listHref, "Requirement archived"));
      },
      async restore() {
        "use server";
        invalidateRouteCache();
        const session = await auth();
        await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
        await restoreRequirement(requirementId, session!.user.id);
        redirect(withToast(listHref, "Requirement restored"));
      },
      async remove() {
        "use server";
        invalidateRouteCache();
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
        title={
          <>
            Requirements{" "}
            <span className="text-base font-normal text-muted">({module.name})</span>
          </>
        }
        subtitle="What the Feature docs ask for. Scenarios hang off these."
        actions={
          <Modal
            triggerLabel="+ New Requirement"
            title="New Requirement"
            openOnMount={!!error && !editId}
          >
            <RequirementForm
              action={create}
              features={features}
              submitLabel="Create Requirement"
              error={editId ? undefined : error}
              modules={modules}
              defaults={{ moduleId }}
            />
          </Modal>
        }
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <FilterForm showClear={hasFilters} className="flex-1">
          <input
            type="text"
            name="search"
            placeholder="Search name or reference"
            defaultValue={search}
            className={`${inputClass} max-w-xs`}
          />
          {features.length > 0 && (
            <label className={labelClass}>
              Feature
              <Select
                name="feature"
                defaultValue={feature ?? ""}
                options={[
                  { value: "", label: "All" },
                  ...features.map((value) => ({ value, label: value })),
                ]}
                ariaLabel="Feature"
                className="max-w-52"
              />
            </label>
          )}
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
        <ResultCount total={result.total} />
      </div>

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
            {/* The badge columns hold one short word each and were taking a
                fifth of the table apiece, which left the names — the only
                column with anything long in it — wrapping against dead space.
                */}
            <colgroup>
              <col className="w-[66%]" />
              <col className="w-[12%]" />
              <col className="w-[12%]" />
              <col className="w-[10%]" />
            </colgroup>
            <thead>
              <tr>
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
                  <ExpandableRow
                    key={requirement.id}
                    colSpan={4}
                    detailLabel={requirement.name}
                    cells={
                      <>
                        <td className={tdClass}>
                          {/* A row, not a run of inline text: the Feature tag
                              and the count are each one piece, and a long name
                              used to push "scenario(s)" onto its own line away
                              from the number in front of it. */}
                          <div className="flex items-baseline gap-2">
                            {/* Straight to what it covers, like every other level. */}
                            <Link
                              href={`${listPath}/${requirement.id}/scenarios`}
                              className="min-w-0 font-medium text-foreground hover:text-brand hover:underline"
                            >
                              {requirement.name}
                            </Link>
                            {requirement.feature && (
                              <span className="shrink-0">
                                <Badge tone="gray" variant="outline">
                                  {requirement.feature}
                                </Badge>
                              </span>
                            )}
                            <span className="shrink-0 text-xs whitespace-nowrap text-muted">
                              {requirement._count.scenarios} scenario(s)
                            </span>
                          </div>
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
                      </>
                    }
                    actions={
                      <RowActions
                        key={`${requirement.id}-${editId === requirement.id}`}
                        label={requirement.name}
                        title="Edit Requirement"
                        openOnMount={!!error && editId === requirement.id}
                      >
                        <RequirementForm
                          action={actions.update}
                          features={features}
                          submitLabel="Save"
                          error={editId === requirement.id ? error : undefined}
                          modules={modules}
                          formId={`edit-requirement-${requirement.id}`}
                          hideActions
                          defaults={{
                            name: requirement.name,
                            feature: requirement.feature,
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
                                <SubmitButton variant="secondary" pendingLabel="Restoring…">
                                  Restore
                                </SubmitButton>
                              </ConfirmForm>
                            ) : (
                              <ConfirmForm
                                action={actions.archive}
                                confirmMessage="Archive this Requirement?"
                              >
                                <SubmitButton variant="secondary" pendingLabel="Archiving…">
                                  Archive
                                </SubmitButton>
                              </ConfirmForm>
                            )}
                            <ConfirmForm
                              action={actions.remove}
                              confirmMessage={`Delete this Requirement? It carries ${requirement._count.scenarios} scenario(s), and everything under them goes too. This cannot be undone from the UI.`}
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
                            <FormSubmitButton formId={`edit-requirement-${requirement.id}`}>
                              Save
                            </FormSubmitButton>
                          </div>
                        </div>
                      </RowActions>
                    }
                    detail={
                      <DetailFields>
                        <DetailField label="Description" wide>
                          {requirement.description}
                        </DetailField>
                        <DetailField label="Reference">{requirement.code}</DetailField>
                      </DetailFields>
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
