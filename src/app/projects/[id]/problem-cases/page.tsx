import Link from "next/link";
import { auth } from "@/auth";
import { ALL_MEMBER_ROLES, requireProjectRoleOrNotFound } from "@/lib/rbac";
import { getProjectById } from "@/lib/projects";
import { listModulesForProject } from "@/lib/modules";
import { listPhasesForProject } from "@/lib/test-runs";
import {
  listProblemCases,
  summariseHistory,
  PROBLEM_PATTERN_ORDER,
  type CasePattern,
  type ProblemCase,
} from "@/lib/run-history";
import { Breadcrumb } from "@/components/Breadcrumb";
import { FilterForm } from "@/components/FilterForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { ResultCount } from "@/components/ui/ResultCount";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { nameOr, problemCasesBreadcrumb } from "@/lib/breadcrumb";
import { formatDate } from "@/lib/dates";
import { formRowClass, labelClass, mutedTextClass, pageClass } from "@/lib/ui";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProjectById(id);
  return { title: project ? `Problem cases · ${project.name}` : "Problem cases" };
}

/**
 * Each shape, with the sentence that says what to do about it. The heading
 * alone would not: "Unstable" is a word, and "the case or its data, not only
 * the feature" is the reason someone looks somewhere different.
 */
const SECTIONS: Record<
  (typeof PROBLEM_PATTERN_ORDER)[number],
  { title: string; blurb: string; tone: "red" | "amber" | "green" }
> = {
  regression: {
    title: "Regression",
    blurb: "Passed before, failing now — read these first",
    tone: "red",
  },
  "never-passed": {
    title: "Never passed",
    blurb: "Failed every round it has been in",
    tone: "red",
  },
  unstable: {
    title: "Unstable",
    blurb: "Passed and failed more than once — the case or its data, not only the feature",
    tone: "amber",
  },
  reworked: {
    title: "Reworked every round",
    blurb: "Always ends green, never on the first try — the fix keeps costing a round trip",
    tone: "amber",
  },
  recovered: {
    title: "Recovered",
    blurb: "Failed before, passing now — here so a fix can be seen, not chased",
    tone: "green",
  },
};

/** One square per round, oldest on the left, so the shape reads left to
 *  right. Colour alone would be the only carrier, so each square names its
 *  round and result in a tooltip. */
function ResultStrip({
  entries,
  projectId,
}: {
  entries: ProblemCase["history"];
  projectId: string;
}) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {entries.map((entry, index) => {
        const colour =
          entry.testResult === "PASSED"
            ? "bg-emerald-500"
            : entry.testResult === "FAILED"
              ? "bg-red-500"
              : entry.testResult === "BLOCKED"
                ? "bg-amber-500"
                : "bg-slate-400 dark:bg-slate-600";
        const latest = index === entries.length - 1;
        /* A round that went red before it went green is drawn split, red half
         * first, so the strip shows the work and not only the verdict. Without
         * this every round a developer fixed looks identical to one that was
         * right the first time, which is the whole reason this page was quiet
         * when it should not have been. */
        const reworked = entry.everFailed && entry.testResult !== "FAILED";
        const fill = reworked
          ? `bg-linear-to-r from-red-500 from-50% ${colour.replace(/bg-/g, "to-")} to-50%`
          : colour;
        const said = `${entry.testResult.replace(/_/g, " ")}${
          reworked ? ", after a failure in the same round" : ""
        }`;
        return (
          <Link
            key={entry.testRunId}
            href={`/projects/${projectId}/runs/${entry.testRunId}`}
            title={`${entry.runName} — ${said}`}
            aria-label={`${entry.runName}: ${said}`}
            className={`size-4 rounded ${fill} ${
              latest ? "ring-2 ring-brand ring-offset-1 ring-offset-background" : ""
            }`}
          />
        );
      })}
    </span>
  );
}

