import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { ALL_MEMBER_ROLES, EDITOR_ROLES, requireProjectRoleOrNotFound } from "@/lib/rbac";
import { getProjectById } from "@/lib/projects";
import { listModulesForProject } from "@/lib/modules";
import { listRequirementsForProject } from "@/lib/requirements";
import {
  TestRunValidationError,
  addCasesToRun,
  getRunById,
  listCandidateCases,
  listCasesInRunPage,
  removeCaseFromRun,
  setRunCaseResult,
  setRunStatus,
  summariseRunResults,
  summariseRunScope,
} from "@/lib/test-runs";
import { Pagination } from "@/components/ui/Pagination";
import { withToast } from "@/lib/toast";
import {
  AttachmentValidationError,
  deleteAttachment,
  getRunCaseAttachmentWithProjectId,
  saveRunCaseAttachment,
} from "@/lib/attachments";
import { canPreview, getFileKind } from "@/lib/project-files";
import { Breadcrumb } from "@/components/Breadcrumb";
import { formatDate } from "@/lib/dates";
import { CasePicker } from "@/components/CasePicker";
import { ConfirmForm } from "@/components/ConfirmForm";
import { DismissibleAlert } from "@/components/DismissibleAlert";
import { FilePreview } from "@/components/FilePreview";
import { FilterForm } from "@/components/FilterForm";
import { nameOr, testRunBreadcrumb } from "@/lib/breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { ExpandableRow } from "@/components/ui/ExpandableRow";
import { DetailField, DetailFields } from "@/components/ui/DetailFields";
import { Badge, priorityTone, testResultTone } from "@/components/ui/Badge";
import { IconButton } from "@/components/ui/Button";
import { TrashIcon } from "@/components/icons";
import { isTestRunOverdue } from "@/lib/deadlines";

import { SubmitButton } from "@/components/SubmitButton";
import { Select } from "@/components/ui/Select";
import { TEST_RESULT_OPTIONS, PRIORITY_OPTIONS } from "@/lib/enums";
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
import type { TestResult } from "@/generated/prisma/client";
import { invalidateRouteCache } from "@/lib/revalidate";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; runId: string }>;
}) {
  const { id, runId } = await params;
  const [project, run] = await Promise.all([getProjectById(id), getRunById(runId)]);
  return { title: run ? `${run.name} · ${project?.name ?? "Test Run"}` : "Test Run" };
}

