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
  listCasesInRun,
  removeCaseFromRun,
  setRunCaseResult,
  setRunStatus,
} from "@/lib/test-runs";
import { withToast } from "@/lib/toast";
import { Breadcrumb } from "@/components/Breadcrumb";
import { CasePicker } from "@/components/CasePicker";
import { ConfirmForm } from "@/components/ConfirmForm";
import { FilterForm } from "@/components/FilterForm";
import { nameOr, testRunBreadcrumb } from "@/lib/breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { Badge, priorityTone, testResultTone } from "@/components/ui/Badge";

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
  trHoverClass,
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
  }>;
}) {
  const { id: projectId, runId } = await params;
  const { moduleId, requirementId, priority, lastResult, search, error, picking } =
    await searchParams;
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

  const [cases, modules, requirements, candidates] = await Promise.all([
    listCasesInRun(runId),
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

  const isOpen = run.status === "OPEN";
  const ran = cases.filter((row) => row.testResult !== "NOT_RUN").length;

  const basePath = `/projects/${projectId}/runs/${runId}`;
  /* Grouped by Scenario then Test Group: the chain above a case is what tells
   * two cases of the same name apart, and repeating four levels on every row
   * would bury the case itself. */
  const groups = new Map<
    string,
    { scenario: string; testGroup: string; rows: typeof cases }
  >();
  for (const row of cases) {
    const key = row.testCase.testGroup.id;
    const bucket = groups.get(key);
    if (bucket) {
      bucket.rows.push(row);
    } else {
      groups.set(key, {
        scenario: row.testCase.testGroup.scenario.name,
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
            <span>
              {ran} of {cases.length} run
            </span>
            {(run.startsOn || run.endsOn) && (
              <span className="text-muted">
                {run.startsOn?.toISOString().slice(0, 10) ?? "—"} →{" "}
                {run.endsOn?.toISOString().slice(0, 10) ?? "—"}
              </span>
            )}
          </span>
        }
        actions={
          <>
            {isOpen && (
              <Modal
                triggerLabel="+ Add test cases"
                triggerVariant="secondary"
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

      {!isOpen && (
        <p className={mutedTextClass}>
          This run is closed, so its results are read-only. Reopen it to make changes.
        </p>
      )}

      {cases.length === 0 ? (
        <p className={mutedTextClass}>
          No cases in this run yet. Use “Add test cases” to pick the ones to re-test.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {Array.from(groups.entries()).map(([groupId, group]) => (
            <section key={groupId} className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-foreground">
                {group.scenario}
                <span className="text-muted"> › {group.testGroup}</span>
              </h2>
              <div className={tableWrapClass}>
                <table className={tableClass}>
                  <colgroup>
                    <col className="w-[44%]" />
                    <col className="w-[12%]" />
                    <col className="w-[18%]" />
                    <col className="w-[16%]" />
                    <col className="w-[10%]" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th className={thClass}>Test Case</th>
                      <th className={thCenterClass}>Priority</th>
                      <th className={thCenterClass}>Result in this run</th>
                      <th className={thClass}>Notes</th>
                      <th className={thCenterClass}>Ran</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((row) => {
                      const actions = caseActions(row.testCase.id);
                      return (
                        <tr key={row.id} className={trHoverClass}>
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
                                <SubmitButton variant="secondary">
                                  Save
                                </SubmitButton>
                              </form>
                            ) : (
                              <Badge tone={testResultTone(row.testResult)}>
                                {row.testResult.replace(/_/g, " ")}
                              </Badge>
                            )}
                          </td>
                          <td className={`${tdClass} text-muted`}>{row.notes ?? "—"}</td>
                          <td className={`${tdCenterClass} text-xs text-muted`}>
                            {row.ranAt ? (
                              <>
                                {row.ranAt.toISOString().slice(0, 10)}
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
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
