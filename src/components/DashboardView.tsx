"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { PRIORITY_VALUES, TEST_RESULT_VALUES, WORKFLOW_STATUS_VALUES } from "@/lib/enums";
import { dialogClass, inputClass, labelClass } from "@/lib/ui";
import { Select } from "@/components/ui/Select";
import { testCaseHref, testCasesListHref, testGroupsListHref } from "@/lib/hrefs";
import { Card } from "@/components/ui/Card";
import {
  Badge,
  type Tone,
  priorityTone,
  testResultTone,
  toneBarClass,
  workflowStatusTone,
} from "@/components/ui/Badge";
import { Button, IconButton, LinkButton } from "@/components/ui/Button";
import { ChevronRightIcon, ClearIcon, FilterOffIcon } from "@/components/icons";

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

type TreeTestGroup = { id: string; name: string; testCaseCount: number; testCases: TreeTestCase[] };
type TreeScenario = {
  id: string;
  name: string;
  /** Its ancestors, so a tree row can link into the nested URL. */
  moduleId: string;
  requirementId: string;
  testCaseCount: number;
  testGroups: TreeTestGroup[];
};

type TreeRequirement = {
  id: string;
  name: string;
  code: string | null;
  testCaseCount: number;
  scenarios: TreeScenario[];
};

type TreeModule = {
  id: string;
  name: string;
  testCaseCount: number;
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
  tree: TreeModule[];
  options: {
    modules: Array<{ id: string; name: string }>;
    requirements: Array<{ id: string; name: string; moduleId: string }>;
    scenarios: Array<{ id: string; name: string; requirementId: string }>;
    testGroups: Array<{ id: string; name: string; scenarioId: string }>;
  };
};

type Filters = {
  moduleId: string;
  requirementId: string;
  scenarioId: string;
  testGroupId: string;
  testResult: string;
  priority: string;
  status: string;
  assigneeId: string;
  tags: string;
  createdFrom: string;
  createdTo: string;
  updatedFrom: string;
  updatedTo: string;
};

const EMPTY_FILTERS: Filters = {
  moduleId: "",
  requirementId: "",
  scenarioId: "",
  testGroupId: "",
  testResult: "",
  priority: "",
  status: "",
  assigneeId: "",
  tags: "",
  createdFrom: "",
  createdTo: "",
  updatedFrom: "",
  updatedTo: "",
};

const FILTER_LABELS: Record<keyof Filters, string> = {
  moduleId: "Module",
  requirementId: "Requirement",
  scenarioId: "Scenario",
  testGroupId: "Test Group",
  testResult: "Test Result",
  priority: "Priority",
  status: "Status",
  assigneeId: "Assignee User ID",
  tags: "Tags",
  createdFrom: "Created From",
  createdTo: "Created To",
  updatedFrom: "Updated From",
  updatedTo: "Updated To",
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
  function updateHierarchyFilter(key: "moduleId" | "requirementId" | "scenarioId", value: string) {
    setLoading(true);
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "moduleId") {
        next.requirementId = "";
      }
      if (key === "moduleId" || key === "requirementId") {
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

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Filters</h2>
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
        </div>
        <form
          onSubmit={(event) => event.preventDefault()}
          className="mt-3 grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          {/* aria-label rather than relying on the wrapping <label>: a label
              can only be programmatically bound to a real form control, not to
              a custom combobox, so the visible text is decorative here. */}
          <label className={labelClass}>
            Module
            <Select
              value={filters.moduleId}
              onChange={(next) => updateHierarchyFilter("moduleId", next)}
              options={toOptions(options?.modules ?? [], "All Modules")}
              ariaLabel="Module"
            />
          </label>
          <label className={labelClass}>
            Requirement
            <Select
              value={filters.requirementId}
              onChange={(next) => updateHierarchyFilter("requirementId", next)}
              options={toOptions(requirementOptions, "All Requirements")}
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
            Assignee User ID
            <input
              value={filters.assigneeId}
              onChange={(event) => updateFilter("assigneeId", event.target.value)}
              className={inputClass}
            />
          </label>

          {showMoreFilters && (
            <>
              <label className={labelClass}>
                Scenario
                <Select
                  value={filters.scenarioId}
                  onChange={(next) => updateHierarchyFilter("scenarioId", next)}
                  options={toOptions(scenarioOptions, "All Scenarios")}
                  ariaLabel="Scenario"
                />
              </label>
              <label className={labelClass}>
                Test Group
                <Select
                  value={filters.testGroupId}
                  onChange={(next) => updateFilter("testGroupId", next)}
                  options={toOptions(testGroupOptions, "All Test Groups")}
                  ariaLabel="Test Group"
                />
              </label>
              <label className={labelClass}>
                Tags (comma-separated)
                <input
                  value={filters.tags}
                  onChange={(event) => updateFilter("tags", event.target.value)}
                  className={inputClass}
                />
              </label>
              <label className={labelClass}>
                Created From
                <input
                  type="date"
                  value={filters.createdFrom}
                  onChange={(event) => updateFilter("createdFrom", event.target.value)}
                  className={inputClass}
                />
              </label>
              <label className={labelClass}>
                Created To
                <input
                  type="date"
                  value={filters.createdTo}
                  onChange={(event) => updateFilter("createdTo", event.target.value)}
                  className={inputClass}
                />
              </label>
              <label className={labelClass}>
                Updated From
                <input
                  type="date"
                  value={filters.updatedFrom}
                  onChange={(event) => updateFilter("updatedFrom", event.target.value)}
                  className={inputClass}
                />
              </label>
              <label className={labelClass}>
                Updated To
                <input
                  type="date"
                  value={filters.updatedTo}
                  onChange={(event) => updateFilter("updatedTo", event.target.value)}
                  className={inputClass}
                />
              </label>
            </>
          )}
        </form>

        <button
          type="button"
          onClick={() => setShowMoreFilters((value) => !value)}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-foreground"
        >
          <ChevronRightIcon
            className={`size-3.5 transition-transform ${showMoreFilters ? "rotate-90" : ""}`}
          />
          {showMoreFilters ? "Fewer filters" : "More filters"}
        </button>

        {activeFilters.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">Active:</span>
            {activeFilters.map(([key, value]) => (
              <Badge key={key} tone="blue">
                {FILTER_LABELS[key as keyof Filters]}: {value}
              </Badge>
            ))}
          </div>
        )}
      </Card>

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

