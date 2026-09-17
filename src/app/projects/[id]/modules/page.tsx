import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ALL_MEMBER_ROLES, EDITOR_ROLES, requireProjectRoleOrNotFound } from "@/lib/rbac";
import { getProjectById } from "@/lib/projects";
import {
  ModuleValidationError,
  archiveModule,
  createModule,
  deleteModule,
  listModulesForProjectPage,
  renameModule,
  restoreModule,
} from "@/lib/modules";
import { Breadcrumb } from "@/components/Breadcrumb";
import { DismissibleAlert } from "@/components/DismissibleAlert";
import { ConfirmForm } from "@/components/ConfirmForm";
import { FilterForm } from "@/components/FilterForm";
import { ResultCount } from "@/components/ui/ResultCount";
import { modulesListBreadcrumb, nameOr } from "@/lib/breadcrumb";
import { withToast } from "@/lib/toast";
import { PageHeader } from "@/components/ui/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { RequiredMark } from "@/components/forms/RequiredMark";
import { RowActions } from "@/components/ui/RowActions";
import { IconButton } from "@/components/ui/Button";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { SubmitButton } from "@/components/SubmitButton";
import { Select } from "@/components/ui/Select";
import { DialogCloseButton } from "@/components/ui/DialogCloseButton";
import { TrashIcon } from "@/components/icons";
import { invalidateRouteCache } from "@/lib/revalidate";
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

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProjectById(id);
  return { title: project ? `Modules · ${project.name}` : "Modules" };
}

