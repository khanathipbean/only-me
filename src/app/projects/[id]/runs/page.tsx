import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ALL_MEMBER_ROLES, EDITOR_ROLES, requireProjectRoleOrNotFound } from "@/lib/rbac";
import { getProjectById } from "@/lib/projects";
import {
  TestRunValidationError,
  createRun,
  listPhasesForProject,
  listRunsForProjectPage,
  setRunDeletedAt,
  setRunStatus,
  updateRun,
} from "@/lib/test-runs";
import { Breadcrumb } from "@/components/Breadcrumb";
import { ConfirmForm } from "@/components/ConfirmForm";
import { FilterForm } from "@/components/FilterForm";
import { nameOr, testRunsBreadcrumb } from "@/lib/breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { RequiredMark } from "@/components/forms/RequiredMark";
import { RowActions } from "@/components/ui/RowActions";
import { Badge } from "@/components/ui/Badge";
import { isTestRunOverdue } from "@/lib/deadlines";

import { SubmitButton } from "@/components/SubmitButton";
import { Select } from "@/components/ui/Select";
import { DialogCloseButton } from "@/components/ui/DialogCloseButton";
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
  return { title: project ? `Test Runs · ${project.name}` : "Test Runs" };
}

/** A date input hands back "YYYY-MM-DD"; read it as a UTC day so the value
 *  doesn't shift a day either way depending on where the server sits. */
