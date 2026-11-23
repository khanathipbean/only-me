"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { PRIORITY_VALUES, TEST_RESULT_VALUES, WORKFLOW_STATUS_VALUES } from "@/lib/enums";
import { dialogClass, inputClass, labelClass } from "@/lib/ui";
import { Select } from "@/components/ui/Select";
import { ASSIGNEE_ENABLED } from "@/lib/features";
import { testCaseHref, testCasesListHref, testGroupsListHref } from "@/lib/hrefs";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import {
  Badge,
  type Tone,
  priorityTone,
  testResultTone,
  toneBarClass,
  workflowStatusTone,
} from "@/components/ui/Badge";
import { Button, IconButton, LinkButton } from "@/components/ui/Button";
import { useBackdropDismiss } from "@/components/ui/Modal";
import {
  BranchIcon,
  FileTextIcon,
  FolderIcon,
  LayersIcon,
  ListChecksIcon,
  PulseIcon,
} from "@/components/icons";
import { ChevronRightIcon, ClearIcon, FilterIcon, FilterOffIcon } from "@/components/icons";
import { Tooltip } from "@/components/ui/Tooltip";

const TEST_RESULT_LABELS: Record<string, string> = {
  NOT_RUN: "Not Run",
  PASSED: "Passed",
  FAILED: "Failed",
  BLOCKED: "Blocked",
  SKIPPED: "Skipped",
};

const PRIORITY_LABELS: Record<string, string> = {
  CRITICAL: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  READY: "Ready",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
};

/** Built once from the shared enum arrays: `Select` takes options as data
 * rather than <option> children. "All" clears the filter. */
const ALL_OPTION = { value: "", label: "All" };

const TEST_RESULT_OPTIONS = [
  ALL_OPTION,
  ...TEST_RESULT_VALUES.map((value) => ({ value, label: TEST_RESULT_LABELS[value] })),
];

const PRIORITY_OPTIONS = [
  ALL_OPTION,
  ...PRIORITY_VALUES.map((value) => ({ value, label: PRIORITY_LABELS[value] })),
];

const STATUS_OPTIONS = [
  ALL_OPTION,
  ...WORKFLOW_STATUS_VALUES.map((value) => ({ value, label: STATUS_LABELS[value] })),
];

type TreeTestCase = {
  id: string;
  name: string;
  testResult: string;
  priority: string;
  assigneeName: string | null;
};

/** What the panel's columns read off a node, summed on the server so that
 *  a Module and the Requirements under it can never disagree. `other` is
 *  skipped and blocked, which have no column and would otherwise be a gap
 *  between the three figures and the total. */
type TreeResults = {
  total: number;
  passed: number;
  failed: number;
  notRun: number;
  other: number;
  recorded: number;
};

type TreeTestGroup = {
  id: string;
  name: string;
  testCaseCount: number;
  results: TreeResults;
  testCases: TreeTestCase[];
};
type TreeScenario = {
  id: string;
  name: string;
  /** Its ancestors, so a tree row can link into the nested URL. */
  moduleId: string;
  requirementId: string;
  testCaseCount: number;
  results: TreeResults;
  testGroups: TreeTestGroup[];
};

type TreeRequirement = {
  id: string;
  name: string;
  code: string | null;
  feature: string | null;
  testCaseCount: number;
  results: TreeResults;
  isDraft: boolean;
  scenarios: TreeScenario[];
};

type TreeModule = {
  id: string;
  name: string;
  testCaseCount: number;
  results: TreeResults;
  requirements: TreeRequirement[];
};

/** Only these three have a record to fetch; a Module or a Requirement row
 *  expands and links, but has no preview. */
type PreviewType = "scenario" | "testGroup" | "testCase";

type PreviewTarget = {
  type: PreviewType;
  id: string;
  href: string;
  name: string;
  /** Only ever set for testCase: the dashboard tree API already resolves the
   * assignee's name, but the plain GET /api/test-cases/:id record only has
   * assigneeId — reuse the name already in hand instead of showing a raw id. */
  assigneeName?: string | null;
};

type DashboardData = {
  hasAnyData: boolean;
  counts: {
    modules: number;
    requirements: number;
    scenarios: number;
    testGroups: number;
    testCases: number;
  };
  testCasesByResult: Record<string, number>;
  testCasesByPriority: Record<string, number>;
  testCasesByAssignee: Array<{ assigneeId: string | null; assigneeName: string; count: number }>;
  testProgress: number;
  attention: { total: number; byPattern: Record<string, number> };
  tree: TreeModule[];
  options: {
    modules: Array<{ id: string; name: string }>;
    features: Array<{ name: string; moduleId: string }>;
    requirements: Array<{ id: string; name: string; moduleId: string }>;
    scenarios: Array<{ id: string; name: string; requirementId: string }>;
    testGroups: Array<{ id: string; name: string; scenarioId: string }>;
    testRuns: Array<{ id: string; name: string; status: string }>;
    phases: string[];
  };
  runProgress: Array<{
    id: string;
    name: string;
    status: string;
    total: number;
    recorded: number;
    byResult: Record<string, number>;
  }>;
  coverage: { inAnyRun: number; notInAnyRun: number };
  /** Null while a filter about test cases is on: a requirement with none
   *  cannot answer such a question, so the figure is unavailable rather
   *  than zero. */
  requirementCoverage: {
    total: number;
    withCases: number;
    withoutCases: number;
    draftWithoutCases: number;
  } | null;
};

type Filters = {
  search: string;
  /** Six sprints to a phase. Narrows which rounds exist as far as this page is
   *  concerned — both the panel and the round picker. */
  phase: string;
  /** Which round of testing to read results from. Empty means every Test Case
   *  and its last recorded result, which is what this page always showed. */
  testRunId: string;
  moduleId: string;
  feature: string;
  requirementId: string;
  scenarioId: string;
  testGroupId: string;
  testResult: string;
  priority: string;
  status: string;
  assigneeId: string;
  tags: string;
};

const EMPTY_FILTERS: Filters = {
  search: "",
  phase: "",
  testRunId: "",
  moduleId: "",
  feature: "",
  requirementId: "",
  scenarioId: "",
  testGroupId: "",
  testResult: "",
  priority: "",
  status: "",
  assigneeId: "",
  tags: "",
};

const FILTER_LABELS: Record<keyof Filters, string> = {
  search: "Search",
  phase: "Phase",
  testRunId: "Test Run",
  moduleId: "Module",
  feature: "Feature",
  requirementId: "Requirement",
  scenarioId: "Scenario",
  testGroupId: "Test Group",
  testResult: "Test Result",
  priority: "Priority",
  status: "Status",
  assigneeId: "Assignee",
  tags: "Tags",
};

