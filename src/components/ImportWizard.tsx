"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { checkboxClass, inputClass, textareaClass } from "@/lib/ui";
import { Select } from "@/components/ui/Select";

type PreviewRow = {
  rowNumber: number;
  data: Record<string, string>;
  errors: { field: string; reason: string }[];
  valid: boolean;
  duplicate: boolean;
  existingTestCaseId?: string;
};

type Preview = {
  rows: PreviewRow[];
  summary: { total: number; valid: number; invalid: number; duplicates: number };
};

type RowChoice = { skip: boolean; duplicateResolution?: "skip" | "update" | "create_new" };

const DUPLICATE_RESOLUTION_OPTIONS = [
  { value: "skip", label: "Skip" },
  { value: "update", label: "Update" },
  { value: "create_new", label: "Create as New" },
];

type Summary = { succeededCount: number; failedCount: number; skippedCount: number };

type ImportField = {
  key: string;
  label: string;
  /** Rendered as a `<textarea>`: a single-line input can't display embedded
   * line breaks at all, so a numbered Test Steps list showed as one run-on
   * line even though the value itself contains newlines. */
  multiline?: boolean;
};

/**
 * Grouped by the level each field belongs to (Scenario → Test Group → Test
 * Case, mirroring the hierarchy the import builds) instead of one flat grid.
 * The flat grid put all three levels side by side — "Scenario Name | Test
 * Group Name | Test Case Name" on one line — so no field read as belonging
 * to anything, and odd field counts left dangling empty cells.
 *
 * Every group is a plain 2-column grid so each row fills completely; the one
 * long field spans both columns.
 */
const FIELD_GROUPS: { title: string; note?: string; fields: ImportField[] }[] = [
  {
    title: "Scenario",
    note: "Name is matched against existing Scenarios — the rest apply only when this row creates a new one.",
    fields: [
      { key: "scenarioName", label: "Name" },
      { key: "scenarioDescription", label: "Description" },
      { key: "scenarioPreconditions", label: "Preconditions" },
      { key: "scenarioExpectedResult", label: "Expected Result" },
    ],
  },
  {
    title: "Test Group",
    note: "Name is matched against existing Test Groups — the Objective applies only when this row creates a new one.",
    fields: [
      { key: "testGroupName", label: "Name" },
      { key: "testGroupObjective", label: "Objective" },
    ],
  },
  {
    title: "Test Case",
    fields: [
      { key: "testCaseName", label: "Name" },
      { key: "priority", label: "Priority" },
      { key: "preconditions", label: "Preconditions" },
      { key: "expectedResult", label: "Expected Result" },
      { key: "testSteps", label: "Test Steps", multiline: true },
    ],
  },
];