export default async function TestRunPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; runId: string }>;
  searchParams: Promise<{
    moduleId?: string;
    requirementId?: string;
    priority?: string;
    lastResult?: string;
    search?: string;
    error?: string;
    picking?: string;
    attachmentError?: string;
    /* The run list's own two, deliberately not sharing names with the picker's
       `search`/`lastResult` above — both sets live in the same query string,
       and one form clearing the other's field is the bug that shape invites. */
    result?: string;
    caseSearch?: string;
    page?: string;
    pageSize?: string;
  }>;
}) {
  const { id: projectId, runId } = await params;
  const {
    moduleId,
    requirementId,
    priority,
    lastResult,
    search,
    error,
    picking,
    attachmentError,
    result,
    caseSearch,
    page,
    pageSize,
  } = await searchParams;
  const session = await auth();

  await requireProjectRoleOrNotFound(session!.user.id, projectId, ALL_MEMBER_ROLES);

  const [project, run] = await Promise.all([getProjectById(projectId), getRunById(runId)]);
  if (!run || run.projectId !== projectId) {
    notFound();
  }

  // `picking` only survives a filter change so the dialog reopens after the
  // navigation it causes; it no longer decides whether the list is loaded.
  const isPicking = picking === "1";
  const hasFilters = Boolean(moduleId || requirementId || priority || lastResult || search);

  const [casePage, resultTotals, scope, modules, requirements, candidates] = await Promise.all([
    listCasesInRunPage(runId, {
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      result: result as TestResult | undefined,
      search: caseSearch,
    }),
    summariseRunResults(runId),
    summariseRunScope(runId),
    listModulesForProject(projectId),
    listRequirementsForProject(projectId),
    listCandidateCases(projectId, runId, {
      moduleId,
      requirementId,
      priority,
      lastResult: lastResult as TestResult | undefined,
      search,
    }),
  ]);
  const cases = casePage.items;

  const isOpen = run.status === "OPEN";
  const ran = casePage.ranCount;

  const basePath = `/projects/${projectId}/runs/${runId}`;
  /* Grouped by Scenario then Test Group: the chain above a case is what tells
   * two cases of the same name apart, and repeating four levels on every row
   * would bury the case itself.
   *
   * Above that heading goes where the group came from — Module, Requirement
   * and its Feature — because a round draws on several Requirements and
   * nothing stops it drawing on several Modules, and two groups can carry the
   * same Scenario name under different ones. It prints only where it differs
   * from the group before: a round confined to one Requirement would
   * otherwise repeat the same line down the whole page. That collapsing is
   * only honest because the query now returns cases in hierarchy order
   * (`RUN_CASE_ORDER`), so everything sharing a Requirement is contiguous. */
  const groups = new Map<
    string,
    {
      moduleId: string;
      module: string;
      requirement: string;
      feature: string | null;
      scenario: string;
      testGroup: string;
      rows: typeof cases;
    }
  >();
  for (const row of cases) {
    const key = row.testCase.testGroup.id;
    const bucket = groups.get(key);
    if (bucket) {
      bucket.rows.push(row);
    } else {
      const { scenario } = row.testCase.testGroup;
      groups.set(key, {
        moduleId: scenario.requirement.module.id,
        module: scenario.requirement.module.name,
        requirement: scenario.requirement.name,
        feature: scenario.requirement.feature,
        scenario: scenario.name,
        testGroup: row.testCase.testGroup.name,
        rows: [row],
      });
    }
  }

  async function addCases(formData: FormData) {
    "use server";
    invalidateRouteCache();
    const session = await auth();
    await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
    const ids = formData.getAll("testCaseId").map(String).filter(Boolean);
    let added = 0;
    try {
      ({ added } = await addCasesToRun(runId, ids, session!.user.id));
    } catch (err) {
      if (err instanceof TestRunValidationError) {
        redirect(`${basePath}?error=${encodeURIComponent(err.message)}`);
      }
      throw err;
    }
    // The service's own count, not `ids.length`: a case already in the round,
    // or one since archived, is skipped. And the count is the point — added to
    // a long grouped list, a dozen new rows are not something anyone can spot.
    redirect(
      withToast(
        basePath,
        added === 0
          ? "Nothing added — those Test Cases are already in this run"
          : `Added ${added} Test Case${added === 1 ? "" : "s"}`,
      ),
    );
  }

  async function closeRun() {
    "use server";
    invalidateRouteCache();
    const session = await auth();
    await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
    await setRunStatus(runId, "CLOSED", session!.user.id);
    redirect(basePath);
  }

  async function reopenRun() {
    "use server";
    invalidateRouteCache();
    const session = await auth();
    await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
    await setRunStatus(runId, "OPEN", session!.user.id);
    redirect(basePath);
  }

  /** Bound per row: one action per case in the run. */
  function caseActions(testCaseId: string) {
    return {
      async record(formData: FormData) {
        "use server";
        invalidateRouteCache();
        const session = await auth();
        await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
        let mirrorHeldBy: string | null = null;
        try {
          ({ mirrorHeldBy } = await setRunCaseResult(
            runId,
            testCaseId,
            {
              testResult: formData.get("testResult") as TestResult,
              notes: (formData.get("notes") as string) || null,
            },
            session!.user.id,
          ));
        } catch (err) {
          if (err instanceof TestRunValidationError) {
            redirect(`${basePath}?error=${encodeURIComponent(err.message)}`);
          }
          throw err;
        }
        // Normally the result speaks for itself in the row that just changed.
        // It needs saying only when the Test Case elsewhere will not move,
        // which otherwise reads as a save that didn't take.
        redirect(
          mirrorHeldBy
            ? withToast(
                basePath,
                `Recorded in this run — the Test Case still shows ${mirrorHeldBy}, which is newer`,
              )
            : basePath,
        );
      },
      async remove() {
        "use server";
        invalidateRouteCache();
        const session = await auth();
        await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
        try {
          await removeCaseFromRun(runId, testCaseId, session!.user.id);
        } catch (err) {
          if (err instanceof TestRunValidationError) {
            redirect(`${basePath}?error=${encodeURIComponent(err.message)}`);
          }
          throw err;
        }
        // Dropping the round's record of a case is not reversible by putting
        // it back — a re-added case starts with no result.
        redirect(withToast(basePath, "Test Case removed from this run"));
      },
    };
  }

  /** Bound per row: evidence (a screenshot, a log) attached to one round's
   *  result, not to the Test Case itself — the same Test Case run again next
   *  round gets its own, separate set. */
  function attachmentActions(runCaseId: string) {
    return {
      async upload(formData: FormData) {
        "use server";
        invalidateRouteCache();
        const session = await auth();
        await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
        const file = formData.get("file");
        if (!(file instanceof File)) {
          redirect(`${basePath}?attachmentError=${encodeURIComponent("Choose a file first")}`);
        }
        try {
          await saveRunCaseAttachment(runCaseId, file, session!.user.id);
        } catch (err) {
          if (err instanceof AttachmentValidationError || err instanceof TestRunValidationError) {
            redirect(`${basePath}?attachmentError=${encodeURIComponent(err.message)}`);
          }
          throw err;
        }
        redirect(withToast(basePath, "Attachment uploaded"));
      },
      remove(attachmentId: string) {
        return async function removeAttachment() {
          "use server";
          invalidateRouteCache();
          const session = await auth();
          await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
          const attachment = await getRunCaseAttachmentWithProjectId(attachmentId);
          if (attachment && attachment.runCaseId === runCaseId) {
            try {
              await deleteAttachment(attachmentId);
            } catch (err) {
              if (err instanceof TestRunValidationError) {
                redirect(`${basePath}?attachmentError=${encodeURIComponent(err.message)}`);
              }
              throw err;
            }
          }
          redirect(withToast(basePath, "Attachment deleted"));
        };
      },
    };
  }

  return (
    <main className={pageClass}>
      <Breadcrumb
        segments={testRunBreadcrumb({ id: projectId, name: nameOr(project, projectId) }, run)}
      />
      <PageHeader
        title={run.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={isOpen ? "blue" : "gray"}>{isOpen ? "Open" : "Closed"}</Badge>
            {isTestRunOverdue(run) && <Badge tone="red">Overdue</Badge>}
            {/* Which phase this round belongs to — the list says it too. */}
            {run.phase && (
              <Badge tone="gray" variant="outline">
                {run.phase}
              </Badge>
            )}
            <span>
              {ran} of {casePage.totalInRun} run
            </span>
            {(run.startsOn || run.endsOn) && (
              <span className="text-muted">
                {run.startsOn ? formatDate(run.startsOn) : "—"} →{" "}
                {run.endsOn ? formatDate(run.endsOn) : "—"}
              </span>
            )}
            {/* What this round reaches across. It is a fact about the whole
                round, but the list below it is paginated and grouped, so it
                could previously only be worked out by scrolling to the end
                and remembering. Naming the Modules matters more than counting
                them — "3 Modules" still leaves you to go and find which. */}
            {/* How the round is going, not just how far along. "30 of 59 run"
                can describe a round that is nearly done and nearly all red.
                Each count links to the filter for exactly those rows, which is
                the question anyone reading the number asks next. Whole-round
                figures, never the filtered view. */}
            {resultTotals.map((entry) => (
              <a
                key={entry.result}
                href={`${basePath}?result=${entry.result}`}
                className="rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                <Badge tone={testResultTone(entry.result)}>
                  {entry.result.replace(/_/g, " ")} {entry.count}
                </Badge>
              </a>
            ))}
            {scope.modules.length > 0 && (
              <span className="text-muted">
                {scope.modules.length === 1
                  ? scope.modules[0].name
                  : `${scope.modules.length} Modules: ${scope.modules
                      .map((m) => m.name)
                      .join(", ")}`}
                <span className="px-1">·</span>
                {scope.requirementCount} Requirement
                {scope.requirementCount === 1 ? "" : "s"}
              </span>
            )}
          </span>
        }
        actions={
          <>
            {/* Three actions that all looked the same, now weighted by what
                they do. Quietest first: taking a copy away changes nothing
                here, so it wears no border at all. A plain <a> rather than
                LinkButton because this is a file download from an API route,
                not a navigation for the router to intercept. */}
            <a
              href={`/api/projects/${projectId}/runs/${runId}/export`}
              className="inline-flex h-9 items-center gap-1.5 rounded-md px-3.5 text-sm font-medium text-muted transition-colors hover:bg-black/[.05] hover:text-foreground dark:hover:bg-white/[.08]"
            >
              Export results
            </a>
            {isOpen && (
              // The one action that builds the round up - solid, the way
              // "+ New Run" is on the list this page came from.
              <Modal
                triggerLabel="+ Add test cases"
                triggerVariant="primary"
                title="Add test cases to this run"
                width="lg"
                openOnMount={isPicking}
              >
                {/* A fixed grid rather than flex-wrap: the fields have
                    different natural widths, so wrapping left one stranded on
                    a row of its own. The trailing auto column is for the clear
                    button, which would otherwise be that stranded field. */}
                <FilterForm
                  showClear={hasFilters}
                  action={basePath}
                  ownLayout
                  className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(4,minmax(0,1fr))_auto]"
                >
                  <input type="hidden" name="picking" value="1" />
                  <label className={`${labelClass} col-span-2 sm:col-span-5`}>
                    Search
                    <input
                      type="text"
                      name="search"
                      placeholder="Search case name"
                      defaultValue={search}
                      className={inputClass}
                    />
                  </label>
                  <label className={labelClass}>
                    Module
                    <Select
                      name="moduleId"
                      defaultValue={moduleId ?? ""}
                      options={[
                        { value: "", label: "All" },
                        ...modules.map((row) => ({ value: row.id, label: row.name })),
                      ]}
                      ariaLabel="Module"
                    />
                  </label>
                  <label className={labelClass}>
                    Requirement
                    <Select
                      name="requirementId"
                      defaultValue={requirementId ?? ""}
                      options={[
                        { value: "", label: "All" },
                        ...requirements
                          .filter((row) => !moduleId || row.moduleId === moduleId)
                          .map((row) => ({
                            value: row.id,
                            label: row.code ? `${row.code} — ${row.name}` : row.name,
                          })),
                      ]}
                      ariaLabel="Requirement"
                    />
                  </label>
                  <label className={labelClass}>
                    Priority
                    <Select
                      name="priority"
                      defaultValue={priority ?? ""}
                      options={[{ value: "", label: "All" }, ...PRIORITY_OPTIONS]}
                      ariaLabel="Priority"
                    />
                  </label>
                  <label className={labelClass}>
                    Last result
                    <Select
                      name="lastResult"
                      defaultValue={lastResult ?? ""}
                      options={[{ value: "", label: "All" }, ...TEST_RESULT_OPTIONS]}
                      ariaLabel="Last result"
                    />
                  </label>
                </FilterForm>

                {candidates.length === 0 ? (
                  <p className={`${mutedTextClass} mt-5 border-t border-border pt-5`}>
                    {hasFilters
                      ? "No case matches those filters, or every one that does is already in this run."
                      : "Every test case in this project is already in this run."}
                  </p>
                ) : (
                  <CasePicker
                    candidates={candidates}
                    action={addCases}
                    hasFilters={hasFilters}
                  />
                )}
              </Modal>
            )}
            {isOpen ? (
              <ConfirmForm
                action={closeRun}
                confirmMessage="Close this run? Its results can't be changed until it is reopened."
              >
                {/* Bordered, between the other two: it stops everyone
                    recording results, which is worth a pause — but Reopen is
                    right there, so it is not the red that means "gone". */}
                <SubmitButton variant="secondary" pendingLabel="Closing…">
                  Close run
                </SubmitButton>
              </ConfirmForm>
            ) : (
              <ConfirmForm action={reopenRun} confirmMessage="Reopen this run?">
                <SubmitButton variant="secondary" pendingLabel="Reopening…">
                  Reopen run
                </SubmitButton>
              </ConfirmForm>
            )}
          </>
        }
      />

      {error && (
        <p
          role="alert"
          className="rounded-md bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-900/40 dark:text-red-300"
        >
          {error}
        </p>
      )}

      {attachmentError && (
        <DismissibleAlert clearParams={["attachmentError"]}>{attachmentError}</DismissibleAlert>
      )}

      {!isOpen && (
        <p className={mutedTextClass}>
          This run is closed, so its results are read-only. Reopen it to make changes.
        </p>
      )}

      {/* The round's own filters, separate from the ones inside "Add test
          cases" — those pick from what is not in the round yet, these narrow
          what is. Only shown once there is a round to narrow. */}
      {casePage.totalInRun > 0 && (
        <FilterForm
          action={basePath}
          showClear={Boolean(result || caseSearch)}
          className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)_auto]"
          ownLayout
        >
          {/* No visible label: the placeholder already says what it searches,
              the way the run list's own search box does, and a label above a
              single wide field only costs a row. `aria-label` keeps the name
              for anyone not reading the placeholder. */}
          <input
            type="text"
            name="caseSearch"
            defaultValue={caseSearch ?? ""}
            placeholder="Search name or code, e.g. TC-PM-044"
            aria-label="Search cases in this run"
            className={`${inputClass} self-end`}
          />
          <label className={labelClass}>
            Result
            <Select
              name="result"
              defaultValue={result ?? ""}
              options={[{ value: "", label: "Any result" }, ...TEST_RESULT_OPTIONS]}
            />
          </label>
        </FilterForm>
      )}

      {casePage.totalInRun === 0 ? (
        <p className={mutedTextClass}>
          No cases in this run yet. Use “Add test cases” to pick the ones to re-test.
        </p>
      ) : casePage.total === 0 ? (
        <p className={mutedTextClass}>
          No case in this run matches those filters.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {Array.from(groups.entries()).map(([groupId, group], index, all) => {
            const previous = index > 0 ? all[index - 1][1] : undefined;
            /* Two boundaries, drawn with different weight because they carry
               different amounts of news. Crossing into another Module is the
               coarse one and happens two or three times in a round; changing
               Requirement happens constantly. Ruling every Requirement would
               put a line between nearly every table and stop reading as
               structure at all. */
            const newModule = previous?.module !== group.module;
            const newRequirement = newModule || previous?.requirement !== group.requirement;
            return (
            <section key={groupId} className={`flex flex-col gap-2 ${newModule && index > 0 ? "mt-4" : ""}`}>
              {newModule && (
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-sm font-semibold tracking-wide text-foreground uppercase">
                    {group.module}
                  </h2>
                  {/* Takes the rest of the row, so the band reads as a divider
                      across the page rather than a label sitting on its own. */}
                  <span aria-hidden className="h-px min-w-8 flex-1 bg-border" />
                  {/* How this Module is going. The round's own total is in the
                      header, but "40% done" says nothing about which Module is
                      the part that is failing — and these bands are where
                      someone scanning the page already is. Counted over the
                      whole round, so a filtered view does not quietly restate
                      them as something smaller. */}
                  {scope.modules
                    .find((mod) => mod.id === group.moduleId)
                    ?.results.map((entry) => (
                      <Badge key={entry.result} tone={testResultTone(entry.result)}>
                        {entry.result.replace(/_/g, " ")} {entry.count}
                      </Badge>
                    ))}
                </div>
              )}
              {newRequirement && (
                <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  {/* No Module here: the band above already said it, and
                      repeating it pushed the Requirement — the part that
                      actually changed — off to the right. */}
                  <span>{group.requirement}</span>
                  {group.feature && (
                    <Badge tone="gray" variant="outline">
                      {group.feature}
                    </Badge>
                  )}
                </p>
              )}
              <h2 className="text-sm font-semibold text-foreground">
                {group.scenario}
                <span className="text-muted"> › {group.testGroup}</span>
              </h2>
              <div className={tableWrapClass}>
                <table className={tableClass}>
                  <colgroup>
                    <col className="w-[36%]" />
                    <col className="w-[10%]" />
                    <col className="w-[16%]" />
                    <col className="w-[14%]" />
                    <col className="w-[8%]" />
                    <col className="w-[8%]" />
                    <col className="w-[8%]" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th className={thClass}>Test Case</th>
                      <th className={thCenterClass}>Priority</th>
                      <th className={thCenterClass}>Result in this run</th>
                      <th className={thClass}>Notes</th>
                      <th className={thCenterClass}>Attachments</th>
                      {/* Last of the data columns because it doubles as the
                          row's action: a case that has not run yet shows
                          Remove here instead of a date, and an action belongs
                          at the end of the row, not in the middle of it. */}
                      <th className={thCenterClass}>Ran</th>
                      <th className={thCenterClass} />
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((row) => {
                      const actions = caseActions(row.testCase.id);
                      const attachmentActionsForRow = attachmentActions(row.id);
                      return (
                        <ExpandableRow
                          key={row.id}
                          colSpan={7}
                          detailLabel={row.testCase.name}
                          cells={
                            <>
                              <td className={tdClass}>
                                <span className="text-foreground">{row.testCase.name}</span>
                                {row.testCase.deletedAt && (
                                  <span className="ml-2 text-xs text-muted">(case archived)</span>
                                )}
                              </td>
                              <td className={tdCenterClass}>
                                <Badge tone={priorityTone(row.testCase.priority)}>
                                  {row.testCase.priority}
                                </Badge>
                              </td>
                              <td className={tdCenterClass}>
                                {isOpen ? (
                                  <form action={actions.record} className="flex items-center gap-2">
                                    <Select
                                      name="testResult"
                                      defaultValue={row.testResult}
                                      options={TEST_RESULT_OPTIONS}
                                      ariaLabel={`Result for ${row.testCase.name}`}
                                      className="max-w-36"
                                    />
                                    <input
                                      type="hidden"
                                      name="notes"
                                      value={row.notes ?? ""}
                                      readOnly
                                    />
                                    <SubmitButton variant="secondary">Save</SubmitButton>
                                  </form>
                                ) : (
                                  <Badge tone={testResultTone(row.testResult)}>
                                    {row.testResult.replace(/_/g, " ")}
                                  </Badge>
                                )}
                              </td>
                              <td className={`${tdClass} text-muted`}>{row.notes ?? "—"}</td>
                              <td className={`${tdCenterClass} text-xs text-muted`}>
                                {row.attachments.length > 0 ? row.attachments.length : "—"}
                              </td>
                              <td className={`${tdCenterClass} text-xs text-muted`}>
                                {row.ranAt ? (
                                  <>
                                    {formatDate(row.ranAt)}
                                    {row.ranBy && <div>{row.ranBy.name}</div>}
                                  </>
                                ) : isOpen ? (
                                  <ConfirmForm
                                    action={actions.remove}
                                    confirmMessage="Take this case out of the run?"
                                  >
                                    <SubmitButton variant="secondary" pendingLabel="Removing…">
                                      Remove
                                    </SubmitButton>
                                  </ConfirmForm>
                                ) : (
                                  "—"
                                )}
                              </td>
                            </>
                          }
                          detail={
                            <div className="grid gap-6 px-1 lg:grid-cols-2 lg:gap-8">
                              <section className="flex flex-col gap-3">
                                <h3 className="text-sm font-semibold tracking-wide text-foreground uppercase">
                                  Test Case Details
                                </h3>
                                <DetailFields columns={1}>
                                  <DetailField label="Expected Result">
                                    {row.testCase.expectedResult}
                                  </DetailField>
                                  {row.testCase.condition && (
                                    <DetailField label="Condition">
                                      {row.testCase.condition}
                                    </DetailField>
                                  )}
                                  <DetailField label="Preconditions">
                                    {row.testCase.preconditions}
                                  </DetailField>
                                  {row.testCase.testData && (
                                    <DetailField label="Test Data">
                                      {row.testCase.testData}
                                    </DetailField>
                                  )}
                                  <DetailField label="Test Steps">
                                    {row.testCase.steps.length === 0 ? null : (
                                      <ol className="flex flex-col gap-1">
                                        {row.testCase.steps.map((step, index) => (
                                          <li key={step.id} className="flex gap-2">
                                            <span className="w-5 shrink-0 text-muted">
                                              {index + 1}.
                                            </span>
                                            <span>
                                              <span className="whitespace-pre-wrap">
                                                {step.step}
                                              </span>
                                              {step.expectedResult && (
                                                <>
                                                  {" "}
                                                  <span className="text-muted">→</span>{" "}
                                                  <span className="whitespace-pre-wrap italic">
                                                    {step.expectedResult}
                                                  </span>
                                                </>
                                              )}
                                            </span>
                                          </li>
                                        ))}
                                      </ol>
                                    )}
                                  </DetailField>
                                </DetailFields>
                              </section>

                              <section className="flex flex-col gap-3 border-t border-border pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
                                <h3 className="text-sm font-semibold tracking-wide text-foreground uppercase">
                                  Attachments
                                </h3>
                                {row.attachments.length > 0 && (
                                <ul className="grid gap-4 sm:grid-cols-2">
                                  {row.attachments.map((attachment) => (
                                    <li key={attachment.id} className="min-w-0">
                                      <FilePreview
                                        file={{
                                          id: attachment.id,
                                          fileName: attachment.fileName,
                                          uploadedAt: attachment.uploadedAt
                                            .toISOString()
                                            .slice(0, 10),
                                          size: attachment.size,
                                          href: `/api/run-cases/${row.id}/attachments/${attachment.id}`,
                                          previewable: canPreview(attachment.contentType),
                                          isImage: attachment.contentType.startsWith("image/"),
                                          kind: getFileKind(
                                            attachment.contentType,
                                            attachment.fileName,
                                          ),
                                        }}
                                        deleteSlot={
                                          isOpen ? (
                                            <ConfirmForm
                                              action={attachmentActionsForRow.remove(
                                                attachment.id,
                                              )}
                                              confirmMessage={`Remove ${attachment.fileName} from this result?`}
                                              variant="danger"
                                            >
                                              <IconButton
                                                type="submit"
                                                variant="ghost"
                                                aria-label={`Remove ${attachment.fileName}`}
                                                title="Remove"
                                                className="text-muted hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
                                              >
                                                <TrashIcon />
                                              </IconButton>
                                            </ConfirmForm>
                                          ) : undefined
                                        }
                                      />
                                    </li>
                                  ))}
                                </ul>
                              )}
                              {isOpen && (
                                <form
                                  action={attachmentActionsForRow.upload}
                                  encType="multipart/form-data"
                                  className="flex items-center gap-3"
                                >
                                  <input
                                    type="file"
                                    name="file"
                                    required
                                    className="text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-brand file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-brand-hover"
                                  />
                                  <SubmitButton variant="secondary" pendingLabel="Uploading…">
                                    Upload Attachment
                                  </SubmitButton>
                                </form>
                              )}
                              </section>
                            </div>
                          }
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
            );
          })}
        </div>
      )}

      <Pagination
        page={casePage.page}
        totalPages={casePage.totalPages}
        total={casePage.total}
        pageSize={casePage.pageSize}
      />
    </main>
  );
}