export function DashboardView({ projectId }: { projectId: string }) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [data, setData] = useState<DashboardData | null>(null);
  // True from the start (initial load) and set again by whichever handler
  // changes `filters` below — never set synchronously inside the effect
  // itself, so a fetch's own setState calls only ever happen after an await.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Expand/collapse lives in its own state, independent of `data`, so
  // re-fetching after a filter change never resets which nodes are open.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [preview, setPreview] = useState<PreviewTarget | null>(null);

  // Deliberately Promise-chained rather than async/await: the react-hooks
  // "no setState in effect" lint treats an awaited call as still executing
  // synchronously inside the effect body, and flags every setState call
  // that follows regardless of the `await`. Nesting them inside .then()/
  // .catch()/.finally() callbacks instead keeps them out of the effect's
  // own synchronous body.
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const callbackUrl = query ? `${pathname}?${query}` : pathname;

  const fetchDashboard = useCallback(() => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value) {
        params.set(key, value);
      }
    }
    fetch(`/api/projects/${projectId}/dashboard?${params.toString()}`)
      .then((response) => {
        // The session can lapse while this page sits open. The API answers
        // 401 rather than redirecting, so send the browser to the login page
        // ourselves — otherwise the dashboard would just sit on a generic
        // "failed to load" and never say why.
        if (response.status === 401) {
          router.push(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
          return undefined;
        }
        if (!response.ok) {
          setError("Failed to load dashboard");
          setData(null);
          return undefined;
        }
        return response.json().then((body: DashboardData) => {
          setData(body);
          setError(null);
        });
      })
      .catch(() => {
        setError("Failed to load dashboard");
        setData(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [projectId, filters, router, callbackUrl]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  function updateFilter(key: keyof Filters, value: string) {
    setLoading(true);
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  /* The four hierarchy filters are one chain, so choosing a Module has to
   * drop a Requirement chosen under a different one — left alone the two
   * would contradict each other and the result would always be empty. */
  function updateHierarchyFilter(
    key: "moduleId" | "feature" | "requirementId" | "scenarioId",
    value: string,
  ) {
    setLoading(true);
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "moduleId") {
        next.feature = "";
      }
      if (key === "moduleId" || key === "feature") {
        next.requirementId = "";
      }
      if (key === "moduleId" || key === "feature" || key === "requirementId") {
        next.scenarioId = "";
      }
      next.testGroupId = "";
      return next;
    });
  }

  function clearAllFilters() {
    setLoading(true);
    setFilters(EMPTY_FILTERS);
  }

  function retry() {
    setLoading(true);
    fetchDashboard();
  }

  function toggleExpanded(nodeId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }

  const options = data?.options;
  const featureOptions = (options?.features ?? []).filter(
    (row) => !filters.moduleId || row.moduleId === filters.moduleId,
  );
  const requirementOptions = (options?.requirements ?? []).filter(
    (requirement) => !filters.moduleId || requirement.moduleId === filters.moduleId,
  );
  const scenarioOptions = (options?.scenarios ?? []).filter((scenario) => {
    if (filters.requirementId) {
      return scenario.requirementId === filters.requirementId;
    }
    // No Requirement chosen but a Module is: every Scenario under it.
    return (
      !filters.moduleId ||
      requirementOptions.some((requirement) => requirement.id === scenario.requirementId)
    );
  });
  const testGroupOptions = (options?.testGroups ?? []).filter(
    (testGroup) =>
      !filters.scenarioId
        ? scenarioOptions.some((scenario) => scenario.id === testGroup.scenarioId)
        : testGroup.scenarioId === filters.scenarioId,
  );

  function toOptions(rows: Array<{ id: string; name: string }>, allLabel: string) {
    return [
      { value: "", label: allLabel },
      ...rows.map((row) => ({ value: row.id, label: row.name })),
    ];
  }

  const activeFilters = Object.entries(filters).filter(([, value]) => value);

  /** The hierarchy/assignee filters store a raw id in state — this resolves
   * it back to the name the user actually picked, for the "Active:" chips.
   * Everything else (status, priority, dates, tags…) is already
   * human-readable and passes through unchanged. */
  function activeFilterLabel(key: keyof Filters, value: string): string {
    switch (key) {
      case "moduleId":
        return data?.options.modules.find((row) => row.id === value)?.name ?? value;
      case "requirementId":
        return data?.options.requirements.find((row) => row.id === value)?.name ?? value;
      case "scenarioId":
        return data?.options.scenarios.find((row) => row.id === value)?.name ?? value;
      case "testGroupId":
        return data?.options.testGroups.find((row) => row.id === value)?.name ?? value;
      case "testRunId":
        return data?.options.testRuns.find((row) => row.id === value)?.name ?? value;
      case "assigneeId":
        return (
          data?.testCasesByAssignee.find((row) => row.assigneeId === value)?.assigneeName ?? value
        );
      default:
        return value;
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <form
          onSubmit={(event) => event.preventDefault()}
          className="flex flex-wrap items-center gap-2"
        >
          <input
            type="search"
            value={filters.search}
            onChange={(event) => updateFilter("search", event.target.value)}
            placeholder="Search test cases…"
            aria-label="Search test cases"
            className={`${inputClass} min-w-48 flex-1`}
          />
          {/* Out in the open, not behind the filter toggle: this one changes
              what every number on the page means, rather than narrowing which
              rows they cover. Hidden entirely until the project has a round to
              choose. */}
          {(options?.phases?.length ?? 0) > 0 && (
            <Select
              value={filters.phase}
              onChange={(next) => {
                // Choosing a phase clears the round: the round that was
                // selected probably isn't in the new phase, and a picker
                // showing a value it no longer offers is worse than none.
                setLoading(true);
                setFilters((current) => ({ ...current, phase: next, testRunId: "" }));
              }}
              options={[
                { value: "", label: "All phases" },
                ...(options?.phases ?? []).map((value) => ({ value, label: value })),
              ]}
              ariaLabel="Phase"
              autoWidth
              /* A ceiling only, for a phase someone gave a long name. */
              className="max-w-44"
            />
          )}
          {(options?.testRuns?.length ?? 0) > 0 && (
            <Select
              value={filters.testRunId}
              onChange={(next) => updateFilter("testRunId", next)}
              options={[
                { value: "", label: "All test cases" },
                ...(options?.testRuns ?? []).map((run) => ({
                  value: run.id,
                  label: `${run.name} · ${run.status === "OPEN" ? "open" : "closed"}`,
                })),
              ]}
              ariaLabel="Test Run"
              autoWidth
              className="max-w-56"
            />
          )}
          <IconButton
            type="button"
            variant={showMoreFilters ? "secondary" : "ghost"}
            onClick={() => setShowMoreFilters((value) => !value)}
            aria-label={showMoreFilters ? "Hide filters" : "Show all filters"}
            aria-expanded={showMoreFilters}
            title={showMoreFilters ? "Hide filters" : "Show all filters"}
          >
            <FilterIcon />
          </IconButton>
          {/* Only when there is something to clear. */}
          {activeFilters.length > 0 && (
            <IconButton
              type="button"
              variant="secondary"
              onClick={clearAllFilters}
              aria-label="Clear all filters"
              title="Clear all filters"
            >
              <FilterOffIcon />
            </IconButton>
          )}
        </form>

        {/* -mt-3 while closed cancels the stack's own gap-3, so collapsing
            leaves the row below exactly where it sat before this panel
            animated at all. */}
        <Collapsible open={showMoreFilters} className={showMoreFilters ? "" : "-mt-3"}>
          <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* aria-label rather than relying on the wrapping <label>: a label
                can only be programmatically bound to a real form control, not to
                a custom combobox, so the visible text is decorative here. */}
            <label className={labelClass}>
              Module
              <Select
                value={filters.moduleId}
                onChange={(next) => updateHierarchyFilter("moduleId", next)}
                options={toOptions(options?.modules ?? [], "All")}
                ariaLabel="Module"
              />
            </label>
            {/* Only the Modules big enough to have sub-features use this,
                so the control stays out of the way when none do. */}
            {featureOptions.length > 0 && (
              <label className={labelClass}>
                Feature
                <Select
                  value={filters.feature}
                  onChange={(next) => updateHierarchyFilter("feature", next)}
                  options={toOptions(
                    featureOptions.map((row) => ({ id: row.name, name: row.name })),
                    "All",
                  )}
                  ariaLabel="Feature"
                />
              </label>
            )}
            <label className={labelClass}>
              Requirement
              <Select
                value={filters.requirementId}
                onChange={(next) => updateHierarchyFilter("requirementId", next)}
                options={toOptions(requirementOptions, "All")}
                ariaLabel="Requirement"
              />
            </label>
            <label className={labelClass}>
              Test Result
              <Select
                value={filters.testResult}
                onChange={(next) => updateFilter("testResult", next)}
                options={TEST_RESULT_OPTIONS}
                ariaLabel="Test Result"
              />
            </label>
            <label className={labelClass}>
              Priority
              <Select
                value={filters.priority}
                onChange={(next) => updateFilter("priority", next)}
                options={PRIORITY_OPTIONS}
                ariaLabel="Priority"
              />
            </label>
            <label className={labelClass}>
              Status
              <Select
                value={filters.status}
                onChange={(next) => updateFilter("status", next)}
                options={STATUS_OPTIONS}
                ariaLabel="Status"
              />
            </label>
            <label className={labelClass}>
              Scenario
              <Select
                value={filters.scenarioId}
                onChange={(next) => updateHierarchyFilter("scenarioId", next)}
                options={toOptions(scenarioOptions, "All")}
                ariaLabel="Scenario"
              />
            </label>
            <label className={labelClass}>
              Test Group
              <Select
                value={filters.testGroupId}
                onChange={(next) => updateFilter("testGroupId", next)}
                options={toOptions(testGroupOptions, "All")}
                ariaLabel="Test Group"
              />
            </label>
            <label className={labelClass}>
              Tags (comma-separated)
              <input
                value={filters.tags}
                onChange={(event) => updateFilter("tags", event.target.value)}
                placeholder="e.g. smoke, regression"
                className={inputClass}
              />
            </label>
          </div>
        </Collapsible>

        {activeFilters.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">Active:</span>
            {activeFilters.map(([key, value]) => (
              <Badge key={key} tone="blue">
                {FILTER_LABELS[key as keyof Filters]}:{" "}
                {activeFilterLabel(key as keyof Filters, value)}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <SummaryWidget
        loading={loading}
        error={error}
        data={data}
        onRetry={retry}
        projectId={projectId}
        onDrillDown={updateFilter}
      />
      <TreeWidget
        loading={loading}
        error={error}
        data={data}
        onRetry={retry}
        projectId={projectId}
        expanded={expanded}
        onToggle={toggleExpanded}
        onPreview={setPreview}
      />
      <PreviewModal target={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

function WidgetShell({
  label,
  aside,
  children,
}: {
  label: string;
  /** A line beside the title, for a figure that belongs to the panel as a
   *  whole rather than to any row in it. */
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card aria-label={label}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold text-foreground">{label}</h2>
        {aside}
      </div>
      <div className="mt-3">{children}</div>
    </Card>
  );
}

function SummaryWidget({
  loading,
  error,
  data,
  onRetry,
  projectId,
  onDrillDown,
}: {
  loading: boolean;
  error: string | null;
  data: DashboardData | null;
  onRetry: () => void;
  projectId: string;
  onDrillDown: (key: keyof Filters, value: string) => void;
}) {
  if (loading) {
    return (
      <WidgetShell label="Overview">
        <p className="text-sm text-muted">Loading…</p>
      </WidgetShell>
    );
  }

  if (error) {
    return (
      <WidgetShell label="Overview">
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
        <Button type="button" variant="secondary" onClick={onRetry} className="mt-3">
          Retry
        </Button>
      </WidgetShell>
    );
  }

  if (!data) {
    return null;
  }

  if (!data.hasAnyData) {
    return (
      <WidgetShell label="Overview">
        <p className="text-sm text-muted">This project has no Scenarios yet.</p>
        <div className="mt-3 flex gap-2">
          <LinkButton href={`/projects/${projectId}/modules`} variant="primary">
            Go to Modules
          </LinkButton>
          <LinkButton href={`/projects/${projectId}/modules/import`} variant="secondary">
            Import Data
          </LinkButton>
        </div>
      </WidgetShell>
    );
  }

  if (data.counts.testCases === 0) {
    return (
      <WidgetShell label="Overview">
        <p className="text-sm text-muted">No results match the current filters.</p>
      </WidgetShell>
    );
  }

  return (
    <WidgetShell label="Overview">
      {/* 2 / 3 / 6 — each divides evenly, where the old 4-column grid left a
          ragged last row. Two at phone width used to cost "Requirements" its
          last four letters, because the icon square and the rule took the
          room the label needed; both are gone, and the label now fits in half
          a phone's width. Measured, not assumed. */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Stat icon={<LayersIcon />} label="Modules" value={data.counts.modules} />
        <Stat icon={<FileTextIcon />} label="Requirements" value={data.counts.requirements} />
        <Stat icon={<BranchIcon />} label="Scenarios" value={data.counts.scenarios} />
        <Stat icon={<FolderIcon />} label="Test Groups" value={data.counts.testGroups} />
        <Stat icon={<ListChecksIcon />} label="Test Cases" value={data.counts.testCases} />
        <Stat
          icon={<PulseIcon />}
          label="Test Progress"
          value={`${data.testProgress.toFixed(1)}%`}
        />
      </div>

      <AttentionStrip projectId={projectId} attention={data.attention} />

      <div className="mt-6 grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-3">
        <BreakdownList
          title="By Test Result"
          entries={Object.entries(data.testCasesByResult)}
          total={data.counts.testCases}
          onClick={(key) => onDrillDown("testResult", key)}
          tone={testResultTone}
        />
        <BreakdownList
          title="By Priority"
          entries={Object.entries(data.testCasesByPriority)}
          total={data.counts.testCases}
          onClick={(key) => onDrillDown("priority", key)}
          tone={priorityTone}
        />

        {/* The third column, which the two breakdowns left empty. One panel,
            not two stacked: the rounds and the work no round covers are the
            same story — where the testing has been spread — and a second
            heading in a column where every other column has one read as a
            layout accident.

            Deliberately ignoring the filters above, including the chosen
            round: this exists to compare the rounds against each other, and
            filtered there would be nothing to compare. Phase is the one
            exception, because it decides which rounds are on the page at
            all. */}
        {data.runProgress.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Test Runs</h3>
            <ul className="mt-3 grid grid-cols-[max-content_1fr_auto] items-center gap-x-2.5 gap-y-2">
              {data.runProgress.map((run) => (
                <li key={run.id} className="col-span-3 grid grid-cols-subgrid items-center">
                  <RunProgressRow run={run} />
                </li>
              ))}
              {data.coverage.notInAnyRun > 0 && (
                <>
                  {/* A rule, because the row below is not a round: it is what
                      the rounds above have not reached. */}
                  <li aria-hidden="true" className="col-span-3 my-0.5 border-t border-border" />
                  <li className="col-span-3 grid grid-cols-subgrid items-center">
                    <MeterRow
                      label="unscheduled"
                      count={data.coverage.notInAnyRun}
                      total={data.coverage.inAnyRun + data.coverage.notInAnyRun}
                      tone="gray"
                      hint="In no run yet — an archived run doesn't count."
                    />
                  </li>
                </>
              )}
            </ul>
            {data.coverage.notInAnyRun > 0 && (
              <p className="mt-2 text-[11px] text-muted">
                Test Progress counts every case, these included.
              </p>
            )}
          </div>
        )}

      </div>
    </WidgetShell>
  );
}

/**
 * Icon and name first, figure second.
 *
 * The other order — a bare number with its name beneath — asks you to hold
 * six unlabelled figures in your head until you reach what each one counts.
 * The icon is what lets the row be scanned at a glance once the names are
 * known.
 *
 * No bar, deliberately, on Test Progress or any of them: a first pass gave
 * that card a split bar and a legend, and every figure in the legend was
 * already on screen a few rows below under By Test Result — which carries
 * Not Run and a click through to the filter besides.
 *
 * `Stat` itself now lives in `@/components/ui/Stat` — the Overview tab's
 * summary reuses the exact same tile, and a plain module lets it do that
 * without pulling this file's client boundary along for the ride.
 */

/** The shapes this strip reports, in the order Problem Cases lists them, under
 *  the headings that page uses — word for word, so following a chip lands on a
 *  section whose title is the one that was pressed. Two names rather than one:
 *  the key is what the filter takes, the label is what a reader has seen. */
const ATTENTION_LABELS: Array<{ key: string; label: string; dot: string }> = [
  { key: "regression", label: "Regression", dot: "bg-red-500" },
  { key: "never-passed", label: "Never passed", dot: "bg-red-500" },
  { key: "unstable", label: "Unstable", dot: "bg-amber-500" },
  { key: "reworked", label: "Reworked every round", dot: "bg-amber-500" },
];

/**
 * How many cases keep going wrong, and in what way.
 *
 * The result breakdown below answers "how many are failing now". This answers
 * "how many keep failing", which the same number cannot: a case that broke
 * this morning and one that has broken every sprint for two months are both
 * one FAILED there.
 *
 * Absent when there is nothing to report, rather than showing a zero. A strip
 * that exists to say there is nothing to do costs a row and earns none, and
 * its disappearing is itself the good news.
 */
function AttentionStrip({
  projectId,
  attention,
}: {
  projectId: string;
  attention: { total: number; byPattern: Record<string, number> };
}) {
  if (attention.total === 0) {
    return null;
  }
  const base = `/projects/${projectId}/problem-cases`;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-border bg-black/[.02] px-4 py-3 dark:bg-white/[.02]">
      {/* Centred on each other, not sat on a shared baseline: the figure is
          twice the label's size, and a shared baseline hangs the label off
          the bottom of it. */}
      <span className="flex items-center gap-2">
        <span className="text-sm font-semibold text-foreground">Problem cases</span>
        <span className="text-2xl font-semibold text-red-600 dark:text-red-400">
          {attention.total}
        </span>
      </span>
      <span aria-hidden className="hidden h-6 w-px bg-border sm:block" />
      <span className="flex flex-wrap items-center gap-2">
        {ATTENTION_LABELS.map((row) => {
          const count = attention.byPattern[row.key] ?? 0;
          const chip =
            "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs";

          /* A shape nothing is in is still worth a place. Showing only the
             shapes with something in them made the strip a different width
             every time it was read, and left no way to tell "no regressions"
             from "regressions are not counted here". */
          if (count === 0) {
            return (
              <span key={row.key} className={`${chip} border-border/60 text-muted/60`}>
                <span className={`size-2 rounded-full ${row.dot} opacity-40`} />
                {row.label} <span className="font-semibold">0</span>
              </span>
            );
          }

          /* Each one lands on its own section rather than the top of the
             page: the reader has already chosen which kind they are here
             for. */
          return (
            <Link
              key={row.key}
              href={`${base}?pattern=${row.key}`}
              className={`${chip} border-border text-muted hover:border-brand hover:text-foreground`}
            >
              <span className={`size-2 rounded-full ${row.dot}`} />
              {row.label} <span className="font-semibold text-foreground">{count}</span>
            </Link>
          );
        })}
      </span>
      <Link
        href={base}
        className="ml-auto shrink-0 text-xs text-muted hover:text-brand hover:underline"
      >
        Open Problem Cases →
      </Link>
    </div>
  );
}

function BreakdownList({
  title,
  entries,
  total,
  onClick,
  tone,
}: {
  title: string;
  entries: [string, number][];
  total: number;
  onClick: (key: string) => void;
  tone: (value: string) => Tone;
}) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      <ul className="mt-3 grid grid-cols-[max-content_1fr_auto] items-center gap-x-2.5 gap-y-2">
        {entries.map(([key, count]) => (
          <li key={key} className="col-span-3 grid grid-cols-subgrid items-center">
            <MeterRow
              label={key.replace(/_/g, " ")}
              count={count}
              total={total}
              tone={tone(key)}
              onClick={() => onClick(key)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A single proportional bar row — the shared building block for every Overview breakdown list. */
/**
 * One round: its name, how much of it has been recorded, and what those
 * results were — one bar split by result rather than five separate bars, so
 * three rounds read as three things to compare instead of fifteen.
 *
 * Reuses the result tones from `By Test Result` above it. A round's own colour
 * would be a new hue for something that already has one, and every tone in
 * `Badge` is spoken for.
 */
function RunProgressRow({
  run,
}: {
  run: {
    name: string;
    status: string;
    total: number;
    recorded: number;
    byResult: Record<string, number>;
  };
}) {
  // NOT_RUN last and unfilled: it is the part not yet done, which reads as the
  // empty remainder of the bar rather than a result of its own.
  const segments = TEST_RESULT_VALUES.filter((value) => value !== "NOT_RUN")
    .map((value) => ({ value, count: run.byResult[value] ?? 0 }))
    .filter((segment) => segment.count > 0);

  return (
    <Tooltip
      className="col-span-3 grid grid-cols-subgrid items-center"
      label={
        <span className="flex flex-col gap-0.5">
          <span className="font-semibold">
            {run.name} · {run.status === "OPEN" ? "open" : "closed"}
          </span>
          {/* Every result, including the ones with none: a round with no
              failures is worth seeing stated, and a list that changes length
              as you move between rows is harder to read than one that
              doesn't. */}
          {TEST_RESULT_VALUES.map((value) => (
            <span key={value} className="flex justify-between gap-4">
              <span>{TEST_RESULT_LABELS[value]}</span>
              <span className="tabular-nums">{run.byResult[value] ?? 0}</span>
            </span>
          ))}
        </span>
      }
    >
      <span className="truncate text-xs font-medium text-muted">{run.name}</span>
      <span className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-black/[.06] dark:bg-white/[.1]">
        {segments.map((segment) => (
          <span
            key={segment.value}
            className={`block h-full ${toneBarClass(testResultTone(segment.value))}`}
            style={{ width: `${run.total > 0 ? (segment.count / run.total) * 100 : 0}%` }}
          />
        ))}
      </span>
      <span className="text-right text-xs font-semibold tabular-nums text-foreground">
        {run.recorded}/{run.total}
      </span>
    </Tooltip>
  );
}

function MeterRow({
  label,
  count,
  total,
  tone,
  onClick,
  hint,
}: {
  label: string;
  count: number;
  total: number;
  tone: Tone;
  onClick?: () => void;
  /** An extra line on the tooltip, where the number alone doesn't explain
   *  itself. */
  hint?: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  const content = (
    <>
      <span className="truncate text-xs font-medium text-muted capitalize">
        {label.toLowerCase()}
      </span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/[.06] dark:bg-white/[.1]">
        <span
          className={`block h-full rounded-full ${toneBarClass(tone)}`}
          style={{ width: `${Math.max(pct, count > 0 ? 4 : 0)}%` }}
        />
      </span>
      <span className="text-right text-xs font-semibold tabular-nums text-foreground">
        {count}
      </span>
    </>
  );

  const tip = (
    <span className="flex flex-col gap-0.5">
      <span className="font-semibold capitalize">{label.toLowerCase()}</span>
      <span>
        {count} of {total} ({pct}%)
      </span>
      {hint && <span className="opacity-80">{hint}</span>}
    </span>
  );

  if (!onClick) {
    return (
      <Tooltip label={tip} className="col-span-3 grid grid-cols-subgrid items-center">
        {content}
      </Tooltip>
    );
  }

  return (
    <Tooltip
      label={tip}
      className="col-span-3 grid grid-cols-subgrid items-center rounded-md hover:bg-black/[.03] dark:hover:bg-white/[.05]"
    >
      <button
        type="button"
        onClick={onClick}
        className="col-span-3 grid grid-cols-subgrid items-center py-0.5 text-left"
      >
        {content}
      </button>
    </Tooltip>
  );
}

/** A tree node carries its own ancestors, since a Scenario's URL is nested
 *  under the Module and Requirement it belongs to. */
function idsOf(projectId: string, scenario: TreeScenario) {
  return {
    projectId,
    moduleId: scenario.moduleId,
    requirementId: scenario.requirementId,
    scenarioId: scenario.id,
  };
}

/** Animates a section open/closed instead of mounting/unmounting it outright.
 * Children stay in the DOM at all times — the branch's own data is already
 * in hand (the whole tree arrives in one response), so there's no lazy-fetch
 * to lose by keeping a collapsed subtree rendered — and the 0fr/1fr grid-row
 * trick animates a height that was never known ahead of time, without
 * measuring it in JS.
 *
 * `inert` is the price of keeping them: a collapsed section is invisible but
 * still in the DOM, and without it Tab walks into controls nobody can see. */
function Collapsible({
  open,
  className = "",
  children,
}: {
  open: boolean;
  /** For a caller whose parent stack has a `gap`: a collapsed section is zero
   *  height but still a flex item, so the gap around it stays on screen. Pass
   *  a matching negative margin to cancel it — it animates alongside. */
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      inert={!open}
      className={`grid transition-[grid-template-rows,margin] duration-200 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"} ${className}`}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}

function TreeWidget({
  loading,
  error,
  data,
  onRetry,
  projectId,
  expanded,
  onToggle,
  onPreview,
}: {
  loading: boolean;
  error: string | null;
  data: DashboardData | null;
  onRetry: () => void;
  projectId: string;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onPreview: (target: PreviewTarget) => void;
}) {
  if (loading) {
    return (
      <WidgetShell label="Hierarchy">
        <p className="text-sm text-muted">Loading…</p>
      </WidgetShell>
    );
  }

  if (error) {
    return (
      <WidgetShell label="Hierarchy">
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
        <Button type="button" variant="secondary" onClick={onRetry} className="mt-3">
          Retry
        </Button>
      </WidgetShell>
    );
  }

  if (!data) {
    return null;
  }

  if (!data.hasAnyData) {
    return (
      <WidgetShell label="Hierarchy">
        <p className="text-sm text-muted">This project has no Scenarios yet.</p>
        <LinkButton href={`/projects/${projectId}/modules`} variant="primary" className="mt-3">
          Go to Modules
        </LinkButton>
      </WidgetShell>
    );
  }

  if (data.tree.length === 0) {
    return (
      <WidgetShell label="Hierarchy">
        <p className="text-sm text-muted">No results match the current filters.</p>
      </WidgetShell>
    );
  }

  return (
    <HierarchyPanel
      data={data}
      projectId={projectId}
      expanded={expanded}
      onToggle={onToggle}
      onPreview={onPreview}
    />
  );
}

/**
 * The panel proper, split from the loading and empty states above so that
 * its own state — which requirements it is showing — has somewhere to live
 * that is not called before those early returns.
 */
function HierarchyPanel({
  data,
  projectId,
  expanded,
  onToggle,
  onPreview,
}: {
  data: DashboardData;
  projectId: string;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onPreview: (target: PreviewTarget) => void;
}) {
  const [covered, setCovered] = useState<Covered>("all");
  const rows = buildRows({
    tree: data.tree,
    projectId,
    expanded,
    onToggle,
    onPreview,
    /* The filter only exists while the figure behind it does. */
    covered: data.requirementCoverage ? covered : "all",
  });

  return (
    <WidgetShell label="Hierarchy" aside={<CoverageLine coverage={data.requirementCoverage} />}>
      {data.requirementCoverage && (
        <CoverageFilter
          coverage={data.requirementCoverage}
          value={covered}
          onChange={setCovered}
        />
      )}

      {/* Wide on purpose, and scrolled rather than squeezed: seven columns of
          figures that have to line up down the page cannot be made narrower
          without taking the lining up away, which is the whole use of them. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[60rem] border-collapse">
          <thead>
            <tr className="border-b border-border text-[10px] font-semibold uppercase tracking-wide text-muted">
              <th scope="col" className="py-2 pr-3 text-left">
                Hierarchy
              </th>
              {COLUMNS.map((column) => (
                <th key={column.label} scope="col" className={`px-2 py-2 ${column.head}`}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <TreeRow key={row.key} row={row} />
            ))}
          </tbody>
        </table>
      </div>

      {rows.length === 0 && (
        <p className="mt-4 text-sm text-muted">No rows match the current filters.</p>
      )}
    </WidgetShell>
  );
}

const COLUMNS = [
  { label: "Requirements", head: "text-center" },
  { label: "Test Cases", head: "text-center" },
  { label: "Coverage", head: "text-center" },
  { label: "Passed", head: "text-center" },
  { label: "Failed", head: "text-center" },
  { label: "Not Run", head: "text-center" },
  { label: "Execution %", head: "text-left" },
] as const;

/** Which requirements the panel is showing, by whether anything tests them. */
type Covered = "all" | "with" | "without";

type HierarchyRow = {
  key: string;
  depth: number;
  level: string;
  tone: Tone;
  label: string;
  code?: string | null;
  feature?: string | null;
  bold?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  onPreview?: () => void;
  /** Only a Module can answer this one. */
  requirements?: number;
  /** Absent on a Test Case, which is one case rather than a count of them. */
  results?: TreeResults;
  /** A share for a Module, a yes or no for a Requirement, nothing below. */
  coverage?: { share: number } | { hasCases: boolean };
  /** A Test Case's own result, which goes in the column that counts it. */
  result?: string;
};

/**
 * The tree flattened to the rows that are actually on screen.
 *
 * Flat rather than nested because this is a table now: a row of figures that
 * line up down the page cannot be wrapped in the animated panel the nested
 * version used, and collapsing by leaving rows out is what a table does.
 */
function buildRows({
  tree,
  projectId,
  expanded,
  onToggle,
  onPreview,
  covered,
}: {
  tree: TreeModule[];
  projectId: string;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onPreview: (target: PreviewTarget) => void;
  covered: Covered;
}): HierarchyRow[] {
  const rows: HierarchyRow[] = [];
  /* With the filter on, the Modules open themselves and lose their twisty.
     Collapsed, the panel answered "No Cases" with a list of Modules and
     nothing else - the rows the reader had just asked for were one click
     further in, and the filter read as broken. */
  const filtering = covered !== "all";

  tree.forEach((moduleNode) => {
    const requirements = moduleNode.requirements.filter((requirement) => {
      if (covered === "with") return requirement.results.total > 0;
      if (covered === "without") return requirement.results.total === 0;
      return true;
    });
    if (requirements.length === 0) {
      return;
    }

    /* The Module's own figures follow what is on screen: filtering to the
       untested ones and leaving the Module reading as if nothing had changed
       would be two answers to one question. */
    const results = requirements.reduce(
      (sum, requirement) => addInto(sum, requirement.results),
      emptyResults(),
    );
    const withCases = requirements.filter((requirement) => requirement.results.total > 0).length;

    rows.push({
      key: moduleNode.id,
      depth: 0,
      level: "Module",
      tone: "indigo",
      label: moduleNode.name,
      bold: true,
      expanded: filtering || expanded.has(moduleNode.id),
      onToggle: filtering ? undefined : () => onToggle(moduleNode.id),
      requirements: requirements.length,
      results,
      coverage: { share: (withCases / requirements.length) * 100 },
    });
    if (!filtering && !expanded.has(moduleNode.id)) {
      return;
    }

    requirements.forEach((requirement) => {
      rows.push({
        key: requirement.id,
        depth: 1,
        level: "Requirement",
        tone: "cyan",
        label: requirement.code ? `${requirement.code} — ${requirement.name}` : requirement.name,
        feature: requirement.feature,
        bold: true,
        expanded: expanded.has(requirement.id),
        /* A Requirement nothing tests has nothing to open. */
        onToggle: requirement.scenarios.length > 0 ? () => onToggle(requirement.id) : undefined,
        results: requirement.results,
        coverage: { hasCases: requirement.results.total > 0 },
      });
      if (!expanded.has(requirement.id)) {
        return;
      }

      requirement.scenarios.forEach((scenario) => {
        rows.push({
          key: scenario.id,
          depth: 2,
          level: "Scenario",
          tone: "blue",
          label: scenario.name,
          bold: true,
          expanded: expanded.has(scenario.id),
          onToggle: () => onToggle(scenario.id),
          onPreview: () =>
            onPreview({
              type: "scenario",
              id: scenario.id,
              href: testGroupsListHref(idsOf(projectId, scenario)),
              name: scenario.name,
            }),
          results: scenario.results,
        });
        if (!expanded.has(scenario.id)) {
          return;
        }

        scenario.testGroups.forEach((group) => {
          rows.push({
            key: group.id,
            depth: 3,
            level: "Test Group",
            tone: "purple",
            label: group.name,
            expanded: expanded.has(group.id),
            onToggle: () => onToggle(group.id),
            onPreview: () =>
              onPreview({
                type: "testGroup",
                id: group.id,
                href: testCasesListHref({ ...idsOf(projectId, scenario), testGroupId: group.id }),
                name: group.name,
              }),
            results: group.results,
          });
          if (!expanded.has(group.id)) {
            return;
          }

          group.testCases.forEach((testCase) => {
            rows.push({
              key: testCase.id,
              depth: 4,
              level: "Test Case",
              tone: "gray",
              label: testCase.name,
              result: testCase.testResult,
              onPreview: () =>
                onPreview({
                  type: "testCase",
                  id: testCase.id,
                  href: testCaseHref({
                    ...idsOf(projectId, scenario),
                    testGroupId: group.id,
                    testCaseId: testCase.id,
                  }),
                  name: testCase.name,
                  assigneeName: testCase.assigneeName,
                }),
            });
          });
        });
      });
    });
  });

  return rows;
}

/** `emptyResults` is a server module's export and this is a client file, so
 *  the two-line sum lives here rather than dragging Prisma into the bundle. */
function emptyResults(): TreeResults {
  return { total: 0, passed: 0, failed: 0, notRun: 0, other: 0, recorded: 0 };
}

function addInto(sum: TreeResults, from: TreeResults): TreeResults {
  return {
    total: sum.total + from.total,
    passed: sum.passed + from.passed,
    failed: sum.failed + from.failed,
    notRun: sum.notRun + from.notRun,
    other: sum.other + from.other,
    recorded: sum.recorded + from.recorded,
  };
}

/**
 * How many requirements nothing tests — the one figure the Overview card
 * above cannot give, since every number in it counts test cases and a
 * requirement with none is invisible to all of them.
 */
function CoverageLine({ coverage }: { coverage: DashboardData["requirementCoverage"] }) {
  if (!coverage) {
    /* A filter about test cases is on. Saying so beats printing a zero that
       would read as there being nothing left to write. */
    return (
      <span className="text-xs text-muted">
        Requirement coverage is set aside while a test-case filter is on
      </span>
    );
  }
  if (coverage.total === 0) {
    return null;
  }
  if (coverage.withoutCases === 0) {
    return (
      <span className="text-xs text-muted">
        Every requirement here has at least one test case
      </span>
    );
  }
  return (
    <span className="text-xs text-muted">
      <span className="font-semibold text-amber-600 dark:text-amber-400">
        {coverage.withoutCases}
      </span>{" "}
      of {coverage.total} requirements have no test cases
      {coverage.draftWithoutCases > 0 ? ` (Draft ${coverage.draftWithoutCases})` : ""}
    </span>
  );
}

function CoverageFilter({
  coverage,
  value,
  onChange,
}: {
  coverage: NonNullable<DashboardData["requirementCoverage"]>;
  value: Covered;
  onChange: (next: Covered) => void;
}) {
  const options: Array<{ key: Covered; label: string; count: number; tone: Tone }> = [
    { key: "with", label: "Has Cases", count: coverage.withCases, tone: "green" },
    { key: "without", label: "No Cases", count: coverage.withoutCases, tone: "amber" },
  ];
  return (
    <div className="mb-3 flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          /* Pressing the one already chosen clears it, so the filter needs no
             third button to undo itself. */
          onClick={() => onChange(value === option.key ? "all" : option.key)}
          aria-pressed={value === option.key}
          className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition-colors ${
            value === option.key
              ? "border-brand text-foreground"
              : "border-border text-muted hover:text-foreground"
          }`}
        >
          <span className={`size-2 rounded-xs ${toneBarClass(option.tone)}`} />
          {option.label}
          <span className="font-semibold tabular-nums text-foreground">{option.count}</span>
        </button>
      ))}
    </div>
  );
}

const cellClass = "border-b border-border/60 px-2 py-1.5 text-center text-sm tabular-nums";

/** The question does not apply at this level — never a zero, which would be
 *  an answer. */
function Dash() {
  return <span className="text-muted">—</span>;
}

function TreeRow({ row }: { row: HierarchyRow }) {
  const results = row.results;
  const isCase = row.level === "Test Case";

  return (
    <tr
      className="hover:bg-black/[.02] dark:hover:bg-white/[.04]"
      /* Skipped and blocked have no column here, so three figures out of five
         results will not add up to Test Cases. The row says where the rest
         went rather than leaving a reader to find the gap. */
      title={results && results.other > 0 ? `${results.other} skipped or blocked` : undefined}
    >
      <td className="border-b border-border/60 py-1.5 pr-3">
        <div className="flex items-center gap-2" style={{ paddingLeft: row.depth * 18 }}>
          {row.onToggle ? (
            <button
              type="button"
              onClick={row.onToggle}
              className="flex size-5 shrink-0 items-center justify-center rounded text-muted hover:text-foreground"
              aria-label={row.expanded ? "Collapse" : "Expand"}
              aria-expanded={row.expanded}
            >
              <ChevronRightIcon
                className={`size-3.5 transition-transform ${row.expanded ? "rotate-90" : ""}`}
              />
            </button>
          ) : (
            <span className="size-5 shrink-0" />
          )}
          <Badge tone={row.tone}>{row.level}</Badge>
          {row.onPreview ? (
            <button
              type="button"
              onClick={row.onPreview}
              className={`min-w-0 truncate text-left text-sm text-foreground hover:text-brand hover:underline ${
                row.bold ? "font-medium" : ""
              }`}
            >
              {row.label}
            </button>
          ) : (
            <span className={`min-w-0 truncate text-sm ${row.bold ? "font-medium" : ""}`}>
              {row.label}
            </span>
          )}
          {/* Outline, not a filled tone: every filled one already means a
              state, and a Feature is only a name. */}
          {row.feature && (
            <span className="shrink-0">
              <Badge tone="gray" variant="outline">
                {row.feature}
              </Badge>
            </span>
          )}
        </div>
      </td>

      <td className={cellClass}>{row.requirements ?? <Dash />}</td>

      {/* A skipped or blocked case has no column of its own, so it shows here
          — the one column that means only that this row exists. */}
      <td className={cellClass}>
        {isCase ? (
          row.result === "SKIPPED" || row.result === "BLOCKED" ? (
            <Badge tone={testResultTone(row.result)}>{TEST_RESULT_LABELS[row.result]}</Badge>
          ) : (
            <Dash />
          )
        ) : (
          (results?.total ?? 0)
        )}
      </td>

      <td className={cellClass}>
        {row.coverage ? (
          "share" in row.coverage ? (
            <Badge tone={shareTone(row.coverage.share)}>{row.coverage.share.toFixed(1)}%</Badge>
          ) : (
            <Badge tone={row.coverage.hasCases ? "green" : "amber"}>
              {row.coverage.hasCases ? "Has Cases" : "No Cases"}
            </Badge>
          )
        ) : (
          <Dash />
        )}
      </td>

      <td className={cellClass}>
        {isCase ? (
          row.result === "PASSED" ? (
            <Badge tone="green">Passed</Badge>
          ) : (
            <Dash />
          )
        ) : (
          <span className="font-medium text-emerald-600 dark:text-emerald-400">
            {results?.passed ?? 0}
          </span>
        )}
      </td>

      {/* A badge either way: the eye runs down this column for the rows that
          are not zero, and a bare 0 beside a badge breaks that shape. */}
      <td className={cellClass}>
        {isCase ? (
          row.result === "FAILED" ? (
            <Badge tone="red">Failed</Badge>
          ) : (
            <Dash />
          )
        ) : (
          <Badge tone={(results?.failed ?? 0) > 0 ? "red" : "gray"}>{results?.failed ?? 0}</Badge>
        )}
      </td>

      <td className={cellClass}>
        {isCase ? (
          row.result === "NOT_RUN" ? (
            <Badge tone="gray">Not run</Badge>
          ) : (
            <Dash />
          )
        ) : (
          <Badge tone="gray">{results?.notRun ?? 0}</Badge>
        )}
      </td>

      <td className="border-b border-border/60 px-2 py-1.5">
        {results && results.total > 0 ? (
          <ExecutionBar done={results.recorded} total={results.total} />
        ) : (
          <div className="text-center">
            <Dash />
          </div>
        )}
      </td>
    </tr>
  );
}

/** Green only at the whole of it; amber from half; red below. Three steps are
 *  what a column read at a glance can carry. */
function shareTone(share: number): Tone {
  if (share >= 100) return "green";
  return share >= 50 ? "amber" : "red";
}

/**
 * How much of the testing has been done, not how much of it passed — the same
 * sum the Overview card calls Test Progress. Indigo rather than green for
 * exactly that reason: the Passed and Failed columns beside it say whether it
 * went well, and a green bar here would answer their question wrongly.
 */
function ExecutionBar({ done, total }: { done: number; total: number }) {
  const percent = (done / total) * 100;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 min-w-16 flex-1 overflow-hidden rounded-full bg-black/[.06] dark:bg-white/[.08]">
        <div className="h-1.5 rounded-full bg-brand" style={{ width: `${percent}%` }} />
      </div>
      <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted">
        {Math.round(percent)}%
      </span>
    </div>
  );
}

const PREVIEW_ENDPOINT: Record<PreviewType, string> = {
  scenario: "/api/scenarios",
  testGroup: "/api/test-groups",
  testCase: "/api/test-cases",
};

const PREVIEW_LABEL: Record<PreviewType, string> = {
  scenario: "Scenario",
  testGroup: "Test Group",
  testCase: "Test Case",
};

const PREVIEW_TONE: Record<PreviewType, Tone> = {
  scenario: "blue",
  testGroup: "purple",
  testCase: "gray",
};

function PreviewModal({ target, onClose }: { target: PreviewTarget | null; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const backdrop = useBackdropDismiss(onClose);

  useEffect(() => {
    if (target) {
      dialogRef.current?.showModal();
    } else {
      dialogRef.current?.close();
    }
  }, [target]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      // Nothing here is edited — it shows a record and offers a link to it —
      // so a click beside it means "done looking".
      {...backdrop}
      className={`${dialogClass} max-w-2xl`}
    >
      {target && (
        <div className="max-h-[85vh] overflow-y-auto p-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-2">
              <Badge tone={PREVIEW_TONE[target.type]}>{PREVIEW_LABEL[target.type]}</Badge>
              <h2 className="truncate text-lg font-semibold text-foreground">{target.name}</h2>
            </div>
            <IconButton type="button" onClick={onClose} aria-label="Close" title="Close">
              <ClearIcon />
            </IconButton>
          </div>

          {/* Keyed on the target's id: a fresh instance per distinct target means
              its data/loading/error state always starts correct for THIS target,
              with no "reset stale state from the previous target" effect needed. */}
          <PreviewContent key={target.id} target={target} />

          <div className="mt-6 flex items-center gap-2">
            <LinkButton href={target.href} variant="primary">
              View full page
            </LinkButton>
            <Button type="button" variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      )}
    </dialog>
  );
}

function PreviewContent({ target }: { target: PreviewTarget }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${PREVIEW_ENDPOINT[target.type]}/${target.id}`)
      .then((response) => {
        if (!response.ok) {
          throw new Error("Failed to load preview");
        }
        return response.json();
      })
      .then((body) => setData(body))
      .catch(() => setError("Failed to load preview"))
      .finally(() => setLoading(false));
  }, [target]);

  if (loading) {
    return <p className="text-sm text-muted">Loading…</p>;
  }
  if (error) {
    return (
      <p role="alert" className="text-sm text-red-600 dark:text-red-400">
        {error}
      </p>
    );
  }
  if (!data) {
    return null;
  }
  return <PreviewBody target={target} data={data} />;
}

function PreviewBody({ target, data }: { target: PreviewTarget; data: Record<string, unknown> }) {
  if (target.type === "scenario") {
    const d = data as {
      description: string | null;
      preconditions: string | null;
      expectedResult: string;
      priority: string;
      status: string;
      tags: string[];
    };
    return (
      <div className="flex flex-col gap-3 text-sm">
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={priorityTone(d.priority)}>{d.priority}</Badge>
          <Badge tone={workflowStatusTone(d.status)}>{d.status.replace(/_/g, " ")}</Badge>
        </div>
        <PreviewField label="Description" value={d.description} />
        <PreviewField label="Preconditions" value={d.preconditions} />
        <PreviewField label="Expected Result" value={d.expectedResult} />
        {d.tags.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Tags</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {d.tags.map((tag) => (
                <Badge key={tag} tone="blue">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (target.type === "testGroup") {
    const d = data as { description: string | null; testObjective: string | null; status: string };
    return (
      <div className="flex flex-col gap-3 text-sm">
        <Badge tone={workflowStatusTone(d.status)}>{d.status.replace(/_/g, " ")}</Badge>
        <PreviewField label="Objective" value={d.testObjective} />
        <PreviewField label="Description" value={d.description} />
      </div>
    );
  }

  const d = data as {
    preconditions: string | null;
    testData: string | null;
    expectedResult: string;
    priority: string;
    status: string;
    testResult: string;
    assigneeId: string | null;
    steps: { id: string; step: string; expectedResult: string }[];
  };
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex flex-wrap gap-1.5">
        <Badge tone={priorityTone(d.priority)}>{d.priority}</Badge>
        <Badge tone={workflowStatusTone(d.status)}>{d.status.replace(/_/g, " ")}</Badge>
        <Badge tone={testResultTone(d.testResult)}>{d.testResult.replace(/_/g, " ")}</Badge>
      </div>
      {ASSIGNEE_ENABLED && (
        <PreviewField label="Assignee" value={target.assigneeName ?? d.assigneeId} />
      )}
      <PreviewField label="Preconditions" value={d.preconditions} />
      <PreviewField label="Test Data" value={d.testData} />
      <PreviewField label="Expected Result" value={d.expectedResult} />
      {d.steps.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Test Steps</p>
          <ol className="mt-1 flex flex-col gap-2 pl-5 list-decimal">
            {d.steps.map((step) => (
              <li key={step.id}>
                <p className="text-foreground">{step.step}</p>
                <p className="text-xs text-muted">Expected: {step.expectedResult}</p>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function PreviewField({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) {
    return null;
  }
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-0.5 whitespace-pre-wrap text-foreground">{value}</p>
    </div>
  );
}