function parseDay(value: FormDataEntryValue | null) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    return null;
  }
  const date = new Date(`${text}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toDayValue(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : "";
}

export default async function TestRunsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    search?: string;
    status?: string;
    archived?: string;
    overdue?: string;
    page?: string;
    pageSize?: string;
    error?: string;
    editId?: string;
  }>;
}) {
  const { id: projectId } = await params;
  const { search, status, archived, overdue, page, pageSize, error, editId } = await searchParams;
  const session = await auth();

  await requireProjectRoleOrNotFound(session!.user.id, projectId, ALL_MEMBER_ROLES);

  const showArchived = archived === "1";
  const showOverdue = overdue === "1";
  const hasFilters = Boolean(search || status || showArchived || showOverdue);

  const [project, result, phases] = await Promise.all([
    getProjectById(projectId),
    listRunsForProjectPage(projectId, {
      search,
      status: status === "OPEN" || status === "CLOSED" ? status : undefined,
      archived: showArchived,
      overdue: showOverdue,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    }),
    listPhasesForProject(projectId),
  ]);
  const runs = result.items;

  /* Plain strings only: a server action may close over serialisable values,
   * and capturing a helper function stops React encoding the action at all. */
  const listQueryString = new URLSearchParams(
    Object.entries({ search, status, archived, overdue, page, pageSize }).filter(
      (entry): entry is [string, string] => Boolean(entry[1]),
    ),
  ).toString();
  const listPath = `/projects/${projectId}/runs`;
  const listHref = listQueryString ? `${listPath}?${listQueryString}` : listPath;

  async function create(formData: FormData) {
    "use server";
    invalidateRouteCache();
    const session = await auth();
    await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
    try {
      await createRun(
        projectId,
        {
          name: formData.get("name") as string,
          phase: formData.get("phase") as string,
          startsOn: parseDay(formData.get("startsOn")),
          endsOn: parseDay(formData.get("endsOn")),
        },
        session!.user.id,
      );
    } catch (err) {
      if (err instanceof TestRunValidationError) {
        const query = new URLSearchParams(listQueryString);
        query.set("error", err.message);
        redirect(`${listPath}?${query}`);
      }
      throw err;
    }
    redirect(listHref);
  }

  /** Bound per row: an inline dialog needs one action per run. */
  function rowActions(runId: string) {
    return {
      async update(formData: FormData) {
        "use server";
        invalidateRouteCache();
        const session = await auth();
        await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
        try {
          await updateRun(
            runId,
            {
              name: formData.get("name") as string,
              phase: formData.get("phase") as string,
              startsOn: parseDay(formData.get("startsOn")),
              endsOn: parseDay(formData.get("endsOn")),
            },
            session!.user.id,
          );
        } catch (err) {
          if (err instanceof TestRunValidationError) {
            const query = new URLSearchParams(listQueryString);
            query.set("error", err.message);
            query.set("editId", runId);
            redirect(`${listPath}?${query}`);
          }
          throw err;
        }
        redirect(listHref);
      },
      async close() {
        "use server";
        invalidateRouteCache();
        const session = await auth();
        await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
        await setRunStatus(runId, "CLOSED", session!.user.id);
        redirect(listHref);
      },
      async reopen() {
        "use server";
        invalidateRouteCache();
        const session = await auth();
        await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
        await setRunStatus(runId, "OPEN", session!.user.id);
        redirect(listHref);
      },
      async archive() {
        "use server";
        invalidateRouteCache();
        const session = await auth();
        await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
        await setRunDeletedAt(runId, new Date(), session!.user.id);
        redirect(listHref);
      },
      async restore() {
        "use server";
        invalidateRouteCache();
        const session = await auth();
        await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
        await setRunDeletedAt(runId, null, session!.user.id);
        redirect(listHref);
      },
    };
  }

  return (
    <main className={pageClass}>
      <Breadcrumb
        segments={testRunsBreadcrumb({ id: projectId, name: nameOr(project, projectId) })}
      />
      <PageHeader
        title="Test Runs"
        subtitle="A round of testing — a Sprint's pass, a release check. Results belong to the round they were recorded in."
        actions={
          <Modal triggerLabel="+ New Run" title="New Test Run" openOnMount={!!error && !editId}>
            {error && !editId && (
              <p
                role="alert"
                className="mb-4 rounded-md bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-900/40 dark:text-red-300"
              >
                {error}
              </p>
            )}
            <form action={create} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className={`${labelClass} sm:col-span-2`}>
                <span>
                  Run name
                  <RequiredMark />
                </span>
                <input name="name" required placeholder="e.g. Sprint 14" className={inputClass} />
              </label>
              <label className={`${labelClass} sm:col-span-2`}>
                Phase
                {/* A suggestion list, not a closed set — the same shape as a
                    Requirement's Feature. A phase is only a name here: the
                    dates and the status belong to the sprints inside it. A
                    spelling that matches one already in use is re-spelled to
                    it server-side, so case can't split a phase in two. */}
                <input
                  name="phase"
                  list="run-phases"
                  placeholder="Six sprints to a phase, e.g. Phase 2"
                  className={inputClass}
                />
                <datalist id="run-phases">
                  {phases.map((value) => (
                    <option key={value} value={value} />
                  ))}
                </datalist>
              </label>
              <label className={labelClass}>
                Starts on
                <input type="date" name="startsOn" className={inputClass} />
              </label>
              <label className={labelClass}>
                Ends on
                <input type="date" name="endsOn" className={inputClass} />
              </label>
              <div className="mt-2 flex flex-wrap justify-end gap-2 sm:col-span-2">
                <DialogCloseButton />
                <SubmitButton pendingLabel="Creating…">Create Run</SubmitButton>
              </div>
            </form>
          </Modal>
        }
      />

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
          placeholder="Search run name"
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
              { value: "OPEN", label: "Open" },
              { value: "CLOSED", label: "Closed" },
            ]}
            ariaLabel="Status"
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
        <label className={labelClass}>
          Deadline
          <Select
            name="overdue"
            defaultValue={overdue ?? ""}
            options={[
              { value: "", label: "All" },
              { value: "1", label: "Overdue only" },
            ]}
            ariaLabel="Deadline"
            className="max-w-36"
          />
        </label>
      </FilterForm>

      {runs.length === 0 ? (
        <p className={mutedTextClass}>
          {showArchived
            ? "No archived runs."
            : hasFilters
              ? "No runs match your search."
              : "No runs yet. Create one to re-test cases you already have."}
        </p>
      ) : (
        <div className={tableWrapClass}>
          <table className={tableClass}>
            <colgroup>
              <col className="w-[34%]" />
              <col className="w-[20%]" />
              <col className="w-[16%]" />
              <col className="w-[16%]" />
              <col className="w-[14%]" />
            </colgroup>
            <thead>
              <tr>
                <th className={thClass}>Name</th>
                <th className={thClass}>Dates</th>
                <th className={thCenterClass}>Progress</th>
                <th className={thCenterClass}>Status</th>
                <th className={thCenterClass}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => {
                const actions = rowActions(run.id);
                const total = run._count.cases;
                const pct = total > 0 ? Math.round((run.ranCount / total) * 100) : 0;
                return (
                  <tr key={run.id} className={trHoverClass}>
                    <td className={tdClass}>
                      {/* The phase beside the name, the way a Requirement wears
                          its Feature: six sprints share one, so the name alone
                          ("Sprint 4") never said which round of which phase. */}
                      <div className="flex items-baseline gap-2">
                        <Link
                          href={`${listPath}/${run.id}`}
                          className="min-w-0 font-medium text-foreground hover:text-brand hover:underline"
                        >
                          {run.name}
                        </Link>
                        {run.phase && (
                          <span className="shrink-0">
                            <Badge tone="gray" variant="outline">
                              {run.phase}
                            </Badge>
                          </span>
                        )}
                      </div>
                    </td>
                    <td className={`${tdClass} text-muted`}>
                      {run.startsOn || run.endsOn
                        ? `${toDayValue(run.startsOn) || "—"} → ${toDayValue(run.endsOn) || "—"}`
                        : "—"}
                    </td>
                    <td className={`${tdCenterClass} tabular-nums`}>
                      {total === 0 ? (
                        <span className="text-muted">no cases yet</span>
                      ) : (
                        <>
                          {run.ranCount} / {total}
                          <span className="ml-2 text-xs text-muted">{pct}%</span>
                        </>
                      )}
                    </td>
                    <td className={tdCenterClass}>
                      <span className="inline-flex items-center gap-1.5">
                        <Badge tone={run.status === "OPEN" ? "blue" : "gray"}>
                          {run.status === "OPEN" ? "Open" : "Closed"}
                        </Badge>
                        {isTestRunOverdue(run) && <Badge tone="red">Overdue</Badge>}
                      </span>
                    </td>
                    <td className={tdCenterClass}>
                      <div className="inline-flex items-center gap-1">
                        <RowActions
                          key={`${run.id}-${editId === run.id}`}
                          label={run.name}
                          title="Edit Run"
                          openOnMount={!!error && editId === run.id}
                        >
                          {error && editId === run.id && (
                            <p
                              role="alert"
                              className="mb-4 rounded-md bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-900/40 dark:text-red-300"
                            >
                              {error}
                            </p>
                          )}
                          <form
                            action={actions.update}
                            className="grid grid-cols-1 gap-4 sm:grid-cols-2"
                          >
                            <label className={`${labelClass} sm:col-span-2`}>
                              <span>
                                Run name
                                <RequiredMark />
                              </span>
                              <input
                                name="name"
                                required
                                defaultValue={run.name}
                                className={inputClass}
                              />
                            </label>
                            <label className={`${labelClass} sm:col-span-2`}>
                              Phase
                              <input
                                name="phase"
                                list="run-phases"
                                defaultValue={run.phase ?? ""}
                                placeholder="Six sprints to a phase, e.g. Phase 2"
                                className={inputClass}
                              />
                            </label>
                            <label className={labelClass}>
                              Starts on
                              <input
                                type="date"
                                name="startsOn"
                                defaultValue={toDayValue(run.startsOn)}
                                className={inputClass}
                              />
                            </label>
                            <label className={labelClass}>
                              Ends on
                              <input
                                type="date"
                                name="endsOn"
                                defaultValue={toDayValue(run.endsOn)}
                                className={inputClass}
                              />
                            </label>
                            <div className="mt-2 flex flex-wrap justify-end gap-2 sm:col-span-2">
                              <DialogCloseButton />
                              <SubmitButton disabled={run.status === "CLOSED"}>
                                Save
                              </SubmitButton>
                            </div>
                          </form>

                          <section className="mt-6 flex flex-wrap justify-end gap-2 border-t border-border pt-5">
                            {run.status === "OPEN" ? (
                              <ConfirmForm
                                action={actions.close}
                                confirmMessage="Close this run? Its results can't be changed until it is reopened."
                              >
                                <SubmitButton variant="secondary" pendingLabel="Closing…">
                                  Close run
                                </SubmitButton>
                              </ConfirmForm>
                            ) : (
                              <ConfirmForm
                                action={actions.reopen}
                                confirmMessage="Reopen this run so its results can be changed again?"
                              >
                                <SubmitButton variant="secondary" pendingLabel="Reopening…">
                                  Reopen run
                                </SubmitButton>
                              </ConfirmForm>
                            )}
                            {showArchived ? (
                              <ConfirmForm
                                action={actions.restore}
                                confirmMessage="Restore this run?"
                              >
                                <SubmitButton variant="secondary" pendingLabel="Restoring…">
                                  Restore
                                </SubmitButton>
                              </ConfirmForm>
                            ) : (
                              <ConfirmForm
                                action={actions.archive}
                                confirmMessage="Archive this run? Its results are kept."
                              >
                                <SubmitButton variant="secondary" pendingLabel="Archiving…">
                                  Archive
                                </SubmitButton>
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
