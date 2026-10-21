import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ALL_MEMBER_ROLES, WORK_STATE_ROLES, requireProjectRoleOrNotFound } from "@/lib/rbac";
import { getProjectById } from "@/lib/projects";
import {
  WORK_STATES,
  WORK_STATE_LABELS,
  WorkValidationError,
  WORK_SCOPES,
  WORK_SCOPE_OPTIONS,
  listMyWork,
  setWorkState,
  type MyWorkCase,
  type WorkScope,
} from "@/lib/work";
import {
  failureCount,
  listRunHistoryForCases,
  type RunHistoryEntry,
} from "@/lib/run-history";
import { Breadcrumb } from "@/components/Breadcrumb";
import { FilterForm } from "@/components/FilterForm";
import { Select } from "@/components/ui/Select";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pagination } from "@/components/ui/Pagination";
import { RunHistoryList } from "@/components/RunHistoryList";
import { Badge, priorityTone } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { WorkStatePicker } from "@/components/WorkStatePicker";
import { myWorkBreadcrumb, nameOr } from "@/lib/breadcrumb";
import { formatDate } from "@/lib/dates";
import {
  WORK_DAYS_BY_PRIORITY,
  workUrgency,
  workingDaysBetween,
} from "@/lib/deadlines";
import { withToast } from "@/lib/toast";
import { invalidateRouteCache } from "@/lib/revalidate";
import { mutedTextClass, pageClass } from "@/lib/ui";
import type { WorkState } from "@/generated/prisma/client";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProjectById(id);
  return { title: project ? `My Work · ${project.name}` : "My Work" };
}

/**
 * What has been handed to the person reading, and nothing else.
 *
 * Grouped by what has to happen next rather than listed by name, because the
 * first question anyone opens this with is "what is waiting on me" — and the
 * answer is a section heading, not a column to sort by.
 *
 * Everything a repair needs is on the card: what happened, what should have
 * happened, the steps, how often it has failed, what is attached, and who
 * said so. The alternative is a list of names and a trip to the Test Case
 * page for each one, which is the trip this page exists to remove.
 *
 * Not cross-project. Every link into the app already carries a project, and
 * a list spanning several would have to answer "which project is this in" on
 * every row before any of it could be read.
 */
const SECTION_SIZE = 5;

/** What the subtitle says, which is different for each reading of the list —
 *  "handed to you" is wrong on a page showing everybody's. */
const SCOPE_BLURB: Record<WorkScope, (total: number) => string> = {
  me: (total) =>
    total === 0
      ? "Nothing has been handed to you in this project."
      : `${total} case${total === 1 ? "" : "s"} handed to you, grouped by what happens next.`,
  "handed-out": (total) =>
    total === 0
      ? "You have not handed anything over in this project."
      : `${total} case${total === 1 ? "" : "s"} you handed over, grouped by what happens next.`,
  all: (total) =>
    total === 0
      ? "Nothing is being repaired in this project."
      : `${total} case${total === 1 ? "" : "s"} being repaired, grouped by what happens next.`,
};

const SECTION_BLURB: Record<WorkState, string> = {
  ASSIGNED: "Handed to you — nobody has started these yet",
  IN_PROGRESS: "You said you are on these",
  READY_TO_RETEST: "Waiting for a tester to run them again",
};

const SECTION_TONE: Record<WorkState, "red" | "amber" | "green"> = {
  ASSIGNED: "red",
  IN_PROGRESS: "amber",
  READY_TO_RETEST: "green",
};

/** One section's slice, from its own two parameters — the shape Problem Cases
 *  already uses, so a reader who has paged one has paged both. Sharing one
 *  `page` across the three would mean opening page 2 of "To fix" also opened
 *  page 2 of "Ready to retest", and the two have nothing to do with each
 *  other. */
function sliceSection(
  rows: MyWorkCase[],
  key: string,
  params: Record<string, string | undefined>,
) {
  const size = Math.min(Math.max(Number(params[`size_${key}`]) || SECTION_SIZE, 1), 100);
  const totalPages = Math.max(Math.ceil(rows.length / size), 1);
  const page = Math.min(Math.max(Number(params[`page_${key}`]) || 1, 1), totalPages);
  return {
    items: rows.slice((page - 1) * size, page * size),
    page,
    size,
    totalPages,
    total: rows.length,
  };
}