function WidgetShell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Card aria-label={label}>
      <h2 className="text-sm font-semibold text-foreground">{label}</h2>
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
          <LinkButton href={`/projects/${projectId}/import`} variant="secondary">
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
      {/* Six stats: 2 / 3 / 6 per row divides evenly at every width, where
          the old 4-column grid would leave a ragged last row. */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Modules" value={data.counts.modules} />
        <Stat label="Requirements" value={data.counts.requirements} />
        <Stat label="Scenarios" value={data.counts.scenarios} />
        <Stat label="Test Groups" value={data.counts.testGroups} />
        <Stat label="Test Cases" value={data.counts.testCases} />
        <Stat label="Test Progress" value={`${data.testProgress.toFixed(1)}%`} />
      </div>

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
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">By Assignee</h3>
          <ul className="mt-3 flex flex-col gap-2">
            {data.testCasesByAssignee.map((entry) => (
              <li key={entry.assigneeId ?? "unassigned"}>
                <MeterRow
                  label={entry.assigneeName}
                  count={entry.count}
                  total={data.counts.testCases}
                  tone="gray"
                  onClick={entry.assigneeId ? () => onDrillDown("assigneeId", entry.assigneeId!) : undefined}
                />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </WidgetShell>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    // A tinted tile, not bare text on the Card's own surface: six numbers
    // floating with only whitespace between them read as empty rather than
    // a considered group. One step off-surface (not a border) keeps it quiet
    // relative to the Card it sits inside, instead of doubling up on edges.
    <div className="rounded-lg bg-black/[.03] p-4 dark:bg-white/[.04]">
      {/* Proportional figures, not tabular-nums: these sit alone, not in a
          column that needs to align digit-for-digit, and tabular-nums makes
          a standalone number like "5" look loose at display size. */}
      <p className="text-3xl font-semibold text-foreground">{value}</p>
      <p className="mt-0.5 text-xs font-semibold tracking-wide text-muted uppercase">
        {label}
      </p>
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
      <ul className="mt-3 flex flex-col gap-2">
        {entries.map(([key, count]) => (
          <li key={key}>
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
function MeterRow({
  label,
  count,
  total,
  tone,
  onClick,
}: {
  label: string;
  count: number;
  total: number;
  tone: Tone;
  onClick?: () => void;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  const content = (
    <>
      <span className="w-24 shrink-0 truncate text-xs font-medium text-muted capitalize">
        {label.toLowerCase()}
      </span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/[.06] dark:bg-white/[.1]">
        <span
          className={`block h-full rounded-full ${toneBarClass(tone)}`}
          style={{ width: `${Math.max(pct, count > 0 ? 4 : 0)}%` }}
        />
      </span>
      <span className="w-6 shrink-0 text-right text-xs font-semibold tabular-nums text-foreground">
        {count}
      </span>
    </>
  );

  if (!onClick) {
    return (
      <div title={`${label}: ${count} (${pct}%)`} className="flex items-center gap-2.5">
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={`${label}: ${count} (${pct}%)`}
      className="flex w-full items-center gap-2.5 rounded-md py-0.5 text-left hover:bg-black/[.03] dark:hover:bg-white/[.05]"
    >
      {content}
    </button>
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
    <WidgetShell label="Hierarchy">
      <ul className="flex flex-col gap-0.5">
        {data.tree.map((moduleNode) => (
          <li key={moduleNode.id}>
            <TreeRow
              expanded={expanded.has(moduleNode.id)}
              onToggle={() => onToggle(moduleNode.id)}
              label={moduleNode.name}
              count={moduleNode.testCaseCount}
              level="Module"
              levelTone="indigo"
              bold
            />
            {expanded.has(moduleNode.id) && (
              <ul className="ml-2.5 flex flex-col gap-0.5 border-l border-border pl-4">
                {moduleNode.requirements.map((requirement) => (
                  <li key={requirement.id}>
                    <TreeRow
                      expanded={expanded.has(requirement.id)}
                      onToggle={() => onToggle(requirement.id)}
                      label={
                        requirement.code
                          ? `${requirement.code} — ${requirement.name}`
                          : requirement.name
                      }
                      count={requirement.testCaseCount}
                      level="Requirement"
                      levelTone="cyan"
                      bold
                    />
                    {expanded.has(requirement.id) && (
                      <ul className="ml-2.5 flex flex-col gap-0.5 border-l border-border pl-4">
                        {requirement.scenarios.map((scenario) => (
                          <li key={scenario.id}>
            <TreeRow
              expanded={expanded.has(scenario.id)}
              onToggle={() => onToggle(scenario.id)}
              onPreview={() =>
                onPreview({
                  type: "scenario",
                  id: scenario.id,
                  href: testGroupsListHref(idsOf(projectId, scenario)),
                  name: scenario.name,
                })
              }
              label={scenario.name}
              count={scenario.testCaseCount}
              level="Scenario"
              levelTone="blue"
              bold
            />
            {expanded.has(scenario.id) && (
              <ul className="ml-2.5 flex flex-col gap-0.5 border-l border-border pl-4">
                {scenario.testGroups.map((group) => (
                  <li key={group.id}>
                    <TreeRow
                      expanded={expanded.has(group.id)}
                      onToggle={() => onToggle(group.id)}
                      onPreview={() =>
                        onPreview({
                          type: "testGroup",
                          id: group.id,
                          href: testCasesListHref({ ...idsOf(projectId, scenario), testGroupId: group.id }),
                          name: group.name,
                        })
                      }
                      label={group.name}
                      count={group.testCaseCount}
                      level="Test Group"
                      levelTone="purple"
                    />
                    {expanded.has(group.id) && (
                      <ul className="ml-2.5 flex flex-col gap-0.5 border-l border-border pl-4">
                        {group.testCases.map((testCase) => (
                          <li key={testCase.id}>
                            <button
                              type="button"
                              onClick={() =>
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
                                })
                              }
                              className="flex w-full items-center gap-2 rounded-md py-1.5 pr-2 pl-[26px] text-left text-sm text-foreground hover:bg-black/[.03] hover:text-brand hover:underline dark:hover:bg-white/[.05]"
                            >
                              <Badge tone="gray">Test Case</Badge>
                              <span className="min-w-0 flex-1 truncate">{testCase.name}</span>
                              <Badge tone={testResultTone(testCase.testResult)}>
                                {testCase.testResult.replace(/_/g, " ")}
                              </Badge>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </WidgetShell>
  );
}

function TreeRow({
  expanded,
  onToggle,
  onPreview,
  label,
  count,
  level,
  levelTone,
  bold = false,
}: {
  expanded: boolean;
  onToggle: () => void;
  /** Omitted for the two levels with no record of their own to show, where
   *  clicking the name expands the row instead. */
  onPreview?: () => void;
  label: string;
  count: number;
  level: string;
  levelTone: Tone;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md py-1.5 pr-2 text-sm hover:bg-black/[.03] dark:hover:bg-white/[.05]">
      <button
        type="button"
        onClick={onToggle}
        className="flex size-5 shrink-0 items-center justify-center rounded text-muted hover:text-foreground"
        aria-label={expanded ? "Collapse" : "Expand"}
      >
        <ChevronRightIcon className={`size-3.5 transition-transform ${expanded ? "rotate-90" : ""}`} />
      </button>
      <Badge tone={levelTone}>{level}</Badge>
      <button
        type="button"
        onClick={onPreview ?? onToggle}
        className={`min-w-0 flex-1 truncate text-left text-foreground hover:text-brand hover:underline ${bold ? "font-medium" : ""}`}
      >
        {label}
      </button>
      <Badge tone="gray">{count}</Badge>
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

/**
 * A single shared, externally-controlled dialog — opened by clicking any
 * Scenario/Test Group/Test Case name in the Hierarchy tree, rather than each
 * row navigating immediately. Fetches the item's full record on open (the
 * tree API only carries name+count, not enough for a useful preview) from
 * the same GET routes the standalone detail pages already use.
 */
function PreviewModal({ target, onClose }: { target: PreviewTarget | null; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

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
      <PreviewField label="Assignee" value={target.assigneeName ?? d.assigneeId} />
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
