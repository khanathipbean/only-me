"use client";

import { useState } from "react";

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

type Summary = { succeededCount: number; failedCount: number; skippedCount: number };

const EDITABLE_FIELDS: { key: string; label: string }[] = [
  { key: "scenarioName", label: "Scenario Name" },
  { key: "testGroupName", label: "Test Group Name" },
  { key: "testCaseName", label: "Test Case Name" },
  { key: "preconditions", label: "Preconditions" },
  { key: "testSteps", label: "Test Steps" },
  { key: "expectedResult", label: "Expected Result" },
  { key: "priority", label: "Priority" },
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
          duplicateResolution: row.duplicate ? "skip" : undefined,
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
      const body = await response.json();
      if (!response.ok) {
        setError(
          body.rowNumber
            ? `Row ${body.rowNumber}: ${body.error}`
            : (body.error ?? "Import failed"),
        );
        return;
      }
      setSummary(body as Summary);
    } finally {
      setLoading(false);
    }
  }

  if (summary) {
    return (
      <div>
        <h2>Import Summary</h2>
        <p>Succeeded: {summary.succeededCount}</p>
        <p>Failed: {summary.failedCount}</p>
        <p>Skipped: {summary.skippedCount}</p>
      </div>
    );
  }

  return (
    <div>
      <input
        type="file"
        accept=".csv,.xlsx"
        onChange={(event) => setFile(event.target.files?.[0] ?? null)}
      />
      <button type="button" onClick={handlePreview} disabled={!file || loading}>
        Preview
      </button>
      {error && <p role="alert">{error}</p>}

      {preview && (
        <>
          <p>
            Total: {preview.summary.total}, Valid: {preview.summary.valid}, Invalid:{" "}
            {preview.summary.invalid}, Duplicates: {preview.summary.duplicates}
          </p>

          {preview.summary.duplicates > 0 && (
            <div>
              Apply to all duplicates:{" "}
              <button type="button" onClick={() => applyToAllDuplicates("skip")}>
                Skip all
              </button>
              <button type="button" onClick={() => applyToAllDuplicates("update")}>
                Update all
              </button>
              <button type="button" onClick={() => applyToAllDuplicates("create_new")}>
                Create new for all
              </button>
            </div>
          )}

          {preview.rows.map((row) => {
            const data = rowData[row.rowNumber] ?? row.data;
            return (
              <fieldset key={row.rowNumber}>
                <legend>
                  Row {row.rowNumber}
                  {row.valid && row.duplicate && " — Duplicate"}
                  {row.valid && !row.duplicate && " — New"}
                  {!row.valid && " — Invalid (fix below or skip)"}
                </legend>

                {row.errors.length > 0 && (
                  <ul>
                    {row.errors.map((rowError, index) => (
                      <li key={index}>
                        {rowError.field}: {rowError.reason}
                      </li>
                    ))}
                  </ul>
                )}

                {EDITABLE_FIELDS.map(({ key, label }) => (
                  <label key={key}>
                    {label}
                    <input
                      value={data[key] ?? ""}
                      onChange={(event) => updateRowField(row.rowNumber, key, event.target.value)}
                    />
                  </label>
                ))}

                {row.duplicate ? (
                  <label>
                    Duplicate resolution
                    <select
                      value={rowChoices[row.rowNumber]?.duplicateResolution ?? "skip"}
                      onChange={(event) =>
                        setRowChoices((prev) => ({
                          ...prev,
                          [row.rowNumber]: {
                            ...prev[row.rowNumber],
                            duplicateResolution: event.target
                              .value as RowChoice["duplicateResolution"],
                          },
                        }))
                      }
                    >
                      <option value="skip">Skip</option>
                      <option value="update">Update</option>
                      <option value="create_new">Create as New</option>
                    </select>
                  </label>
                ) : (
                  <label>
                    <input
                      type="checkbox"
                      checked={rowChoices[row.rowNumber]?.skip ?? false}
                      onChange={(event) =>
                        setRowChoices((prev) => ({
                          ...prev,
                          [row.rowNumber]: { ...prev[row.rowNumber], skip: event.target.checked },
                        }))
                      }
                    />
                    Skip this row
                  </label>
                )}
              </fieldset>
            );
          })}

          <button type="button" onClick={handleConfirm} disabled={loading}>
            Confirm Import
          </button>
        </>
      )}
    </div>
  );
}