export default async function MyWorkPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  /* Open-ended: each section carries its own `page_x` and `size_x`. */
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id: projectId } = await params;
  const query = await searchParams;
  const session = await auth();

  /* Everybody, not only a DEV. A tester who hands themselves a case to look
   * at should be able to find it again, and a page that refused them would
   * be refusing them their own work. */
  await requireProjectRoleOrNotFound(session!.user.id, projectId, ALL_MEMBER_ROLES);

  /* Default `me`, whatever the role. A tester who hands work out wants the
   * other two views, but the page is called My Work and opening it on
   * somebody else's would be the page lying about its own name. */
  const scope: WorkScope = WORK_SCOPES.includes(query.who as WorkScope)
    ? (query.who as WorkScope)
    : "me";

  const [project, cases] = await Promise.all([
    getProjectById(projectId),
    listMyWork(projectId, session!.user.id, scope),
  ]);

  /* One query for every card, not one per card — the same rule the Test Run
   * page follows for its rows. */
  const histories = await listRunHistoryForCases(cases.map((row) => row.id));

  const basePath = `/projects/${projectId}/my-work`;

  /* Bound per card rather than reading the id out of the form: the control
   * saves on a press and carries only what it is about, so the case it
   * belongs to is part of the action, not part of the payload. */
  function changeState(testCaseId: string) {
    return async function change(formData: FormData) {
      "use server";
      invalidateRouteCache();
      const session = await auth();
      /* The one write outside `EDITOR_ROLES` in the whole app. A VIEWER is not
       * in this group: being able to see a case is not being able to say work
       * has been done on it. */
      await requireProjectRoleOrNotFound(session!.user.id, projectId, WORK_STATE_ROLES);

      const toState = String(formData.get("workState") ?? "") as WorkState;
      const note = String(formData.get("note") ?? "").trim();

      try {
        await setWorkState(testCaseId, toState, session!.user.id, note || undefined);
      } catch (err) {
        if (err instanceof WorkValidationError) {
          redirect(withToast(basePath, err.message));
        }
        throw err;
      }
      redirect(withToast(basePath, `Moved to ${WORK_STATE_LABELS[toState]}`));
    };
  }

  const total = cases.length;

  return (
    <main className={pageClass}>
      <Breadcrumb
        segments={myWorkBreadcrumb({ id: projectId, name: nameOr(project, projectId) })}
      />

      <PageHeader
        title="My Work"
        subtitle={SCOPE_BLURB[scope](total)}
        actions={
          /* Three readings of the same list, because the people who hand work
             out need to follow it as much as the people doing it. A form that
             navigates, like every other filter here. */
          <FilterForm showClear={scope !== "me"} ownLayout className="flex items-end gap-2">
            <Select
              name="who"
              defaultValue={scope}
              options={WORK_SCOPE_OPTIONS}
              ariaLabel="Whose repairs to show"
              className="max-w-48"
            />
          </FilterForm>
        }
      />

      {total === 0 ? (
        <p className={mutedTextClass}>
          {scope === "me"
            ? "A tester hands a case over from the round it failed in. When one arrives it shows up here, with what went wrong and what to do about it."
            : "Nothing matches this view."}
        </p>
      ) : (
        WORK_STATES.map((state) => {
          const key = state.toLowerCase();
          const slice = sliceSection(
            cases.filter((row) => row.workState === state),
            key,
            query,
          );

          return (
            <section key={state} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <Badge tone={SECTION_TONE[state]}>{WORK_STATE_LABELS[state]}</Badge>
                <span className={mutedTextClass}>{SECTION_BLURB[state]}</span>
                <span className="ml-auto text-sm font-semibold text-foreground">
                  {slice.total}
                </span>
              </div>

              {slice.total === 0 ? (
                <p className={mutedTextClass}>Nothing here.</p>
              ) : (
                <>
                  {slice.items.map((row) => (
                    <WorkCard
                      key={row.id}
                      row={row}
                      projectId={projectId}
                      history={histories.get(row.id) ?? []}
                      showAssignee={scope !== "me"}
                      action={changeState(row.id)}
                    />
                  ))}

                  {/* Always, like Problem Cases: the rows-per-page control
                      lives inside it, so hiding it once everything fits
                      strands anyone who raised the section to 25. */}
                  <Pagination
                    page={slice.page}
                    totalPages={slice.totalPages}
                    total={slice.total}
                    pageSize={slice.size}
                    pageParam={`page_${key}`}
                    pageSizeParam={`size_${key}`}
                  />
                </>
              )}
            </section>
          );
        })
      )}
    </main>
  );
}

