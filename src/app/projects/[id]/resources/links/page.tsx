import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { can, requireCapabilityOrNotFound } from "@/lib/permissions";
import { getProjectById } from "@/lib/projects";
import { listModulesForProject } from "@/lib/modules";
import { listFeaturesForModule, listFeaturesForProjectNotes } from "@/lib/requirements";
import {
  LinkValidationError,
  archiveLink,
  createLink,
  listLinksForProjectPage,
  restoreLink,
  updateLink,
} from "@/lib/links";
import { Breadcrumb } from "@/components/Breadcrumb";
import { ResourceTabs } from "../ResourceTabs";
import { DismissibleAlert } from "@/components/DismissibleAlert";
import { ConfirmForm } from "@/components/ConfirmForm";
import { FilterForm } from "@/components/FilterForm";
import { ResultCount } from "@/components/ui/ResultCount";
import { resourcesBreadcrumb, nameOr } from "@/lib/breadcrumb";
import { withToast } from "@/lib/toast";
import { formatDate } from "@/lib/dates";
import { PageHeader } from "@/components/ui/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { RequiredMark } from "@/components/forms/RequiredMark";
import { RowActions } from "@/components/ui/RowActions";
import { SubmitButton } from "@/components/SubmitButton";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { Select } from "@/components/ui/Select";
import { DialogCloseButton } from "@/components/ui/DialogCloseButton";
import { Badge } from "@/components/ui/Badge";
import { ArrowUpRightIcon } from "@/components/icons";
import { invalidateRouteCache } from "@/lib/revalidate";
import { listHrefWithFilters } from "@/lib/hrefs";
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

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProjectById(id);
  return { title: project ? `Resources · ${project.name}` : "Resources" };
}

/**
 * The other half of Resources: addresses for the things this project depends
 * on that do not live in this app — the ticket a round was raised from, the
 * sheet the cases came out of, the environment being tested.
 *
 * Built against the Notes page beside it rather than from scratch: the same
 * filters, the same Module and Feature, the same archive-and-restore. A
 * reader crossing between the two tabs should meet one page that happens to
 * hold two kinds of thing, not two pages that were written months apart.
 */