export default async function ProblemCasesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ phase?: string; moduleId?: string; pattern?: string }>;
}) {
  const { id: projectId } = await params;
  const { phase, moduleId, pattern } = await searchParams;
  const session = await auth();

  await requireProjectRoleOrNotFound(session!.user.id, projectId, ALL_MEMBER_ROLES);

  const [project, modules, phases, cases] = await Promise.all([
    getProjectById(projectId),
    listModulesForProject(projectId),
    listPhasesForProject(projectId),
    listProblemCases(projectId, { phase, moduleId }),
  ]);

  const shown = pattern ? cases.filter((row) => row.pattern === pattern) : cases;
  const byPattern = new Map<CasePattern, ProblemCase[]>();
  for (const row of shown) {
    const bucket = byPattern.get(row.pattern);
    if (bucket) {
      bucket.push(row);
    } else {
      byPattern.set(row.pattern, [row]);
    }
  }

  const hasFilters = Boolean(phase || moduleId || pattern);

  return (
    <main className={pageClass}>
      <Breadcrumb
        segments={problemCasesBreadcrumb({ id: projectId, name: nameOr(project, projectId) })}
      />
      <PageHeader
        title="Problem cases"
        subtitle="Which cases keep failing, and whether they have always failed, just broke, or cannot make up their mind."
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <FilterForm showClear={hasFilters} className={`${formRowClass} flex-1`} ownLayout>
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
              className="max-w-44"
            />
          </label>
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
              className="max-w-44"
            />
          </label>
          <label className={labelClass}>
            Pattern
            <Select
              name="pattern"
              defaultValue={pattern ?? ""}
              options={[
                { value: "", label: "All" },
                ...PROBLEM_PATTERN_ORDER.map((value) => ({
                  value,
                  label: SECTIONS[value].title,
                })),
              ]}
              ariaLabel="Pattern"
              className="max-w-44"
            />
          </label>
        </FilterForm>
        <ResultCount total={shown.length} />
      </div>

      {shown.length === 0 ? (
        <p className={mutedTextClass}>
          {hasFilters
            ? "No case matches those filters."
            : "Nothing is going wrong — no case in this project has failed in a round yet."}
        </p>
      ) : (
        PROBLEM_PATTERN_ORDER.filter((key) => byPattern.has(key)).map((key) => {
          const section = SECTIONS[key];
          const rows = byPattern.get(key) ?? [];
          return (
            <section key={key} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-sm font-semibold tracking-wide text-foreground uppercase">
                  {section.title}
                </h2>
                <Badge tone={section.tone}>{rows.length}</Badge>
                <span aria-hidden className="h-px min-w-8 flex-1 bg-border" />
                <span className="text-xs text-muted">{section.blurb}</span>
              </div>

              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full border-collapse text-sm">
                  <colgroup>
                    <col className="w-[46%]" />
                    <col className="w-[22%]" />
                    <col className="w-[32%]" />
                  </colgroup>
                  <tbody>
                    {rows.map((row) => {
                      const { hadFailure } = summariseHistory(row.history);
                      return (
                        <tr key={row.id} className="border-b border-border last:border-b-0">
                          <td className="px-3 py-3 align-top">
                            <Link
                              href={row.href}
                              className="font-medium text-foreground hover:text-brand hover:underline"
                            >
                              {row.name}
                            </Link>
                            {/* Where it lives, so a row can be acted on without
                                first working out which Module it came from. */}
                            <p className="mt-0.5 text-xs text-muted">{row.path}</p>
                          </td>
                          <td className="px-3 py-3 align-top">
                            <ResultStrip entries={row.history} projectId={projectId} />
                            <p className="mt-1 text-xs text-muted">
                              {row.brokeAt && (
                                <>
                                  Broke at{" "}
                                  <span className="text-foreground">{row.brokeAt.runName}</span>
                                  {" · "}
                                </>
                              )}
                              failed in {hadFailure} of {row.history.length}
                            </p>
                          </td>
                          <td className="px-3 py-3 align-top text-muted">
                            {row.lastFailure?.notes ?? (
                              <span className="text-muted">No note was left.</span>
                            )}
                            {row.lastFailure && (
                              <p className="mt-0.5 text-xs">
                                {row.lastFailure.runName}
                                {row.lastFailure.at && ` · ${formatDate(row.lastFailure.at)}`}
                                {row.lastFailure.by && ` · ${row.lastFailure.by}`}
                                {/* Otherwise a red note under a green strip
                                    reads as a contradiction. */}
                                {row.lastFailure.fixedInRound && " · passed later the same round"}
                              </p>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })
      )}

      <p className="text-xs text-muted">
        A case no round has ever reached is not here — with no result there is no shape to
        show. The Runs column on a Test Group&apos;s list is where those are found.
      </p>
    </main>
  );
}
