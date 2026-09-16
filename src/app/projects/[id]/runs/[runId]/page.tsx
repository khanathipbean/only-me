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
import { Breadcrumb } from "@/components/Breadcrumb";
import { ConfirmForm } from "@/components/ConfirmForm";
import { FilterForm } from "@/components/FilterForm";
import { nameOr, testRunBreadcrumb } from "@/lib/breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { Badge, priorityTone, testResultTone } from "@/components/ui/Badge";

import { SubmitButton } from "@/components/SubmitButton";
import { Select } from "@/components/ui/Select";
import { DialogCloseButton } from "@/components/ui/DialogCloseButton";
import { TEST_RESULT_OPTIONS, PRIORITY_OPTIONS } from "@/lib/enums";
import {
  checkboxClass,
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

  const isPicking = picking === "1";
  const hasFilters = Boolean(moduleId || requirementId || priority || lastResult || search);

  const [cases, modules, requirements, candidates] = await Promise.all([
    listCasesInRun(runId),
    listModulesForProject(projectId),
    listRequirementsForProject(projectId),
    isPicking
      ? listCandidateCases(projectId, runId, {
          moduleId,
          requirementId,
          priority,
          lastResult: lastResult as TestResult | undefined,
          search,
        })
      : Promise.resolve([]),
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
    const session = await auth();
    await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
    const ids = formData.getAll("testCaseId").map(String).filter(Boolean);
    try {
      await addCasesToRun(runId, ids, session!.user.id);
    } catch (err) {
      if (err instanceof TestRunValidationError) {
        redirect(`${basePath}?error=${encodeURIComponent(err.message)}`);
      }
      throw err;
    }
    redirect(basePath);
  }

  async function closeRun() {
    "use server";
    const session = await auth();
    await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
    await setRunStatus(runId, "CLOSED", session!.user.id);
    redirect(basePath);
  }

  async function reopenRun() {
    "use server";
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
        const session = await auth();
        await requireProjectRoleOrNotFound(session!.user.id, projectId, EDITOR_ROLES);
        try {
          await setRunCaseResult(
            runId,
            testCaseId,
            {
              testResult: formData.get("testResult") as TestResult,
              notes: (formData.get("notes") as string) || null,
            },
            session!.user.id,
          );
        } catch (err) {
          if (err instanceof TestRunValidationError) {
            redirect(`${basePath}?error=${encodeURIComponent(err.message)}`);
          }
          throw err;
        }
        redirect(basePath);
      },
      async remove() {
        "use server";
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
        redirect(basePath);
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
                openOnMount={isPicking}
              >
                <FilterForm showClear={hasFilters} action={basePath}>
                  <input type="hidden" name="picking" value="1" />
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
                        { value: "", label: "All" },
                        ...modules.map((row) => ({ value: row.id, label: row.name })),
                      ]}
                      ariaLabel="Module"
                      className="max-w-44"
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
                      className="max-w-56"
                    />
                  </label>
                  <label className={labelClass}>
                    Priority
                    <Select
                      name="priority"
                      defaultValue={priority ?? ""}
                      options={[{ value: "", label: "All" }, ...PRIORITY_OPTIONS]}
                      ariaLabel="Priority"
                      className="max-w-36"
                    />
                  </label>
                  <label className={labelClass}>
                    Last result
                    <Select
                      name="lastResult"
                      defaultValue={lastResult ?? ""}
                      options={[{ value: "", label: "All" }, ...TEST_RESULT_OPTIONS]}
                      ariaLabel="Last result"
                      className="max-w-40"
                    />
                  </label>
                </FilterForm>

                {!isPicking ? (
                  <p className={`${mutedTextClass} mt-4`}>
                    Choose filters above, then Apply to list the cases that match.
                  </p>
                ) : candidates.length === 0 ? (
                  <p className={`${mutedTextClass} mt-4`}>
                    Nothing left to add — every case matching those filters is already in this run.
                  </p>
                ) : (
                  <form action={addCases} className="mt-4 flex flex-col gap-3">
                    <p className={mutedTextClass}>
                      {candidates.length} case(s) match. Untick any you don&apos;t want.
                    </p>
                    <div className="max-h-80 overflow-y-auto rounded-md border border-border">
                      {candidates.map((candidate) => (
                        <label
                          key={candidate.id}
                          className="flex items-start gap-3 border-b border-border px-3 py-2 text-sm last:border-b-0"
                        >
                          <input
                            type="checkbox"
                            name="testCaseId"
                            value={candidate.id}
                            defaultChecked
                            className={`${checkboxClass} mt-0.5`}
                          />
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-foreground">{candidate.name}</span>
                            <span className="truncate text-xs text-muted">
                              {candidate.testGroup.scenario.name} › {candidate.testGroup.name}
                            </span>
                          </span>
                          <Badge tone={priorityTone(candidate.priority)}>
                            {candidate.priority}
                          </Badge>
                          <Badge tone={testResultTone(candidate.testResult)}>
                            {candidate.testResult.replace(/_/g, " ")}
                          </Badge>
                        </label>
                      ))}
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <DialogCloseButton />
                      <SubmitButton pendingLabel="Adding…">Add to run</SubmitButton>
                    </div>
                  </form>
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