export default async function ModulesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    search?: string;
    archived?: string;
    page?: string;
    pageSize?: string;
    error?: string;
    editId?: string;
  }>;
}) {
  const { id: projectId } = await params;
  const { search, archived, page, pageSize, error, editId } = await searchParams;
  const session = await auth();

  await requireProjectRoleOrNotFound(session!.user.id, projectId, ALL_MEMBER_ROLES);

  const showArchived = archived === "1";
  const hasFilters = Boolean(search || showArchived);

  const [project, result] = await Promise.all([
    getProjectById(projectId),
    listModulesForProjectPage(projectId, {
      search,
      archived: showArchived,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    }),
  ]);
  const modules = result.items;

  /* Plain strings only: a server action may close over serialisable values,
   * and capturing a helper function stops React encoding the action at all,
   * which leaves the form working only once JS has loaded. */
  const listQueryString = new URLSearchParams(
    Object.entries({ search, archived, page, pageSize }).filter(
      (entry): entry is [string, string] => Boolean(entry[1]),
    ),
  ).toString();
  const listPath = `/projects/${projectId}/modules`;
  const listHref = listQueryString ? `${listPath}?${listQueryString}` : listPath;

  async function create(formData: FormData) {
    "use server";
    invalidateRouteCache();
    const session = await auth();
    await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
    try {
      await createModule(projectId, formData.get("name") as string, session!.user.id);
    } catch (err) {
      if (err instanceof ModuleValidationError) {
        const query = new URLSearchParams(listQueryString);
        query.set("error", err.message);
        redirect(`${listPath}?${query}`);
      }
      throw err;
    }
    redirect(withToast(listHref, "Module created"));
  }

  /** Bound per row: an inline Edit dialog needs one action per Module. */
  function rowActions(moduleId: string) {
    return {
      async rename(formData: FormData) {
        "use server";
        invalidateRouteCache();
        const session = await auth();
        await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
        try {
          await renameModule(moduleId, formData.get("name") as string, session!.user.id);
        } catch (err) {
          if (err instanceof ModuleValidationError) {
            const query = new URLSearchParams(listQueryString);
            query.set("error", err.message);
            query.set("editId", moduleId);
            redirect(`${listPath}?${query}`);
          }
          throw err;
        }
        redirect(listHref);
      },
      async archive() {
        "use server";
        invalidateRouteCache();
        const session = await auth();
        await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
        try {
          await archiveModule(moduleId, session!.user.id);
        } catch (err) {
          if (err instanceof ModuleValidationError) {
            const query = new URLSearchParams(listQueryString);
            query.set("error", err.message);
            redirect(`${listPath}?${query}`);
          }
          throw err;
        }
        // Unlike a rename, nothing on the page you land on says this worked:
        // with the archived filter off, the row simply vanishes, which reads
        // exactly like a delete.
        redirect(withToast(listHref, "Module archived"));
      },
      async restore() {
        "use server";
        invalidateRouteCache();
        const session = await auth();
        await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
        await restoreModule(moduleId, session!.user.id);
        redirect(withToast(listHref, "Module restored"));
      },
      async remove() {
        "use server";
        invalidateRouteCache();
        const session = await auth();
        await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
        try {
          await deleteModule(moduleId, session!.user.id, true);
        } catch (err) {
          if (err instanceof ModuleValidationError) {
            const query = new URLSearchParams(listQueryString);
            query.set("error", err.message);
            redirect(`${listPath}?${query}`);
          }
          throw err;
        }
        redirect(withToast(listHref, "Module deleted"));
      },
    };
  }

  return (
    <main className={pageClass}>
      <Breadcrumb
        segments={modulesListBreadcrumb({ id: projectId, name: nameOr(project, projectId) })}
      />
      <PageHeader
        title="Modules"
        subtitle="One menu of the system under test. Requirements are filed under these."
        actions={
          <Modal
            triggerLabel="+ New Module"
            title="New Module"
            openOnMount={!!error && !editId}
          >
            {error && !editId && (
              <p
                role="alert"
                className="mb-4 rounded-md bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-900/40 dark:text-red-300"
              >
                {error}
              </p>
            )}
            <form action={create} className="flex flex-col gap-4">
              <label className={labelClass}>
                <span>
                  Module name
                  <RequiredMark />
                </span>
                <input
                  name="name"
                  required
                  placeholder="One menu of the system under test, e.g. Dashboard"
                  className={inputClass}
                />
              </label>
              <div className="mt-2 flex flex-wrap justify-end gap-2">
                <DialogCloseButton />
                <SubmitButton>Add module</SubmitButton>
              </div>
            </form>
          </Modal>
        }
      />

      {/* An archive refused for still being in use has no row dialog to land
          in, so the reason is shown against the list itself. */}
      {error && !editId && <DismissibleAlert>{error}</DismissibleAlert>}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <FilterForm showClear={hasFilters} className="flex-1">
          <input
            type="text"
            name="search"
            placeholder="Search module name"
            defaultValue={search}
            className={`${inputClass} max-w-xs`}
          />
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

      {modules.length === 0 ? (
        <p className={mutedTextClass}>
          {showArchived
            ? "No archived Modules."
            : hasFilters
              ? "No Modules match your search."
              : "No Modules yet. Create one to get started."}
        </p>
      ) : (
        <div className={tableWrapClass}>
          <table className={tableClass}>
            <colgroup>
              <col className="w-[86%]" />
              <col className="w-[14%]" />
            </colgroup>
            <thead>
              <tr>
                <th className={thClass}>Name</th>
                <th className={thCenterClass}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {modules.map((module) => {
                const actions = rowActions(module.id);
                return (
                  <tr key={module.id} className={trHoverClass}>
                    <td className={tdClass}>
                      {/* Straight to what it contains, like every other level. */}
                      <Link
                        href={`${listPath}/${module.id}/requirements`}
                        className="font-medium text-foreground hover:text-brand hover:underline"
                      >
                        {module.name}
                      </Link>
                      <span className="ml-2 text-xs text-muted">
                        {module._count.requirements} requirement(s)
                      </span>
                    </td>
                    <td className={tdCenterClass}>
                      <div className="inline-flex items-center gap-1">
                        <RowActions
                          key={`${module.id}-${editId === module.id}`}
                          label={module.name}
                          title="Edit Module"
                          openOnMount={!!error && editId === module.id}
                        >
                          {error && editId === module.id && (
                            <p
                              role="alert"
                              className="mb-4 rounded-md bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-900/40 dark:text-red-300"
                            >
                              {error}
                            </p>
                          )}
                          <form
                            id={`edit-module-${module.id}`}
                            action={actions.rename}
                            className="flex flex-col gap-4"
                          >
                            <label className={labelClass}>
                              <span>
                                Module name
                                <RequiredMark />
                              </span>
                              <input
                                name="name"
                                required
                                defaultValue={module.name}
                                className={inputClass}
                              />
                            </label>
                          </form>
                          <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-5">
                            <div className="flex items-center gap-2">
                              {showArchived ? (
                                <ConfirmForm
                                  action={actions.restore}
                                  confirmMessage="Restore this Module?"
                                >
                                  <SubmitButton variant="secondary" pendingLabel="Restoring…">
                                    Restore
                                  </SubmitButton>
                                </ConfirmForm>
                              ) : (
                                <ConfirmForm
                                  action={actions.archive}
                                  confirmMessage="Archive this Module?"
                                >
                                  <SubmitButton variant="secondary" pendingLabel="Archiving…">
                                    Archive
                                  </SubmitButton>
                                </ConfirmForm>
                              )}
                              <ConfirmForm
                                action={actions.remove}
                                confirmMessage="Delete this Module? This cannot be undone from the UI."
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
                              <FormSubmitButton formId={`edit-module-${module.id}`}>
                                Save
                              </FormSubmitButton>
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
