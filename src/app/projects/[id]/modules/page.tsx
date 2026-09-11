import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ALL_MEMBER_ROLES, EDITOR_ROLES, requireProjectRoleOrNotFound } from "@/lib/rbac";
import { getProjectById } from "@/lib/projects";
import {
  ModuleValidationError,
  archiveModule,
  createModule,
  listModulesForProjectPage,
  renameModule,
  setModuleDeletedAt,
} from "@/lib/modules";
import { Breadcrumb } from "@/components/Breadcrumb";
import { ConfirmForm } from "@/components/ConfirmForm";
import { FilterForm } from "@/components/FilterForm";
import { modulesListBreadcrumb, nameOr } from "@/lib/breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { RequiredMark } from "@/components/forms/RequiredMark";
import { RowActions } from "@/components/ui/RowActions";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { DialogCloseButton } from "@/components/ui/DialogCloseButton";
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
    Object.entries({ search, archived }).filter(
      (entry): entry is [string, string] => Boolean(entry[1]),
    ),
  ).toString();
  const listPath = `/projects/${projectId}/modules`;
  const listHref = listQueryString ? `${listPath}?${listQueryString}` : listPath;

  async function create(formData: FormData) {
    "use server";
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
    redirect(listHref);
  }

  /** Bound per row: an inline Edit dialog needs one action per Module. */
  function rowActions(moduleId: string) {
    return {
      async rename(formData: FormData) {
        "use server";
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
        redirect(listHref);
      },
      async restore() {
        "use server";
        const session = await auth();
        await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
        await setModuleDeletedAt(moduleId, null, session!.user.id, "restore");
        redirect(listHref);
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
                <Button type="submit">Add module</Button>
              </div>
            </form>
          </Modal>
        }
      />

      {/* An archive refused for still being in use has no row dialog to land
          in, so the reason is shown against the list itself. */}
      {error && !editId && (
        <p
          role="alert"
          className="rounded-md bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-900/40 dark:text-red-300"
        >
          {error}
        </p>
      )}

      <FilterForm showClear={hasFilters}>
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
              <col className="w-[62%]" />
              <col className="w-[24%]" />
              <col className="w-[14%]" />
            </colgroup>
            <thead>
              <tr>
                <th className={thClass}>Name</th>
                <th className={thCenterClass}>Requirements</th>
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
                    </td>
                    <td className={`${tdCenterClass} text-muted`}>
                      {module._count.requirements}
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
                          <form action={actions.rename} className="flex flex-col gap-4">
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
                            <div className="mt-2 flex flex-wrap justify-end gap-2">
                              <DialogCloseButton />
                              <Button type="submit">Save</Button>
                            </div>
                          </form>
                          <section className="mt-6 flex justify-end border-t border-border pt-5">
                            {showArchived ? (
                              <ConfirmForm
                                action={actions.restore}
                                confirmMessage="Restore this Module?"
                              >
                                <Button type="submit" variant="secondary">
                                  Restore
                                </Button>
                              </ConfirmForm>
                            ) : (
                              <ConfirmForm
                                action={actions.archive}
                                confirmMessage="Archive this Module?"
                              >
                                <Button type="submit" variant="secondary">
                                  Archive
                                </Button>
                              </ConfirmForm>
                            )}
                          </section>
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
