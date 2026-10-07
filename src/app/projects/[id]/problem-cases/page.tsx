import { Fragment } from "react";
import Link from "next/link";
import { auth } from "@/auth";
import { ALL_MEMBER_ROLES, requireProjectRoleOrNotFound } from "@/lib/rbac";
import { getProjectById } from "@/lib/projects";
import { listModulesForProject } from "@/lib/modules";
import { listPhasesForProject } from "@/lib/test-runs";
import {
  listProblemCases,
  summariseHistory,
  toResultMarks,
  PROBLEM_PATTERN_ORDER,
  type CasePattern,
  type ProblemCase,
} from "@/lib/run-history";
import { Breadcrumb } from "@/components/Breadcrumb";
import { FilterForm } from "@/components/FilterForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { ResultCount } from "@/components/ui/ResultCount";
import { Pagination } from "@/components/ui/Pagination";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { nameOr, problemCasesBreadcrumb } from "@/lib/breadcrumb";
import { formatDate } from "@/lib/dates";
import { formRowClass, labelClass, mutedTextClass, pageClass, thClass } from "@/lib/ui";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProjectById(id);
  return { title: project ? `Problem Cases · ${project.name}` : "Problem Cases" };
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
  stable: {
    title: "Clean",
    blurb: "Passed every time, first time — here so a case can be trusted, not only fixed",
    tone: "green",
  },
};

/** How many rows a section shows before it pages. Ten, the same as every
 *  other list in the app, so one screen holds several sections at once. */
const SECTION_SIZE = 10;

/** One section's slice of its rows, from the query string.
 *
 * Each section owns its own two parameters. Sharing one `page` across all of
 * them would mean opening page 3 of Regression also opened page 3 of Clean,
 * and the two have nothing to do with each other. */
function sliceSection(rows: ProblemCase[], key: string, params: Record<string, string | undefined>) {
  const size = Math.min(Math.max(Number(params[`size_${key}`]) || SECTION_SIZE, 1), 100);
  const totalPages = Math.max(Math.ceil(rows.length / size), 1);
  /* Clamped, not trusted: a filter can shrink a section while `page_x=5` is
   * still in the URL, and an out-of-range page would render nothing while
   * claiming to be somewhere. */
  const page = Math.min(Math.max(Number(params[`page_${key}`]) || 1, 1), totalPages);
  return {
    items: rows.slice((page - 1) * size, page * size),
    page,
    size,
    totalPages,
    total: rows.length,
  };
}

/**
 * One square per answer recorded, oldest on the left, so the shape reads
 * left to right — including the answers inside a round. A case that was
 * reported broken and passed after a fix shows red then green, which is the
 * only place that round trip is visible at a glance.
 *
 * Squares of the same round sit together and a rule separates one group from
 * the next, so the grouping survives without a label. A rule rather than a
 * wider gap: a gap has to be measured against the gap between squares to be
 * read at all, and at this size that comparison was too fine. Colour alone would be the
 * only carrier otherwise, so each square names its round, its answer, when it
 * was given and what was written down with it.
 *
 * The note lives here rather than in a column of its own. A column could only
 * ever show one note — the last failure's — while every answer has one, and
 * it cost a third of the table's width to say less than the squares already
 * do. The cost is that a hover is now the only way to read it, which is a
 * real loss for anyone on a touch screen or a keyboard.
 */