/**
 * The deadline, and whether it has passed.
 *
 * Red once it is late — the one thing on the card that is allowed to shout,
 * which is why nothing else on it is red. Cases handed out before deadlines
 * existed carry none, and show nothing rather than "no deadline": a line
 * saying a thing is absent is worse than the gap it fills.
 */
function DueBadge({
  row,
  startedAt,
}: {
  row: MyWorkCase;
  /** When the case was last handed over, which is what "day N" counts from. */
  startedAt: Date | null;
}) {
  const state = describeDue(row, startedAt);
  if (!state) {
    return null;
  }
  return (
    <span className="flex shrink-0 items-center gap-2">
      <Badge tone={state.tone}>{state.label}</Badge>
      {row.dueAt && !state.late && (
        <span className="text-xs whitespace-nowrap text-muted">Due {formatDate(row.dueAt)}</span>
      )}
    </span>
  );
}

/* The clock is read here rather than in the component above: a server
 * component is rendered per request so the reading is fresh either way, but
 * `react-hooks/purity` is right that a component body is the wrong place to
 * ask what time it is. */
function describeDue(
  row: MyWorkCase,
  startedAt: Date | null,
): { tone: "red" | "amber" | "green"; label: string; late: boolean } | null {
  const tone = workUrgency(row);
  if (!tone || !row.dueAt) {
    return null;
  }
  if (tone === "red") {
    const days = Math.max(workingDaysBetween(row.dueAt, new Date()), 1);
    return { tone, late: true, label: `Overdue by ${days} day${days === 1 ? "" : "s"}` };
  }
  /* "Day 3 of 5" rather than "2 days left": the window is the thing being
   * spent, and a reader who knows a Medium case gets five days can see at a
   * glance both how far in it is and how much room is left. */
  const window = WORK_DAYS_BY_PRIORITY[row.priority];
  const spent = startedAt ? workingDaysBetween(startedAt, new Date()) : 0;
  return { tone, late: false, label: `Day ${Math.min(spent + 1, window)} of ${window}` };
}

