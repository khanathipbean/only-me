"use client";

import { useMemo, useState } from "react";
import { Badge, priorityTone, testResultTone } from "@/components/ui/Badge";
import { DialogCloseButton } from "@/components/ui/DialogCloseButton";
import { SubmitButton } from "@/components/SubmitButton";
import { Pagination } from "@/components/ui/Pagination";
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

/** Reads as a link, behaves as a button. Greyed rather than hidden when it
 *  would do nothing, so the pair doesn't shift about as rows are ticked. */
const TEXT_ACTION =
  "rounded text-brand underline-offset-2 transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none disabled:cursor-not-allowed disabled:text-muted disabled:no-underline";

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
  /* Paged here rather than through the URL like every other list: paging by
   * URL re-renders the page from the server, and everything ticked would be
   * gone on the way back. Holding the page here keeps one selection across
   * all of them. */
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const totalPages = Math.max(Math.ceil(candidates.length / pageSize), 1);
  const currentPage = Math.min(page, totalPages);
  const visible = useMemo(
    () => candidates.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [candidates, currentPage, pageSize],
  );

  function selectAll() {
    setSelected(new Set(candidates.map((candidate) => candidate.id)));
  }

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
      {/* The ticked ids ride as hidden fields, not as the checkboxes on
          screen: only one page of those exists at a time, and a selection
          spanning pages has to arrive whole. */}
      {[...selected].map((id) => (
        <input key={id} type="hidden" name="testCaseId" value={id} />
      ))}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Text, not buttons: these only change what is ticked, and a pair
            of solid buttons read as heavily as Add to run, which is the one
            that actually writes something. Still real <button>s, so they stay
            reachable by keyboard. */}
        <div className="flex items-center gap-3 text-sm">
          <button type="button" className={TEXT_ACTION} onClick={selectAll} disabled={allSelected}>
            Select all
          </button>
          <span aria-hidden="true" className="text-border">
            |
          </span>
          <button
            type="button"
            className={TEXT_ACTION}
            onClick={() => setSelected(new Set())}
            disabled={selected.size === 0}
          >
            Clear all
          </button>
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
          {visible.map((candidate) => (
            <label
              key={candidate.id}
              className={`${ROW_GRID} border-b border-border px-3 py-2 text-sm last:border-b-0`}
            >
              <input
                type="checkbox"
                aria-label={candidate.name}
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

      {totalPages > 1 && (
        <Pagination
          page={currentPage}
          totalPages={totalPages}
          total={candidates.length}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(next) => {
            setPageSize(next);
            setPage(1);
          }}
        />
      )}

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
