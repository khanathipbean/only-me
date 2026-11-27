import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { can, requireCapabilityOrNotFound } from "@/lib/permissions";
import { getProjectById } from "@/lib/projects";
import { listAllMembers } from "@/lib/members";
import {
  TEST_PLAN_STATUSES,
  TestPlanValidationError,
  archiveTestPlan,
  createTestPlan,
  listPlanPhases,
  listTestPlansForProjectPage,
  restoreTestPlan,
  summariseTestPlan,
  updateTestPlan,
} from "@/lib/test-plans";
import { Breadcrumb } from "@/components/Breadcrumb";
import { DismissibleAlert } from "@/components/DismissibleAlert";
import { ConfirmForm } from "@/components/ConfirmForm";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { FilterForm } from "@/components/FilterForm";
import { ResultCount } from "@/components/ui/ResultCount";
import { testPlansBreadcrumb, nameOr } from "@/lib/breadcrumb";
import { withToast } from "@/lib/toast";
import { formatDate } from "@/lib/dates";
import { PageHeader } from "@/components/ui/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { RequiredMark } from "@/components/forms/RequiredMark";
import { RowActions } from "@/components/ui/RowActions";
import { SubmitButton } from "@/components/SubmitButton";
import { Select } from "@/components/ui/Select";
import { DialogCloseButton } from "@/components/ui/DialogCloseButton";
import { Badge } from "@/components/ui/Badge";
import { Stat } from "@/components/ui/Stat";
import { ClipboardListIcon, PulseIcon, ListChecksIcon, ShieldIcon } from "@/components/icons";
import { invalidateRouteCache } from "@/lib/revalidate";
import { listHrefWithFilters } from "@/lib/hrefs";
import { planStatusLabel, planStatusTone } from "@/lib/test-plan-ui";
import type { TestPlanStatus } from "@/generated/prisma/client";
import {
  inputClass,
  labelClass,
  mutedTextClass,
  pageClass,
  tableClass,
  tableWrapClass,
  tdCenterClass,
  tdClass,
  textareaClass,
  thCenterClass,
  thClass,
} from "@/lib/ui";

/**
 * The form's fields, read once for both the create and the edit action.
 *
 * At module scope on purpose: a server action carries its closure across the
 * wire, and a function caught in that closure cannot be serialised — Next
 * refuses the whole page with "Functions cannot be passed directly to Client
 * Components". It needs nothing from the component anyway.
 */
function readForm(formData: FormData) {
  const date = (key: string) => {
    const value = (formData.get(key) as string) ?? "";
    return value ? new Date(value) : null;
  };
  return {
    name: formData.get("name") as string,
    phase: formData.get("phase") as string,
    objective: formData.get("objective") as string,
    description: formData.get("description") as string,
    environment: formData.get("environment") as string,
    build: formData.get("build") as string,
    startsOn: date("startsOn"),
    endsOn: date("endsOn"),
    ownerId: formData.get("ownerId") as string,
    status: formData.get("status") as TestPlanStatus,
  };
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProjectById(id);
  return { title: project ? `Test Plans · ${project.name}` : "Test Plans" };
}

/**
 * The phases of testing this project has planned.
 *
 * A plan groups several rounds under one phase and names the scope they are
 * meant to cover. It records no result of its own: every figure here is read
 * from the rounds linked to it, so a plan and its rounds cannot disagree.
 */
