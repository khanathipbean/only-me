"use client";

import type { ReactNode } from "react";
import { useBulkSelection } from "@/components/BulkSelectionProvider";

/** A floating bottom bar that only exists once at least one row is checked —
 *  the count comes straight from `BulkSelectionProvider`'s state, not a DOM
 *  query, so it stays in sync with every `BulkSelectCheckbox`/select-all. */
export function BulkActionBar({ noun, children }: { noun: string; children: ReactNode }) {
  const { active, selected } = useBulkSelection();
  if (!active || selected.size === 0) {
    return null;
  }

  return (
    <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <div className="flex items-center gap-4 rounded-lg border border-border bg-surface px-5 py-3 shadow-lg">
        <span className="text-sm font-medium text-foreground">
          {selected.size} {noun}
          {selected.size === 1 ? "" : "s"} selected
        </span>
        {children}
      </div>
    </div>
  );
}