function ResultStrip({
  entries,
  projectId,
}: {
  entries: ProblemCase["history"];
  projectId: string;
}) {
  const marks = toResultMarks(entries);
  return (
    <span className="flex flex-wrap items-center gap-1">
      {marks.map((mark, index) => {
        const colour =
          mark.testResult === "PASSED"
            ? "bg-emerald-500"
            : mark.testResult === "FAILED"
              ? "bg-red-500"
              : mark.testResult === "BLOCKED"
                ? "bg-amber-500"
                : "bg-slate-400 dark:bg-slate-600";
        const latest = index === marks.length - 1;
        /* A group recorded outside a round is named by its day, so repeating
           the date after the result said it twice. */
        const when = mark.at && mark.testRunId ? ` · ${formatDate(mark.at)}` : "";
        const said =
          `${mark.runName} — ${mark.testResult.replace(/_/g, " ")}` +
          when +
          (mark.by ? ` · ${mark.by}` : "");
        /* On its own line, so a long note does not run the first line off the
           side of the tooltip and take the round's name with it. */
        const title = mark.notes ? `${said}
${mark.notes}` : said;
        const className =
          `size-4 rounded-[3px] ${colour}` +
          /* Recorded outside any round. A border rather than a different
             colour, because colour already says what the answer was, and a
             border reads in both themes from one token. */
          (mark.testRunId ? "" : " border-2 border-foreground") +
          (latest ? " ring-2 ring-brand ring-offset-1 ring-offset-background" : "");

        /* Nothing to open when there is no round, so it is not a link. */
        const square = mark.testRunId ? (
          <Link
            href={`/projects/${projectId}/runs/${mark.testRunId}`}
            title={title}
            aria-label={title}
            className={className}
          />
        ) : (
          <span title={title} aria-label={title} className={className} />
        );

        return (
          <Fragment key={index}>
            {/* Drawn rather than typed: a literal "|" sits on a text baseline
                and comes out a different height from the squares beside it. */}
            {mark.startsRound && index > 0 && (
              <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-muted" />
            )}
            {square}
          </Fragment>
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
  /* Open-ended: each section carries its own `page_x` and `size_x`, and
     listing them here would mean editing this type every time a pattern is
     added. */
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id: projectId } = await params;
  const query = await searchParams;
  const { phase, moduleId, pattern } = query;
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
        title="Problem Cases"
        subtitle="Every case anyone has answered for, grouped by the shape its results make — what broke, what cannot be trusted, and what has never given anyone trouble."
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
            : "Nothing to show yet — no case in this project has been answered pass or fail."}
        </p>
      ) : (
        PROBLEM_PATTERN_ORDER.filter((key) => byPattern.has(key)).map((key) => {
          const section = SECTIONS[key];
          const slice = sliceSection(byPattern.get(key) ?? [], key, query);
          return (
            <section key={key} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-sm font-semibold tracking-wide text-foreground uppercase">
                  {section.title}
                </h2>
                <Badge tone={section.tone}>{slice.total}</Badge>
                <span aria-hidden className="h-px min-w-8 flex-1 bg-border" />
                <span className="text-xs text-muted">{section.blurb}</span>
              </div>

              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full border-collapse text-sm">
                  <colgroup>
                    <col className="w-[44%]" />
                    <col className="w-[56%]" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th className={thClass}>Test case</th>
                      {/* Named for its unit, because the unit is not obvious:
                          one square is one result recorded, and a round can
                          hold several. */}
                      <th className={thClass}>Every result recorded</th>
                    </tr>
                  </thead>
                  <tbody>
                    {slice.items.map((row) => {
                      const { hadFailure } = summariseHistory(row.history);
                      return (
                        <tr key={row.id} className="border-b border-border last:border-b-0">
                          <td className="px-3 py-3 align-top">
                            <span className="flex flex-wrap items-center gap-2">
                              <Link
                                href={row.href}
                                className="font-medium text-foreground hover:text-brand hover:underline"
                              >
                                {row.name}
                              </Link>
                              {/* Beside the name rather than in the path
                                  below: the feature is how the team talks
                                  about a case, and the path is where it
                                  happens to live. */}
                              {row.feature && (
                                <Badge tone="gray" variant="outline">
                                  {row.feature}
                                </Badge>
                              )}
                            </span>
                            {/* Where it lives, so a row can be acted on without
                                first working out which Module it came from. */}
                            <p className="mt-0.5 text-xs text-muted">{row.path}</p>
                          </td>
                          <td className="px-3 py-3 align-top">
                            <ResultStrip entries={row.history} projectId={projectId} />
                            <p className="mt-1.5 text-xs text-muted">
                              {row.brokeAt && (
                                <>
                                  Broke at{" "}
                                  <span className="text-foreground">{row.brokeAt.runName}</span>
                                  {" · "}
                                </>
                              )}
                              {/* "rounds" said out loud: the squares are one
                                  per answer recorded, so a bare "1 of 2"
                                  beside six squares would be read as
                                  counting them. */}
                              {(() => {
                                /* "rounds" only while every group is one. A
                                   group recorded outside a round is not a
                                   round, and calling it one would make the
                                   number disagree with the squares. */
                                const outside = row.history.filter(
                                  (entry) => entry.testRunId === null,
                                ).length;
                                return outside === 0
                                  ? `failed in ${hadFailure} of ${row.history.length} round${
                                      row.history.length === 1 ? "" : "s"
                                    }`
                                  : `failed in ${hadFailure} of ${row.history.length} — ${outside} outside a round`;
                              })()}
                              {/* The notes moved into the squares, so say so
                                  once rather than leave someone to find it. */}
                              {" · "}
                              <span>hover a square for the note</span>
                            </p>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Only once a section has more than fits. A control saying
                  "1 of 1" under every section would be five of them on a
                  page where nothing can be paged. */}
              {slice.totalPages > 1 && (
                <Pagination
                  page={slice.page}
                  totalPages={slice.totalPages}
                  total={slice.total}
                  pageSize={slice.size}
                  pageParam={`page_${key}`}
                  pageSizeParam={`size_${key}`}
                />
              )}
            </section>
          );
        })
      )}

      <p className="text-xs text-muted">
        A case nobody has answered for is not here — with no pass and no fail there is no
        shape to show. The Runs column on a Test Group&apos;s list is where those are found.
      </p>
    </main>
  );
}
