"use client";

import { useState } from "react";
import { Badge, priorityTone, testResultTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DialogCloseButton } from "@/components/ui/DialogCloseButton";
import { SubmitButton } from "@/components/SubmitButton";
import { checkboxClass, mutedTextClass } from "@/lib/ui";
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
        <p className={mutedTextClass}>
          {selected.size} of {candidates.length} selected
          {hasFilters ? " from these filters" : ""}
        </p>
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
      </div>

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
              checked={selected.has(candidate.id)}
              onChange={(event) => toggle(candidate.id, event.target.checked)}
              className={`${checkboxClass} mt-0.5`}
            />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-foreground">{candidate.name}</span>
              <span className="truncate text-xs text-muted">
                {candidate.testGroup.scenario.name} › {candidate.testGroup.name}
              </span>
            </span>
            <Badge tone={priorityTone(candidate.priority)}>{candidate.priority}</Badge>
            <Badge tone={testResultTone(candidate.testResult)}>
              {candidate.testResult.replace(/_/g, " ")}
            </Badge>
          </label>
        ))}
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
