"use client";

import type { ReactNode } from "react";
import { useBulkSelection } from "@/components/BulkSelectionProvider";

/**
 * A floating bottom bar that only exists once at least one row is checked —
 * the count comes straight from `BulkSelectionProvider`'s state, not a DOM
 * query, so it stays in sync with every `BulkSelectCheckbox`/select-all.
 *
 * It also carries the offer to reach past this page. Ticking the header box
 * selects what is on screen and says so; reaching the rest is a separate
 * press, the way a mail client does it, because the action beside it archives
 * and the rows it would reach are not there to be looked at.
 */
export function BulkActionBar({
  noun,
  formId,
  totalMatching,
  pageSize,
  children,
}: {
  noun: string;
  /** The form the hidden marker joins, the same one the row checkboxes use. */
  formId?: string;
  /** How many rows the current filter matches across every page. Without it
   *  the bar stays exactly as it was. */
  totalMatching?: number;
  /** How many are on screen, so the offer only appears when there are more. */
  pageSize?: number;
  children: ReactNode;
}) {
  const { active, selected, allMatching, setAllMatching } = useBulkSelection();
  if (!active || selected.size === 0) {
    return null;
  }

  const canReachFurther =
    formId !== undefined &&
    totalMatching !== undefined &&
    pageSize !== undefined &&
    pageSize > 0 &&
    totalMatching > pageSize &&
    selected.size === pageSize;

  return (
    <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-surface px-5 py-3 shadow-lg">
        <span className="text-sm font-medium text-foreground">
          {allMatching ? (
            <>
              All {totalMatching} {noun}
              {totalMatching === 1 ? "" : "s"} selected
            </>
          ) : (
            <>
              {selected.size} {noun}
              {selected.size === 1 ? "" : "s"} selected
            </>
          )}
        </span>

        {/* A marker rather than the ids: the server reads the set back from
            the same filters the list was drawn with, so what is touched is
            what was on screen. The row checkboxes keep submitting their own
            ids and the server ignores them while this is set. */}
        {allMatching && formId && <input type="hidden" name="scope" value="all" form={formId} />}

        {(canReachFurther || allMatching) && (
          <span className="flex items-center gap-2 text-sm text-muted">
            <span aria-hidden className="h-5 w-px bg-border" />
            {allMatching ? (
              <>
                Every {noun} matching this filter.{" "}
                <button
                  type="button"
                  className="text-brand hover:underline"
                  onClick={() => setAllMatching(false)}
                >
                  Just this page
                </button>
              </>
            ) : (
              <>
                All {pageSize} on this page.{" "}
                <button
                  type="button"
                  className="text-brand hover:underline"
                  onClick={() => setAllMatching(true)}
                >
                  Select all {totalMatching} that match
                </button>
              </>
            )}
          </span>
        )}

        {children}
      </div>
    </div>
  );
}
