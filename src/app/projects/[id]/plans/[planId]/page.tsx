import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { can, requireCapabilityOrNotFound } from "@/lib/permissions";
import { getProjectById } from "@/lib/projects";
import { listModulesForProject } from "@/lib/modules";
import {
  addCasesToPlan,
  archiveTestPlan,
  getTestPlanById,
  listCandidateCasesForPlan,
  listPlanCasesWithResults,
  listRunsForPlan,
  removeCasesFromPlan,
  summariseTestPlan,
} from "@/lib/test-plans";
import { Breadcrumb } from "@/components/Breadcrumb";
import { CasePicker } from "@/components/CasePicker";
import { ConfirmForm } from "@/components/ConfirmForm";
import { FilterForm } from "@/components/FilterForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { SubmitButton } from "@/components/SubmitButton";
import { Badge, testResultTone } from "@/components/ui/Badge";
import { testPlanBreadcrumb, nameOr } from "@/lib/breadcrumb";
import { testCaseHref } from "@/lib/hrefs";
import { formatDate } from "@/lib/dates";
import { withToast } from "@/lib/toast";
import { invalidateRouteCache } from "@/lib/revalidate";
import { planStatusLabel, planStatusTone } from "@/lib/test-plan-ui";
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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; planId: string }>;
}) {
  const { planId } = await params;
  const plan = await getTestPlanById(planId);
  return { title: plan ? `${plan.name} · Test Plans` : "Test Plan" };
}

/**
 * One plan: what it is for, what it covers, and what the rounds under it have
 * found.
 *
 * Nothing on this page records a result. Every figure is read from the rounds
 * through the same resolver the Dashboard uses for a phase, so a plan and its
 * rounds cannot tell different stories.
 */