function WorkCard({
  row,
  projectId,
  history,
  showAssignee,
  action,
}: {
  row: MyWorkCase;
  projectId: string;
  history: RunHistoryEntry[];
  /** Only on a list that is not only your own: on your own page it would
   *  print your name on every card. */
  showAssignee: boolean;
  action: (formData: FormData) => void;
}) {
  const { scenario } = row.testGroup;
  const { requirement } = scenario;
  const where = `${requirement.module.name} › ${requirement.name} › ${scenario.name} › ${row.testGroup.name}`;
  const reported = row.resultEvents[0];
  /* When the case was last handed over — the most recent move that put it in
   * somebody's hands. The events arrive newest first, so the first match is
   * the latest one. */
  const startedAt =
    row.workEvents.find((event) => event.toState === "ASSIGNED")?.occurredAt ?? null;
  const failures = failureCount(history);
  const whatHappened = row.notes || reported?.notes || "Nobody wrote down what went wrong.";
  const caseHref =
    `/projects/${projectId}/modules/${requirement.module.id}` +
    `/requirements/${requirement.id}/scenarios/${scenario.id}` +
    `/test-groups/${row.testGroup.id}/test-cases/${row.id}`;

  return (
    /* Named as a group: every card holds the same controls with the same
     * labels, so without this a screen reader walking the page hears "Save"
     * four times with nothing to say which case each belongs to. */
    <Card className="flex flex-col gap-4" role="group" aria-label={row.name}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-foreground">
            {/* A link, because the whole case — its attachments, its rounds,
                its history — is one page away and this card is a summary of
                it, not a replacement. */}
            <a href={caseHref} className="hover:underline">
              {row.name}
            </a>
          </p>
          {/* One line, whatever the chain is called. Five levels of Thai
              names pushed everything else off the card. */}
          <p className="mt-0.5 truncate text-xs text-muted">{where}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {showAssignee && row.assignee && (
            <span className="text-xs whitespace-nowrap text-muted">
              {row.assignee.name || row.assignee.email}
            </span>
          )}
          <DueBadge row={row} startedAt={startedAt} />
          <Badge tone={priorityTone(row.priority)}>{row.priority}</Badge>
        </div>
      </div>

      {/* Shut to begin with.
          A case carries a description, an expected result, preconditions and
          a numbered list of steps, and one of them filled the window on its
          own — which makes a page whose whole job is "what is waiting on me"
          unreadable at two cases, let alone ten.
          What survives the fold is the one line that says what is broken, so
          a shut card is still worth reading. A `details` rather than state in
          a client component: the page is server-rendered, this is the idiom
          the history below already uses, and it works before any JavaScript
          has loaded. */}
      <details className="group">
        {/* `list-none`, then a marker drawn by hand: a flex summary loses the
            browser's own triangle, and without one nothing says the row can
            be opened. Pointing the same way as the history's native marker
            below, and turning the same way when it opens. */}
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md py-1 text-sm hover:bg-black/[.02] focus-visible:outline-2 focus-visible:outline-brand dark:hover:bg-white/[.03] [&::-webkit-details-marker]:hidden">
          <span
            aria-hidden="true"
            className="text-[10px] text-muted transition-transform group-open:rotate-90 motion-reduce:transition-none"
          >
            ▶
          </span>
          <span className="text-xs font-semibold tracking-wider text-muted uppercase">
            What happened
          </span>
          {/* Hidden once the card is open, where the same words are about to
              be printed in full a few pixels below. */}
          <span className="min-w-0 flex-1 truncate text-foreground group-open:hidden">
            {whatHappened}
          </span>
        </summary>

        <div className="mt-3 grid gap-5 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <div>
              {/* The tester's own words. Without them the card says a case is
                  broken and nothing about how, which is the trip to go and ask
                  that this page exists to remove. */}
              <p className="text-sm text-foreground">{whatHappened}</p>
            </div>
            <div>
              <p className="text-xs font-semibold tracking-wider text-muted uppercase">
                What should happen
              </p>
              <p className="mt-1 text-sm text-muted">{row.expectedResult}</p>
            </div>
            {row.preconditions && (
              <div>
                <p className="text-xs font-semibold tracking-wider text-muted uppercase">
                  Preconditions
                </p>
                <p className="mt-1 text-sm text-muted">{row.preconditions}</p>
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold tracking-wider text-muted uppercase">Steps</p>
            <ol className="mt-1 flex list-inside list-decimal flex-col gap-1 text-sm text-muted">
              {row.steps.map((step, index) => (
                <li key={index}>{step.step}</li>
              ))}
            </ol>
            <p className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted">
              <span>
                {row._count.attachments} attachment
                {row._count.attachments === 1 ? "" : "s"}
              </span>
              <span>
                failed {failures} time{failures === 1 ? "" : "s"}
              </span>
              {reported?.recordedBy?.name && <span>reported by {reported.recordedBy.name}</span>}
            </p>

            {/* The shape of the failures, not just how many.
                "Failed twice" is the same sentence for a case that has never
                worked and for one that passed for months and broke last
                week, and those are two different jobs — the first is the
                feature, the second is what changed. The same strip the Test
                Case page and the round show, so a Dev reading it here has
                read it before. */}
            <div className="mt-4">
              <RunHistoryList
                entries={history}
                projectId={projectId}
                /* Three is where a round stops reading as "what happened" and
                   starts reading as a log. The card has a failure, a list of
                   steps and the controls to get through first. */
                collapseAfter={3}
                emptyMessage="No round has recorded an answer for this case yet."
              />
            </div>
          </div>
        </div>

      </details>

      {/* Outside the fold, deliberately: saying how far a repair has got is
          the reason to be on this page, and burying it behind an expand would
          put a click in front of the one thing a Dev came to do.

          No Save beside it: it writes on the press, the way the result and
          status controls on the Test Case list already do. The exception is
          "Ready to retest", which asks what was done first — a Dev saying a
          thing is fixed without saying what they changed sends the tester
          back to ask, and asking is the errand this page exists to remove. */}
      <div className="border-t border-border pt-4">
        <WorkStatePicker
          action={action}
          value={row.workState ?? ""}
          options={WORK_STATES.map((option) => ({
            value: option,
            label: WORK_STATE_LABELS[option],
          }))}
          needsNote={["READY_TO_RETEST"]}
          noteTitle={row.name}
          notePlaceholder="e.g. fixed in abc123 — the loader was racing the filter"
          label={`Where the repair on ${row.name} has got to`}
        />
      </div>

      {row.workEvents.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs font-semibold tracking-wider text-muted uppercase">
            How it got here
          </summary>
          <ul className="mt-2 flex flex-col gap-1.5 text-xs text-muted">
            {row.workEvents.map((event) => (
              <li key={event.id}>
                <span className="text-foreground">
                  {event.toState ? WORK_STATE_LABELS[event.toState] : "Retested — closed"}
                </span>
                {event.assignee?.name && <> · {event.assignee.name}</>}
                {event.actor?.name && <> · by {event.actor.name}</>} · {formatDate(event.occurredAt)}
                {event.note && <div className="text-foreground">“{event.note}”</div>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}