export function ImportWizard({ projectId }: { projectId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [rowChoices, setRowChoices] = useState<Record<number, RowChoice>>({});
  const [rowData, setRowData] = useState<Record<number, Record<string, string>>>({});
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handlePreview() {
    if (!file) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`/api/projects/${projectId}/import/validate`, {
        method: "POST",
        body: formData,
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "Validation failed");
        return;
      }
      setPreview(body as Preview);
      const initialChoices: Record<number, RowChoice> = {};
      const initialData: Record<number, Record<string, string>> = {};
      for (const row of (body as Preview).rows) {
        initialChoices[row.rowNumber] = {
          skip: !row.valid,
          // Defaults to updating the matched Test Case rather than skipping it —
          // "create if the name is new, update if it already exists" is exactly
          // how Scenario/Test Group containers already behave automatically
          // (found-or-created by name, no choice needed); this makes Test Case
          // rows behave the same way by default, without an extra click.
          duplicateResolution: row.duplicate ? "update" : undefined,
        };
        initialData[row.rowNumber] = { ...row.data };
      }
      setRowChoices(initialChoices);
      setRowData(initialData);
    } finally {
      setLoading(false);
    }
  }

  function applyToAllDuplicates(resolution: "skip" | "update" | "create_new") {
    setRowChoices((prev) => {
      const next = { ...prev };
      for (const row of preview?.rows ?? []) {
        if (row.duplicate) {
          next[row.rowNumber] = { ...next[row.rowNumber], duplicateResolution: resolution };
        }
      }
      return next;
    });
  }

  function updateRowField(rowNumber: number, field: string, value: string) {
    setRowData((prev) => ({
      ...prev,
      [rowNumber]: { ...prev[rowNumber], [field]: value },
    }));
  }

  async function handleConfirm() {
    if (!preview) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Every row's *current* (possibly edited) data is sent; the server
      // re-validates each one at confirm time regardless of this preview's
      // stale `valid` flag, and rejects the whole batch atomically if a row
      // still fails and wasn't marked skip.
      const rows = preview.rows.map((row) => ({
        rowNumber: row.rowNumber,
        data: rowData[row.rowNumber] ?? row.data,
        skip: rowChoices[row.rowNumber]?.skip ?? false,
        duplicateResolution: rowChoices[row.rowNumber]?.duplicateResolution,
      }));

      const response = await fetch(`/api/projects/${projectId}/import/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rows }),
      });

      // Read as text first: an unhandled server error (a 500) comes back with
      // an empty or non-JSON body, and calling response.json() on that throws
      // — which previously escaped this function entirely (there was no catch),
      // leaving the user with no summary, no error, and no idea the import had
      // failed.
      const raw = await response.text();
      let body: { error?: string; rowNumber?: number } & Partial<Summary> = {};
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        body = {};
      }

      if (!response.ok) {
        setError(
          body.rowNumber
            ? `Row ${body.rowNumber}: ${body.error}`
            : (body.error ?? `Import failed (server responded ${response.status}).`),
        );
        return;
      }
      setSummary(body as Summary);
    } catch (err) {
      setError(err instanceof Error ? `Import failed: ${err.message}` : "Import failed.");
    } finally {
      setLoading(false);
    }
  }

  if (summary) {
    return (
      <Card>
        <h2 className="text-lg font-semibold text-foreground">Import Summary</h2>
        <div className="mt-4 grid grid-cols-3 gap-4">
          <div>
            <p className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
              {summary.succeededCount}
            </p>
            <p className="text-xs text-muted">Succeeded</p>
          </div>
          <div>
            <p className="text-2xl font-semibold text-red-600 dark:text-red-400">
              {summary.failedCount}
            </p>
            <p className="text-xs text-muted">Failed</p>
          </div>
          <div>
            <p className="text-2xl font-semibold text-muted">{summary.skippedCount}</p>
            <p className="text-xs text-muted">Skipped</p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept=".csv,.xlsx"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-brand file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-brand-hover"
          />
          <Button type="button" onClick={handlePreview} disabled={!file || loading}>
            {loading && !preview ? "Loading…" : "Preview"}
          </Button>
        </div>
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </Card>

      {preview && (
        <>
          <Card>
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <span>
                Total: <strong className="font-semibold text-foreground">{preview.summary.total}</strong>
              </span>
              <span className="text-emerald-600 dark:text-emerald-400">
                Valid: {preview.summary.valid}
              </span>
              <span className="text-red-600 dark:text-red-400">Invalid: {preview.summary.invalid}</span>
              <span className="text-amber-600 dark:text-amber-400">
                Duplicates: {preview.summary.duplicates}
              </span>
            </div>

            {preview.summary.duplicates > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted">Apply to all duplicates:</span>
                <Button type="button" variant="secondary" onClick={() => applyToAllDuplicates("skip")}>
                  Skip all
                </Button>
                <Button type="button" variant="secondary" onClick={() => applyToAllDuplicates("update")}>
                  Update all
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => applyToAllDuplicates("create_new")}
                >
                  Create new for all
                </Button>
              </div>
            )}
          </Card>

          <div className="flex flex-col gap-3">
            {preview.rows.map((row) => {
              const data = rowData[row.rowNumber] ?? row.data;
              return (
                <Card key={row.rowNumber}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">Row {row.rowNumber}</span>
                    {row.valid && row.duplicate && <Badge tone="amber">Duplicate</Badge>}
                    {row.valid && !row.duplicate && <Badge tone="green">New</Badge>}
                    {!row.valid && <Badge tone="red">Invalid — fix below or skip</Badge>}
                  </div>

                  {row.errors.length > 0 && (
                    <ul className="mt-2 list-inside list-disc text-sm text-red-600 dark:text-red-400">
                      {row.errors.map((rowError, index) => (
                        <li key={index}>
                          {rowError.field}: {rowError.reason}
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="mt-4 flex flex-col gap-4">
                    {FIELD_GROUPS.map((group) => (
                      <div key={group.title}>
                        <p className="text-xs font-semibold uppercase tracking-wide text-foreground">
                          {group.title}
                        </p>
                        {group.note && <p className="mt-0.5 text-xs text-muted">{group.note}</p>}
                        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                          {group.fields.map(({ key, label, multiline }) => (
                            <label
                              key={key}
                              className={`flex flex-col gap-1 text-xs font-medium text-muted ${
                                multiline ? "sm:col-span-2" : ""
                              }`}
                            >
                              {label}
                              {multiline ? (
                                <textarea
                                  value={data[key] ?? ""}
                                  onChange={(event) =>
                                    updateRowField(row.rowNumber, key, event.target.value)
                                  }
                                  className={textareaClass}
                                />
                              ) : (
                                <input
                                  value={data[key] ?? ""}
                                  onChange={(event) =>
                                    updateRowField(row.rowNumber, key, event.target.value)
                                  }
                                  className={inputClass}
                                />
                              )}
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3">
                    {row.duplicate ? (
                      <label className="flex flex-col gap-1 text-xs font-medium text-muted sm:max-w-xs">
                        Duplicate resolution
                        <Select
                          value={rowChoices[row.rowNumber]?.duplicateResolution ?? "skip"}
                          onChange={(next) =>
                            setRowChoices((prev) => ({
                              ...prev,
                              [row.rowNumber]: {
                                ...prev[row.rowNumber],
                                duplicateResolution: next as RowChoice["duplicateResolution"],
                              },
                            }))
                          }
                          options={DUPLICATE_RESOLUTION_OPTIONS}
                          ariaLabel={`Duplicate resolution for row ${row.rowNumber}`}
                        />
                      </label>
                    ) : (
                      <label className="flex items-center gap-2 text-sm text-foreground">
                        <input
                          type="checkbox"
                          checked={rowChoices[row.rowNumber]?.skip ?? false}
                          onChange={(event) =>
                            setRowChoices((prev) => ({
                              ...prev,
                              [row.rowNumber]: { ...prev[row.rowNumber], skip: event.target.checked },
                            }))
                          }
                          className={checkboxClass}
                        />
                        Skip this row
                      </label>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>

          <div className="flex flex-col gap-3">
            {/* Repeated next to the button on purpose: the other copy of this
                error sits in the upload card at the very top of the page,
                which is far off-screen once a file's rows are listed — a
                failed confirm looked like nothing had happened at all. */}
            {error && (
              <p
                role="alert"
                className="rounded-md bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-900/40 dark:text-red-300"
              >
                {error}
              </p>
            )}
            <Button
              type="button"
              onClick={handleConfirm}
              disabled={loading}
              className="self-start"
            >
              {loading ? "Importing…" : "Confirm Import"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