export default async function TestPlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; planId: string }>;
  searchParams: Promise<{ moduleId?: string; search?: string }>;
}) {
  const { id: projectId, planId } = await params;
  const { moduleId, search } = await searchParams;
  const session = await auth();

  const membership = await requireCapabilityOrNotFound(session!.user.id, projectId, "plans.view");
  const canEdit = await can(membership.role, "plans.manage");

  const plan = await getTestPlanById(planId);
  /* Not found rather than forbidden when the plan belongs to another
     project: a reader with no business here learns nothing either way, and
     the id in the URL is a guess they should not be able to confirm. */
  if (!plan || plan.projectId !== projectId) {
    notFound();
  }

  const [project, summary, cases, runs, modules] = await Promise.all([
    getProjectById(projectId),
    summariseTestPlan(plan.id),
    listPlanCasesWithResults(plan.id),
    listRunsForPlan(plan.id),
    listModulesForProject(projectId),
  ]);

  const planPath = `/projects/${projectId}/plans/${plan.id}`;
  const hasFilters = Boolean(moduleId || search);
  const candidates = canEdit
    ? await listCandidateCasesForPlan(plan.id, { moduleId, search })
    : [];

  async function addCases(formData: FormData) {
    "use server";
    invalidateRouteCache();
    const session = await auth();
    await requireCapabilityOrNotFound(session!.user.id, projectId, "plans.manage");
    /* `testCaseId`, singular: that is the name `CasePicker` gives each
       hidden field it submits, one per ticked row. */
    const ids = formData.getAll("testCaseId").map(String);
    const { added } = await addCasesToPlan(planId, ids, session!.user.id);
    redirect(
      withToast(planPath, added === 1 ? "1 case added to the scope" : `${added} cases added to the scope`),
    );
  }

  /* Archive only, no restore: this page loads live plans alone, so an
     archived one never renders here. Bringing one back is on the list, which
     is the only place an archived plan can be seen. */
  async function archive() {
    "use server";
    invalidateRouteCache();
    const session = await auth();
    await requireCapabilityOrNotFound(session!.user.id, projectId, "plans.manage");
    await archiveTestPlan(planId, session!.user.id);
    redirect(withToast(`/projects/${projectId}/plans`, "Plan archived"));
  }

  function removeCase(testCaseId: string) {
    return async function remove() {
      "use server";
      invalidateRouteCache();
      const session = await auth();
      await requireCapabilityOrNotFound(session!.user.id, projectId, "plans.manage");
      await removeCasesFromPlan(planId, [testCaseId], session!.user.id);
      /* Out of the scope and out of nothing else: the case and every result
         a round recorded against it are untouched. */
      redirect(withToast(planPath, "Case taken out of the scope"));
    };
  }

  const facts: Array<{ label: string; value: string }> = [
    { label: "Owner", value: plan.owner.name ?? plan.owner.email },
    { label: "Environment", value: plan.environment ?? "—" },
    { label: "Build", value: plan.build ?? "—" },
    { label: "Start", value: plan.startsOn ? formatDate(plan.startsOn) : "—" },
    { label: "End", value: plan.endsOn ? formatDate(plan.endsOn) : "—" },
    { label: "Created", value: formatDate(plan.createdAt) },
  ];

  return (
    <main className={pageClass}>
      <Breadcrumb
        segments={testPlanBreadcrumb(
          { id: projectId, name: nameOr(project, projectId) },
          { id: plan.id, name: plan.name },
        )}
      />

      <PageHeader
        title={plan.name}
        subtitle={plan.objective}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={planStatusTone(plan.status)}>{planStatusLabel(plan.status)}</Badge>
            <Badge tone="gray" variant="outline">
              {plan.phase}
            </Badge>
            {canEdit && (
              <ConfirmForm
                action={archive}
                confirmMessage="Archive this plan? Its rounds and their results are untouched."
              >
                <SubmitButton variant="secondary" pendingLabel="Archiving…">
                  Archive plan
                </SubmitButton>
              </ConfirmForm>
            )}
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <Card aria-label="Plan information">
          <h2 className="text-sm font-semibold text-foreground">Plan information</h2>
          {plan.description && <p className="mt-3 text-sm text-foreground">{plan.description}</p>}
          <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {facts.map((fact) => (
              <div key={fact.label}>
                <dt className="text-xs text-muted">{fact.label}</dt>
                <dd className="truncate text-sm text-foreground">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card aria-label="Plan summary">
          <h2 className="text-sm font-semibold text-foreground">Plan summary</h2>
          <div className="mt-3 grid grid-cols-2 gap-4">
            <Figure label="Test cases" value={summary.cases} />
            <Figure label="Test runs" value={summary.runs} />
            <Figure label="Passed" value={summary.passed} tone="text-emerald-600 dark:text-emerald-400" />
            <Figure
              label="Failed / not run"
              value={`${summary.failed} / ${summary.notRun}`}
              tone="text-red-600 dark:text-red-400"
            />
          </div>
          <div className="mt-4 border-t border-border pt-4">
            <div className="flex items-baseline justify-between gap-2">
              <span className={mutedTextClass}>Plan progress</span>
              <span className="text-sm font-semibold tabular-nums text-foreground">
                {Math.round(summary.progress)}%
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/[.06] dark:bg-white/[.08]">
              <div
                className="h-1.5 rounded-full bg-brand"
                style={{ width: `${summary.progress}%` }}
              />
            </div>
            {/* The rule, written where the figure is, because it is the one
                thing about this number anybody asks. */}
            <p className="mt-2 text-xs text-muted">
              {summary.cases - summary.notRun} of {summary.cases} cases have a result. Each case
              counts once, from the newest round that reported it. A result recorded on a case
              outside any round is not one of them: a plan measures the rounds under it.
            </p>
          </div>
        </Card>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold text-foreground">Included test cases</h2>
          <span className={mutedTextClass}>{summary.cases} in scope</span>
          {canEdit && (
            <div className="ml-auto">
              <Modal triggerLabel="Add cases" title="Add cases to this plan" width="lg">
                <FilterForm showClear={hasFilters} className="mb-4">
                  <input
                    type="text"
                    name="search"
                    placeholder="Search case name"
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
                        ...modules.map((row) => ({ value: row.id, label: row.name })),
                      ]}
                      ariaLabel="Module"
                      autoWidth
                      className="max-w-52"
                    />
                  </label>
                </FilterForm>
                {candidates.length === 0 ? (
                  <p className={mutedTextClass}>
                    {hasFilters
                      ? "No cases match these filters."
                      : "Every live case in this project is already in the scope."}
                  </p>
                ) : (
                  <CasePicker
                    candidates={candidates}
                    action={addCases}
                    hasFilters={hasFilters}
                    target="plan"
                  />
                )}
              </Modal>
            </div>
          )}
        </div>

        {cases.length === 0 ? (
          <p className={mutedTextClass}>
            Nothing in the scope yet. Add the cases this phase is meant to cover — they stay where
            they are; a plan names them, it does not own them.
          </p>
        ) : (
          <div className={tableWrapClass}>
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={thClass}>Test case</th>
                  <th className={thClass}>Module › Requirement</th>
                  <th className={thCenterClass}>Latest result</th>
                  {canEdit && <th className={thCenterClass}>Scope</th>}
                </tr>
              </thead>
              <tbody>
                {cases.map((row) => (
                  <tr key={row.id}>
                    <td className={tdClass}>
                      <Link
                        href={testCaseHref({
                          projectId,
                          moduleId: row.moduleId,
                          requirementId: row.requirementId,
                          scenarioId: row.scenarioId,
                          testGroupId: row.testGroupId,
                          testCaseId: row.id,
                        })}
                        className="font-medium text-foreground hover:text-brand hover:underline"
                      >
                        {row.name}
                      </Link>
                    </td>
                    <td className={`${tdClass} text-muted`}>
                      {row.moduleName} › {row.requirementCode ?? row.requirementName}
                    </td>
                    <td className={tdCenterClass}>
                      <Badge tone={testResultTone(row.result)}>
                        {row.result.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    {canEdit && (
                      <td className={tdCenterClass}>
                        <ConfirmForm
                          action={removeCase(row.id)}
                          confirmMessage="Take this case out of the plan's scope? The case and its results are untouched."
                        >
                          <SubmitButton variant="secondary" pendingLabel="Removing…">
                            Remove
                          </SubmitButton>
                        </ConfirmForm>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold text-foreground">Linked test runs</h2>
          <span className={mutedTextClass}>
            {runs.length === 1 ? "1 round" : `${runs.length} rounds`}
          </span>
        </div>

        {runs.length === 0 ? (
          <p className={mutedTextClass}>
            No rounds under this plan yet, which is why the progress above is at zero rather than
            at nothing.
          </p>
        ) : (
          <div className={tableWrapClass}>
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={thClass}>Round</th>
                  <th className={thCenterClass}>Status</th>
                  <th className={thCenterClass}>Cases</th>
                  <th className={thCenterClass}>Recorded</th>
                  <th className={thCenterClass}>Passed</th>
                  <th className={thCenterClass}>Failed</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td className={tdClass}>
                      <Link
                        href={`/projects/${projectId}/runs/${run.id}`}
                        className="font-medium text-foreground hover:text-brand hover:underline"
                      >
                        {run.name}
                      </Link>
                    </td>
                    <td className={tdCenterClass}>
                      <Badge tone={run.status === "OPEN" ? "blue" : "gray"}>
                        {run.status === "OPEN" ? "Open" : "Closed"}
                      </Badge>
                    </td>
                    <td className={tdCenterClass}>{run.total}</td>
                    <td className={tdCenterClass}>{run.recorded}</td>
                    <td className={`${tdCenterClass} text-emerald-600 dark:text-emerald-400`}>
                      {run.passed}
                    </td>
                    <td className={`${tdCenterClass} text-red-600 dark:text-red-400`}>
                      {run.failed}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function Figure({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div>
      <div className={`text-xl font-semibold tabular-nums ${tone ?? "text-foreground"}`}>
        {value}
      </div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}
