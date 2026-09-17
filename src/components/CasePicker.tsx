"use client";

import { useState } from "react";
import { Badge, priorityTone, testResultTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DialogCloseButton } from "@/components/ui/DialogCloseButton";
import { SubmitButton } from "@/components/SubmitButton";
import { ResultCount } from "@/components/ui/ResultCount";
import { Tooltip } from "@/components/ui/Tooltip";
import { InfoIcon } from "@/components/icons";
import { checkboxClass } from "@/lib/ui";
import type { Priority, TestResult } from "@/generated/prisma/client";

export type CaseCandidate = {
  id: string;
  name: string;
  priority: Priority;
  testResult: TestResult;
  testGroup: { name: string; scenario: { name: string } };
};

/**
 * The list of Test Cases that can be added to a run, with the selection held
 * in state rather than left to the checkboxes alone — Select all and Clear all
 * need something to act on, and the count on the button has to follow what is
 * actually ticked. Reading the DOM instead would leave that number lying the
 * moment anyone unticked a row.
 */
/** Shared by the header and every row so the labels line up with their
 *  columns — a flex row would let each row's own content set the widths. */
const ROW_GRID = "grid grid-cols-[1rem_minmax(0,1fr)_5.5rem_6.5rem] items-center gap-3";

export function CasePicker({
  candidates,
  action,
  hasFilters,
}: {
  candidates: CaseCandidate[];
  action: (formData: FormData) => void;
  hasFilters: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(candidates.map((candidate) => candidate.id)),
  );

  function toggle(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }

  const allSelected = selected.size === candidates.length;

  return (
    <form action={action} className="mt-5 flex flex-col gap-3 border-t border-border pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setSelected(new Set(candidates.map((candidate) => candidate.id)))}
            disabled={allSelected}
          >
            Select all
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setSelected(new Set())}
            disabled={selected.size === 0}
          >
            Clear all
          </Button>
        </div>
        {/* The same count pill every other list uses. What the number means
            is a sentence, not a label, so it lives in a tooltip rather than
            trailing off the end of the row. */}
        <div className="flex items-center gap-2">
          <ResultCount total={candidates.length} />
          <Tooltip
            label={
              hasFilters
                ? "Cases matching these filters that aren't in this run yet. How many are ticked is on the Add button."
                : "Every case in this project that isn't in this run yet. How many are ticked is on the Add button."
            }
          >
            <button
              type="button"
              aria-label="What this count means"
              className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted outline-none transition-colors hover:bg-black/[.05] hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand dark:hover:bg-white/[.08]"
            >
              <InfoIcon className="size-4" />
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="rounded-md border border-border">
        <div className="max-h-80 overflow-y-auto">
          {/* Inside the scroller, not above it: a header outside sits over the
              full width while the rows lose the scrollbar's, so every column
              was off by that much. Sticky keeps it in view all the same. */}
          <div
            className={`${ROW_GRID} sticky top-0 z-10 border-b border-border bg-surface px-3 py-2 text-xs font-semibold tracking-wide text-muted uppercase`}
          >
            <span aria-hidden="true" />
            <span>Test Case</span>
            <span className="text-center">Priority</span>
            <span className="text-center">Last result</span>
          </div>
          {candidates.map((candidate) => (
            <label
              key={candidate.id}
              className={`${ROW_GRID} border-b border-border px-3 py-2 text-sm last:border-b-0`}
            >
              <input
                type="checkbox"
                name="testCaseId"
                value={candidate.id}
                checked={selected.has(candidate.id)}
                onChange={(event) => toggle(candidate.id, event.target.checked)}
                className={checkboxClass}
              />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-foreground">{candidate.name}</span>
                <span className="truncate text-xs text-muted">
                  {candidate.testGroup.scenario.name} › {candidate.testGroup.name}
                </span>
              </span>
              <span className="text-center">
                <Badge tone={priorityTone(candidate.priority)}>{candidate.priority}</Badge>
              </span>
              <span className="text-center">
                <Badge tone={testResultTone(candidate.testResult)}>
                  {candidate.testResult.replace(/_/g, " ")}
                </Badge>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <DialogCloseButton />
        {/* Nothing ticked means nothing to do, so the button says so rather
            than submitting an empty batch. */}
        <SubmitButton pendingLabel="Adding…" disabled={selected.size === 0}>
          {selected.size === 0 ? "Add to run" : `Add ${selected.size} to run`}
        </SubmitButton>
      </div>
    </form>
  );
}