export default async function LinksPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    search?: string;
    moduleId?: string;
    feature?: string;
    archived?: string;
    page?: string;
    pageSize?: string;
    error?: string;
    editId?: string;
  }>;
}) {
  const { id: projectId } = await params;
  const { search, moduleId, feature, archived, page, pageSize, error, editId } =
    await searchParams;
  const session = await auth();

  /* The same capability the Notes tab checks. Resources is one page with two
   * views, so one answer to "may this person open it" — and the keys stay
   * `notes.*` because a stored RolePermission override names them. */
  const membership = await requireCapabilityOrNotFound(
    session!.user.id,
    projectId,
    "notes.view",
  );
  const canEdit = await can(membership.role, "notes.write");
  const canSeeFiles = await can(membership.role, "files.view");

  const showArchived = archived === "1";
  const hasFilters = Boolean(search || moduleId || feature || showArchived);

  const [project, modules, result] = await Promise.all([
    getProjectById(projectId),
    listModulesForProject(projectId),
    listLinksForProjectPage(projectId, {
      search,
      moduleId,
      feature,
      archived: showArchived,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    }),
  ]);
  const links = result.items;

  /* Features belong to a Module, so suggestions only mean anything once one
     scope is chosen — the same rule, and the same two helpers, the Notes tab
     uses. "No module" is a scope too. */
  const features =
    moduleId === "none"
      ? await listFeaturesForProjectNotes(projectId)
      : moduleId
        ? await listFeaturesForModule(moduleId)
        : [];

  const listPath = `/projects/${projectId}/resources/links`;
  const { query: listQueryString, href: listHref } = listHrefWithFilters(listPath, {
    search,
    moduleId,
    feature,
    archived,
    page,
    pageSize,
  });

  const moduleOptions = modules.map((row) => ({ value: row.id, label: row.name }));

  async function create(formData: FormData) {
    "use server";
    invalidateRouteCache();
    const session = await auth();
    await requireCapabilityOrNotFound(session!.user.id, projectId, "notes.write");
    try {
      await createLink(
        projectId,
        {
          moduleId: formData.get("moduleId") as string,
          feature: formData.get("feature") as string,
          title: formData.get("title") as string,
          url: formData.get("url") as string,
        },
        session!.user.id,
      );
    } catch (err) {
      if (err instanceof LinkValidationError) {
        const query = new URLSearchParams(listQueryString);
        query.set("error", err.message);
        redirect(`${listPath}?${query}`);
      }
      throw err;
    }
    redirect(withToast(listHref, "Link added"));
  }

  /** Bound per row: an inline Edit dialog needs one action per Link. */
  function rowActions(linkId: string) {
    return {
      async edit(formData: FormData) {
        "use server";
        invalidateRouteCache();
        const session = await auth();
        await requireCapabilityOrNotFound(session!.user.id, projectId, "notes.write");
        try {
          await updateLink(
            linkId,
            {
              moduleId: formData.get("moduleId") as string,
              feature: formData.get("feature") as string,
              title: formData.get("title") as string,
              url: formData.get("url") as string,
            },
            session!.user.id,
          );
        } catch (err) {
          if (err instanceof LinkValidationError) {
            const query = new URLSearchParams(listQueryString);
            query.set("error", err.message);
            query.set("editId", linkId);
            redirect(`${listPath}?${query}`);
          }
          throw err;
        }
        redirect(withToast(listHref, "Link saved"));
      },
      async archive() {
        "use server";
        invalidateRouteCache();
        const session = await auth();
        await requireCapabilityOrNotFound(session!.user.id, projectId, "notes.write");
        await archiveLink(linkId, session!.user.id);
        redirect(withToast(listHref, "Link archived"));
      },
      async restore() {
        "use server";
        invalidateRouteCache();
        const session = await auth();
        await requireCapabilityOrNotFound(session!.user.id, projectId, "notes.write");
        await restoreLink(linkId, session!.user.id);
        redirect(withToast(listHref, "Link restored"));
      },
    };
  }

  /** The create and edit dialogs ask for the same four things. */
  function fields(defaults?: {
    moduleId: string | null;
    feature: string | null;
    title: string;
    url: string;
  }) {
    return (
      <>
        <label className={labelClass}>
          Address
          <RequiredMark />
          {/* First, because that is the order it happens in: somebody has an
              address on the clipboard and comes here to put it somewhere.
              `type="url"` so a phone offers the right keyboard; the real
              check is `assertSafeUrl` on the server, which refuses anything
              that is not http or https. */}
          <input
            type="url"
            name="url"
            defaultValue={defaults?.url}
            required
            placeholder="https://"
            className={inputClass}
          />
          <span className={mutedTextClass}>
            Paste it. Only http:// and https:// addresses can be stored.
          </span>
        </label>
        <label className={labelClass}>
          Title
          <RequiredMark />
          <input
            type="text"
            name="title"
            defaultValue={defaults?.title}
            required
            placeholder="e.g. Jira epic for Policy Center"
            className={inputClass}
          />
          <span className={mutedTextClass}>
            What this is, in the team&apos;s own words — an address on its own tells the next
            person nothing.
          </span>
        </label>
        <label className={labelClass}>
          Module
          {/* Optional, for the same reason a Note's is: a link about the
              Project — the environment, the board the whole thing is tracked
              on — has no honest answer here, and requiring one only files it
              under whichever Module was nearest. */}
          <Select
            name="moduleId"
            defaultValue={defaults?.moduleId ?? ""}
            options={[{ value: "", label: "No module — about the Project" }, ...moduleOptions]}
            ariaLabel="Module"
          />
        </label>
        <label className={labelClass}>
          Feature
          {/* A suggestion list, not a closed set — the same control and the
              same server-side re-spelling the Note and Requirement forms use,
              so a Feature stays one group however it was typed. */}
          <input
            name="feature"
            defaultValue={defaults?.feature ?? ""}
            list="link-features"
            placeholder="Sub-area of the module, e.g. Policy Center"
            className={inputClass}
          />
          <datalist id="link-features">
            {features.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
        </label>
      </>
    );
  }

  return (
    <main className={pageClass}>
      <Breadcrumb
        segments={resourcesBreadcrumb({ id: projectId, name: nameOr(project, projectId) })}
      />
      <PageHeader
        title="Resources"
        subtitle="Addresses for the things this project depends on that live somewhere else — a ticket, a sheet, a design, the environment under test."
        actions={
          canEdit && (
            <Modal triggerLabel="+ New Link" title="New Link" openOnMount={!!error && !editId}>
              {error && !editId && (
                <p
                  role="alert"
                  className="mb-4 rounded-md bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-900/40 dark:text-red-300"
                >
                  {error}
                </p>
              )}
              <form action={create} className="flex flex-col gap-4">
                {fields()}
                <div className="mt-2 flex flex-wrap justify-end gap-2">
                  <DialogCloseButton />
                  <SubmitButton>Add link</SubmitButton>
                </div>
              </form>
            </Modal>
          )
        }
      />

      {error && !editId && <DismissibleAlert>{error}</DismissibleAlert>}

      <ResourceTabs projectId={projectId} active="links" canSeeFiles={canSeeFiles} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <FilterForm showClear={hasFilters} className="flex-1">
          <input
            type="text"
            name="search"
            placeholder="Search title and address"
            defaultValue={search}
            className={`${inputClass} max-w-xs`}
          />
          <label className={labelClass}>
            Module
            <Select
              name="moduleId"
              defaultValue={moduleId ?? ""}
              options={[
                { value: "", label: "All modules" },
                { value: "none", label: "No module" },
                ...moduleOptions,
              ]}
              ariaLabel="Module"
              autoWidth
              className="max-w-52"
            />
          </label>
          {features.length > 0 && (
            <label className={labelClass}>
              Feature
              <Select
                name="feature"
                defaultValue={feature ?? ""}
                options={[
                  { value: "", label: "All features" },
                  ...features.map((value) => ({ value, label: value })),
                ]}
                ariaLabel="Feature"
                autoWidth
                className="max-w-52"
              />
            </label>
          )}
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

      {links.length === 0 ? (
        <p className={mutedTextClass}>
          {showArchived
            ? "No archived links."
            : hasFilters
              ? "No links match your search."
              : "No links yet. Paste the address of a ticket, a sheet or the environment being tested, so the next person does not have to go looking for it."}
        </p>
      ) : (
        <div className={tableWrapClass}>
          <table className={tableClass}>
            <colgroup>
              <col className="w-[30%]" />
              <col className="w-[30%]" />
              <col className="w-[14%]" />
              <col className="w-[10%]" />
              <col className="w-[8%]" />
              <col className="w-[8%]" />
            </colgroup>
            <thead>
              <tr>
                <th className={thClass}>Title</th>
                <th className={thClass}>Address</th>
                <th className={thClass}>Module</th>
                <th className={thClass}>Added</th>
                <th className={thClass}>By</th>
                <th className={thCenterClass}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {links.map((link) => {
                const actions = rowActions(link.id);
                return (
                  <tr key={link.id}>
                    <td className={tdClass}>
                      <div className="flex items-baseline gap-2">
                        {/* `rel="noopener noreferrer"`, not decoration: a page
                            opened with `target="_blank"` can otherwise reach
                            back through `window.opener` and navigate the tab
                            it came from, which is this app's tab with this
                            reader signed in. These addresses are typed by
                            people and point anywhere. */}
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-w-0 items-baseline gap-1.5 font-medium text-foreground hover:text-brand hover:underline"
                        >
                          <span className="min-w-0 truncate">{link.title}</span>
                          <ArrowUpRightIcon className="size-3.5 shrink-0 text-brand" />
                        </a>
                        {link.feature && (
                          <span className="shrink-0">
                            <Badge tone="gray" variant="outline">
                              {link.feature}
                            </Badge>
                          </span>
                        )}
                      </div>
                    </td>
                    {/* The address in full, not just the host: people decide
                        whether to click from what it says, and "atlassian"
                        alone does not say which ticket. */}
                    <td className={`${tdClass} truncate text-muted`}>{link.url}</td>
                    <td className={tdClass}>
                      {link.module ? (
                        <Badge tone="indigo">{link.module.name}</Badge>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className={`${tdClass} text-muted`}>{formatDate(link.createdAt)}</td>
                    <td className={`${tdClass} truncate text-muted`}>
                      {link.createdBy.name ?? link.createdBy.email}
                    </td>
                    <td className={tdCenterClass}>
                      {canEdit && (
                        <RowActions
                          /* `updatedAt` in the key so a successful save
                             remounts this: the dialog's open state lives in
                             the client component and would otherwise survive
                             the redirect, sitting open over a row that has
                             already changed behind it. */
                          key={`${link.id}-${link.updatedAt.getTime()}-${editId === link.id}`}
                          label={link.title}
                          title="Edit Link"
                          openOnMount={!!error && editId === link.id}
                        >
                          {error && editId === link.id && (
                            <p
                              role="alert"
                              className="mb-4 rounded-md bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-900/40 dark:text-red-300"
                            >
                              {error}
                            </p>
                          )}
                          <form
                            id={`edit-link-${link.id}`}
                            action={actions.edit}
                            className="flex flex-col gap-4"
                          >
                            {fields({
                              moduleId: link.moduleId,
                              feature: link.feature,
                              title: link.title,
                              url: link.url,
                            })}
                          </form>
                          <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-5">
                            {showArchived ? (
                              <ConfirmForm
                                action={actions.restore}
                                confirmMessage="Restore this link?"
                              >
                                <SubmitButton variant="secondary" pendingLabel="Restoring…">
                                  Restore
                                </SubmitButton>
                              </ConfirmForm>
                            ) : (
                              <ConfirmForm
                                action={actions.archive}
                                confirmMessage="Archive this link?"
                              >
                                <SubmitButton variant="secondary" pendingLabel="Archiving…">
                                  Archive
                                </SubmitButton>
                              </ConfirmForm>
                            )}
                            <div className="flex items-center gap-2">
                              <DialogCloseButton />
                              <FormSubmitButton formId={`edit-link-${link.id}`}>
                                Save
                              </FormSubmitButton>
                            </div>
                          </div>
                        </RowActions>
                      )}
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
        pageSize={result.pageSize}
        total={result.total}
        totalPages={result.totalPages}
      />
    </main>
  );
}
