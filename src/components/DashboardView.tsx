"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PRIORITY_VALUES, TEST_RESULT_VALUES, WORKFLOW_STATUS_VALUES } from "@/lib/enums";

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

type TreeTestCase = {
  id: string;
  name: string;
  testResult: string;
  priority: string;
  assigneeName: string | null;
};

type TreeTestGroup = { id: string; name: string; testCaseCount: number; testCases: TreeTestCase[] };
type TreeScenario = { id: string; name: string; testCaseCount: number; testGroups: TreeTestGroup[] };

type DashboardData = {
  hasAnyData: boolean;
  counts: { scenarios: number; testGroups: number; testCases: number };
  testCasesByResult: Record<string, number>;
  testCasesByPriority: Record<string, number>;
  testCasesByAssignee: Array<{ assigneeId: string | null; assigneeName: string; count: number }>;
  testProgress: number;
  tree: TreeScenario[];
};

type Filters = {
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
  scenarioId: "Scenario ID",
  testGroupId: "Test Group ID",
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

  // Deliberately Promise-chained rather than async/await: the react-hooks
  // "no setState in effect" lint treats an awaited call as still executing
  // synchronously inside the effect body, and flags every setState call
  // that follows regardless of the `await`. Nesting them inside .then()/
  // .catch()/.finally() callbacks instead keeps them out of the effect's
  // own synchronous body.
  const fetchDashboard = useCallback(() => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value) {
        params.set(key, value);
      }
    }
    fetch(`/api/projects/${projectId}/dashboard?${params.toString()}`)
      .then((response) => {
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
  }, [projectId, filters]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  function updateFilter(key: keyof Filters, value: string) {
    setLoading(true);
    setFilters((prev) => ({ ...prev, [key]: value }));
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

  const activeFilters = Object.entries(filters).filter(([, value]) => value);

  return (
    <div>
      <h2>Filters</h2>
      <form onSubmit={(event) => event.preventDefault()}>
        <input
          placeholder="Scenario ID"
          value={filters.scenarioId}
          onChange={(event) => updateFilter("scenarioId", event.target.value)}
        />
        <input
          placeholder="Test Group ID"
          value={filters.testGroupId}
          onChange={(event) => updateFilter("testGroupId", event.target.value)}
        />
        <select
          aria-label="Test Result"
          value={filters.testResult}
          onChange={(event) => updateFilter("testResult", event.target.value)}
        >
          <option value="">All Test Results</option>
          {TEST_RESULT_VALUES.map((value) => (
            <option key={value} value={value}>
              {TEST_RESULT_LABELS[value]}
            </option>
          ))}
        </select>
        <select
          aria-label="Priority"
          value={filters.priority}
          onChange={(event) => updateFilter("priority", event.target.value)}
        >
          <option value="">All Priorities</option>
          {PRIORITY_VALUES.map((value) => (
            <option key={value} value={value}>
              {PRIORITY_LABELS[value]}
            </option>
          ))}
        </select>
        <select
          aria-label="Status"
          value={filters.status}
          onChange={(event) => updateFilter("status", event.target.value)}
        >
          <option value="">All Statuses</option>
          {WORKFLOW_STATUS_VALUES.map((value) => (
            <option key={value} value={value}>
              {STATUS_LABELS[value]}
            </option>
          ))}
        </select>
        <input
          placeholder="Assignee User ID"
          value={filters.assigneeId}
          onChange={(event) => updateFilter("assigneeId", event.target.value)}
        />
        <input
          placeholder="Tags (comma-separated)"
          value={filters.tags}
          onChange={(event) => updateFilter("tags", event.target.value)}
        />
        <label>
          Created From
          <input
            type="date"
            value={filters.createdFrom}
            onChange={(event) => updateFilter("createdFrom", event.target.value)}
          />
        </label>
        <label>
          Created To
          <input
            type="date"
            value={filters.createdTo}
            onChange={(event) => updateFilter("createdTo", event.target.value)}
          />
        </label>
        <label>
          Updated From
          <input
            type="date"
            value={filters.updatedFrom}
            onChange={(event) => updateFilter("updatedFrom", event.target.value)}
          />
        </label>
        <label>
          Updated To
          <input
            type="date"
            value={filters.updatedTo}
            onChange={(event) => updateFilter("updatedTo", event.target.value)}
          />
        </label>
        <button type="button" onClick={clearAllFilters}>
          Clear all filters
        </button>
      </form>

      {activeFilters.length > 0 && (
        <p>
          Active filters:{" "}
          {activeFilters
            .map(([key, value]) => `${FILTER_LABELS[key as keyof Filters]}=${value}`)
            .join(", ")}
        </p>
      )}

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
      />
    </div>
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
      <section aria-label="Overview">
        <h2>Overview</h2>
        <p>Loading…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section aria-label="Overview">
        <h2>Overview</h2>
        <p role="alert">{error}</p>
        <button type="button" onClick={onRetry}>
          Retry
        </button>
      </section>
    );
  }

  if (!data) {
    return null;
  }

  if (!data.hasAnyData) {
    return (
      <section aria-label="Overview">
        <h2>Overview</h2>
        <p>This project has no Scenarios yet.</p>
        <Link href={`/projects/${projectId}/scenarios/new`}>Create a Scenario</Link>{" "}
        <Link href={`/projects/${projectId}/import`}>Import Data</Link>
      </section>
    );
  }

  if (data.counts.testCases === 0) {
    return (
      <section aria-label="Overview">
        <h2>Overview</h2>
        <p>No results match the current filters.</p>
      </section>
    );
  }

  return (
    <section aria-label="Overview">
      <h2>Overview</h2>
      <p>Scenarios: {data.counts.scenarios}</p>
      <p>Test Groups: {data.counts.testGroups}</p>
      <p>Test Cases: {data.counts.testCases}</p>
      <p>Test Progress: {data.testProgress.toFixed(1)}%</p>

      <h3>By Test Result</h3>
      <ul>
        {Object.entries(data.testCasesByResult).map(([result, count]) => (
          <li key={result}>
            <button type="button" onClick={() => onDrillDown("testResult", result)}>
              {result}: {count}
            </button>
          </li>
        ))}
      </ul>

      <h3>By Priority</h3>
      <ul>
        {Object.entries(data.testCasesByPriority).map(([priority, count]) => (
          <li key={priority}>
            <button type="button" onClick={() => onDrillDown("priority", priority)}>
              {priority}: {count}
            </button>
          </li>
        ))}
      </ul>

      <h3>By Assignee</h3>
      <ul>
        {data.testCasesByAssignee.map((entry) => (
          <li key={entry.assigneeId ?? "unassigned"}>
            {entry.assigneeId ? (
              <button type="button" onClick={() => onDrillDown("assigneeId", entry.assigneeId!)}>
                {entry.assigneeName}: {entry.count}
              </button>
            ) : (
              <span>
                {entry.assigneeName}: {entry.count}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
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
}: {
  loading: boolean;
  error: string | null;
  data: DashboardData | null;
  onRetry: () => void;
  projectId: string;
  expanded: Set<string>;
  onToggle: (id: string) => void;
}) {
  if (loading) {
    return (
      <section aria-label="Hierarchy">
        <h2>Hierarchy</h2>
        <p>Loading…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section aria-label="Hierarchy">
        <h2>Hierarchy</h2>
        <p role="alert">{error}</p>
        <button type="button" onClick={onRetry}>
          Retry
        </button>
      </section>
    );
  }

  if (!data) {
    return null;
  }

  if (!data.hasAnyData) {
    return (
      <section aria-label="Hierarchy">
        <h2>Hierarchy</h2>
        <p>This project has no Scenarios yet.</p>
        <Link href={`/projects/${projectId}/scenarios/new`}>Create a Scenario</Link>
      </section>
    );
  }

  if (data.tree.length === 0) {
    return (
      <section aria-label="Hierarchy">
        <h2>Hierarchy</h2>
        <p>No results match the current filters.</p>
      </section>
    );
  }

  return (
    <section aria-label="Hierarchy">
      <h2>Hierarchy</h2>
      <ul>
        {data.tree.map((scenario) => (
          <li key={scenario.id}>
            <button type="button" onClick={() => onToggle(scenario.id)}>
              {expanded.has(scenario.id) ? "▾" : "▸"}
            </button>{" "}
            <Link href={`/projects/${projectId}/scenarios/${scenario.id}`}>{scenario.name}</Link> (
            {scenario.testCaseCount})
            {expanded.has(scenario.id) && (
              <ul>
                {scenario.testGroups.map((group) => (
                  <li key={group.id}>
                    <button type="button" onClick={() => onToggle(group.id)}>
                      {expanded.has(group.id) ? "▾" : "▸"}
                    </button>{" "}
                    <Link href={`/projects/${projectId}/scenarios/${scenario.id}/test-groups/${group.id}`}>
                      {group.name}
                    </Link>{" "}
                    ({group.testCaseCount})
                    {expanded.has(group.id) && (
                      <ul>
                        {group.testCases.map((testCase) => (
                          <li key={testCase.id}>
                            <Link
                              href={`/projects/${projectId}/scenarios/${scenario.id}/test-groups/${group.id}/test-cases/${testCase.id}`}
                            >
                              {testCase.name}
                            </Link>{" "}
                            [{testCase.testResult}]
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
    </section>
  );
}