export default async function TestPlansPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    search?: string;
    phase?: string;
    status?: string;
    ownerId?: string;
    page?: string;
    pageSize?: string;
    error?: string;
    editId?: string;
  }>;
}) {
  const { id: projectId } = await params;
  const { search, phase, status, ownerId, page, pageSize, error, editId } = await searchParams;
  const session = await auth();

  const membership = await requireCapabilityOrNotFound(session!.user.id, projectId, "plans.view");
  const canEdit = await can(membership.role, "plans.manage");

  const hasFilters = Boolean(search || phase || status || ownerId);

  const [project, members, phases, result] = await Promise.all([
    getProjectById(projectId),
    listAllMembers({ projectId }),
    listPlanPhases(projectId),
    listTestPlansForProjectPage(projectId, {
      search,
      phase,
      status: status ? (status as TestPlanStatus) : undefined,
      ownerId,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    }),
  ]);
  const plans = result.plans;

  /* One summary per row. They are read from the rounds, so there is no
     cheaper way to get them — and a page holds ten rows, not a thousand. */
  const summaries = await Promise.all(plans.map((plan) => summariseTestPlan(plan.id)));

  /* The four cards count every plan in the project, not the page: a filter
     narrows the table, and a card that moved with it could not be used to
     choose a filter. */
  const counts = await Promise.all(
    TEST_PLAN_STATUSES.map(async (value) => ({
      value,
      total: (await listTestPlansForProjectPage(projectId, { status: value, pageSize: 1 })).total,
    })),
  );
  const totalPlans = counts.reduce((sum, row) => sum + row.total, 0);
  const countOf = (value: TestPlanStatus) =>
    counts.find((row) => row.value === value)?.total ?? 0;

  const listPath = `/projects/${projectId}/plans`;
  const { query: listQueryString, href: listHref } = listHrefWithFilters(listPath, {
    search,
    phase,
    status,
    ownerId,
    page,
    pageSize,
  });

  const memberOptions = members.map((row) => ({
    value: row.user.id,
    label: row.user.name ?? row.user.email,
  }));

  async function create(formData: FormData) {
    "use server";
    invalidateRouteCache();
    const session = await auth();
    await requireCapabilityOrNotFound(session!.user.id, projectId, "plans.manage");
    let created;
    try {
      created = await createTestPlan(projectId, readForm(formData), session!.user.id);
    } catch (err) {
      if (err instanceof TestPlanValidationError) {
        const query = new URLSearchParams(listQueryString);
        query.set("error", err.message);
        redirect(`${listPath}?${query}`);
      }
      throw err;
    }
    /* Straight to the plan, because the next thing anybody does is choose
       what it covers, and that is on its own page. */
    redirect(withToast(`${listPath}/${created.id}`, "Plan created — now choose its scope"));
  }

  function rowActions(planId: string) {
    return {
      async edit(formData: FormData) {
        "use server";
        invalidateRouteCache();
        const session = await auth();
        await requireCapabilityOrNotFound(session!.user.id, projectId, "plans.manage");
        try {
          await updateTestPlan(planId, readForm(formData), session!.user.id);
        } catch (err) {
          if (err instanceof TestPlanValidationError) {
            const query = new URLSearchParams(listQueryString);
            query.set("error", err.message);
            query.set("editId", planId);
            redirect(`${listPath}?${query}`);
          }
          throw err;
        }
        redirect(withToast(listHref, "Plan saved"));
      },
      async archive() {
        "use server";
        invalidateRouteCache();
        const session = await auth();
        await requireCapabilityOrNotFound(session!.user.id, projectId, "plans.manage");
        await archiveTestPlan(planId, session!.user.id);
        redirect(withToast(listHref, "Plan archived"));
      },
      async restore() {
        "use server";
        invalidateRouteCache();
        const session = await auth();
        await requireCapabilityOrNotFound(session!.user.id, projectId, "plans.manage");
        await restoreTestPlan(planId, session!.user.id);
        redirect(withToast(listHref, "Plan restored"));
      },
    };
  }

  /** Both dialogs ask for the same things, in the order the spec lists. */
  function fields(defaults?: {
    name: string;
    phase: string;
    objective: string;
    description: string | null;
    environment: string | null;
    build: string | null;
    startsOn: Date | null;
    endsOn: Date | null;
    ownerId: string;
    status: TestPlanStatus;
  }) {
    const asInput = (date: Date | null | undefined) =>
      date ? date.toISOString().slice(0, 10) : "";
    return (
      <>
        <label className={labelClass}>
          <span>
            Plan name
            <RequiredMark />
          </span>
          <input
            type="text"
            name="name"
            defaultValue={defaults?.name}
            required
            placeholder="e.g. UAT Phase 2 — Policy Center"
            className={inputClass}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            <span>
              Phase
              <RequiredMark />
            </span>
            {/* Free text with the phases already in use offered: a round
                carries the same label, and a plan that invents a new spelling
                of one would split the Dashboard's filter in two. */}
            <input
              type="text"
              name="phase"
              defaultValue={defaults?.phase}
              required
              list="plan-phases"
              placeholder="e.g. Sprint 12"
              className={inputClass}
            />
            <datalist id="plan-phases">
              {phases.map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
          </label>
          <label className={labelClass}>
            <span>
              Owner
              <RequiredMark />
            </span>
            <Select
              name="ownerId"
              defaultValue={defaults?.ownerId ?? session!.user.id}
              options={memberOptions}
              ariaLabel="Owner"
            />
          </label>
        </div>
        <label className={labelClass}>
          <span>
            Objective
            <RequiredMark />
          </span>
          <textarea
            name="objective"
            defaultValue={defaults?.objective}
            required
            rows={2}
            placeholder="What this phase is meant to prove"
            className={textareaClass}
          />
        </label>
        <label className={labelClass}>
          Description
          <textarea
            name="description"
            defaultValue={defaults?.description ?? ""}
            rows={2}
            placeholder="Anything the team should read before starting"
            className={textareaClass}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            Environment
            <input
              type="text"
              name="environment"
              defaultValue={defaults?.environment ?? ""}
              placeholder="e.g. UAT · 10.10.10.65"
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Build / version
            <input
              type="text"
              name="build"
              defaultValue={defaults?.build ?? ""}
              placeholder="e.g. 1.4.0-rc3"
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Start date
            <input
              type="date"
              name="startsOn"
              defaultValue={asInput(defaults?.startsOn)}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            End date
            <input
              type="date"
              name="endsOn"
              defaultValue={asInput(defaults?.endsOn)}
              className={inputClass}
            />
          </label>
        </div>
        <label className={labelClass}>
          <span>
            Status
            <RequiredMark />
          </span>
          <Select
            name="status"
            defaultValue={defaults?.status ?? "DRAFT"}
            options={TEST_PLAN_STATUSES.map((value) => ({
              value,
              label: planStatusLabel(value),
            }))}
            ariaLabel="Status"
          />
          <span className={mutedTextClass}>
            Completed is refused while a case in the scope has not passed.
          </span>
        </label>
      </>
    );
  }

  return (
    <main className={pageClass}>
      <Breadcrumb
        segments={testPlansBreadcrumb({ id: projectId, name: nameOr(project, projectId) })}
      />

      <PageHeader
        title="Test Plans"
        subtitle="One phase of testing: what it covers, who owns it, and the rounds run against it. The cases come from this project — nothing is written twice."
        actions={
          canEdit && (
            <Modal triggerLabel="+ New Test Plan" title="New Test Plan" openOnMount={!!error && !editId}>
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
                  <SubmitButton>Create plan</SubmitButton>
                </div>
              </form>
            </Modal>
          )
        }
      />

      {error && !editId && <DismissibleAlert>{error}</DismissibleAlert>}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat icon={<ClipboardListIcon />} label="Total plans" value={totalPlans} />
        <Stat icon={<PulseIcon />} label="In progress" value={countOf("IN_PROGRESS")} />
        <Stat icon={<ListChecksIcon />} label="Completed" value={countOf("COMPLETED")} />
        <Stat icon={<ShieldIcon />} label="On hold" value={countOf("ON_HOLD")} />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <FilterForm showClear={hasFilters} className="flex-1">
          <input
            type="text"
            name="search"
            placeholder="Search plan name"
            defaultValue={search}
            className={`${inputClass} max-w-xs`}
          />
          {phases.length > 0 && (
            <label className={labelClass}>
              Phase
              <Select
                name="phase"
                defaultValue={phase ?? ""}
                options={[
                  { value: "", label: "All phases" },
                  ...phases.map((value) => ({ value, label: value })),
                ]}
                ariaLabel="Phase"
                autoWidth
                className="max-w-52"
              />
            </label>
          )}
          <label className={labelClass}>
            Status
            <Select
              name="status"
              defaultValue={status ?? ""}
              options={[
                { value: "", label: "All statuses" },
                ...TEST_PLAN_STATUSES.map((value) => ({ value, label: planStatusLabel(value) })),
              ]}
              ariaLabel="Status"
              autoWidth
              className="max-w-44"
            />
          </label>
          <label className={labelClass}>
            Owner
            <Select
              name="ownerId"
              defaultValue={ownerId ?? ""}
              options={[{ value: "", label: "Anyone" }, ...memberOptions]}
              ariaLabel="Owner"
              autoWidth
              className="max-w-52"
            />
          </label>
        </FilterForm>
        <ResultCount total={result.total} />
      </div>

      {plans.length === 0 ? (
        <p className={mutedTextClass}>
          {hasFilters
            ? "No plans match your search."
            : "No test plans yet. A plan is one phase of testing — give it an objective and an owner, then choose the cases it covers."}
        </p>
      ) : (
        <div className={tableWrapClass}>
          <table className={tableClass}>
            <colgroup>
              <col className="w-[28%]" />
              <col className="w-[10%]" />
              <col className="w-[12%]" />
              <col className="w-[7%]" />
              <col className="w-[14%]" />
              <col className="w-[10%]" />
              <col className="w-[11%]" />
              <col className="w-[8%]" />
            </colgroup>
            <thead>
              <tr>
                <th className={thClass}>Plan name</th>
                <th className={thClass}>Phase</th>
                <th className={thClass}>Scope</th>
                <th className={thCenterClass}>Runs</th>
                <th className={thClass}>Progress</th>
                <th className={thClass}>Status</th>
                <th className={thClass}>Owner</th>
                <th className={thCenterClass}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan, index) => {
                const actions = rowActions(plan.id);
                const summary = summaries[index];
                return (
                  <tr key={plan.id}>
                    <td className={tdClass}>
                      <Link
                        href={`${listPath}/${plan.id}`}
                        className="font-medium text-foreground hover:text-brand hover:underline"
                      >
                        {plan.name}
                      </Link>
                      <div className={mutedTextClass}>Updated {formatDate(plan.updatedAt)}</div>
                    </td>
                    <td className={tdClass}>
                      <Badge tone="gray" variant="outline">
                        {plan.phase}
                      </Badge>
                    </td>
                    <td className={`${tdClass} text-muted`}>
                      {summary.cases === 0 ? "No cases yet" : `${summary.cases} cases`}
                    </td>
                    <td className={tdCenterClass}>{summary.runs}</td>
                    <td className={tdClass}>
                      {/* Answered over scope, the same sum the Dashboard
                          calls Test Progress. A plan with no round is at
                          zero rather than at nothing. */}
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 min-w-12 flex-1 overflow-hidden rounded-full bg-black/[.06] dark:bg-white/[.08]">
                          <div
                            className="h-1.5 rounded-full bg-brand"
                            style={{ width: `${summary.progress}%` }}
                          />
                        </div>
                        <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted">
                          {Math.round(summary.progress)}%
                        </span>
                      </div>
                    </td>
                    <td className={tdClass}>
                      <Badge tone={planStatusTone(plan.status)}>
                        {planStatusLabel(plan.status)}
                      </Badge>
                    </td>
                    <td className={`${tdClass} truncate text-muted`}>
                      {plan.owner.name ?? plan.owner.email}
                    </td>
                    <td className={tdCenterClass}>
                      {canEdit && (
                        <RowActions
                          /* `updatedAt` in the key so a successful save
                             remounts this: the dialog's open state lives in
                             the client component and would otherwise survive
                             the redirect. */
                          key={`${plan.id}-${plan.updatedAt.getTime()}-${editId === plan.id}`}
                          label={plan.name}
                          title="Edit Test Plan"
                          openHref={`${listPath}/${plan.id}`}
                          openOnMount={!!error && editId === plan.id}
                        >
                          {error && editId === plan.id && (
                            <p
                              role="alert"
                              className="mb-4 rounded-md bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-900/40 dark:text-red-300"
                            >
                              {error}
                            </p>
                          )}
                          <form
                            id={`edit-plan-${plan.id}`}
                            action={actions.edit}
                            className="flex flex-col gap-4"
                          >
                            {fields(plan)}
                          </form>
                          <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-5">
                            {plan.deletedAt ? (
                              <ConfirmForm
                                action={actions.restore}
                                confirmMessage="Restore this plan?"
                              >
                                <SubmitButton variant="secondary" pendingLabel="Restoring…">
                                  Restore
                                </SubmitButton>
                              </ConfirmForm>
                            ) : (
                              <ConfirmForm
                                action={actions.archive}
                                confirmMessage="Archive this plan? Its rounds and their results are untouched."
                              >
                                <SubmitButton variant="secondary" pendingLabel="Archiving…">
                                  Archive
                                </SubmitButton>
                              </ConfirmForm>
                            )}
                            <div className="flex items-center gap-2">
                              <DialogCloseButton />
                              <FormSubmitButton formId={`edit-plan-${plan.id}`}>
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
