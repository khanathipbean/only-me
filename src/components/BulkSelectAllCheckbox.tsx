"use client";

import { useBulkSelection } from "@/components/BulkSelectionProvider";

export function BulkSelectAllCheckbox({ ids }: { ids: string[] }) {
  const { active, selected, selectAll, clear } = useBulkSelection();
  const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));
  if (!active) {
    return null;
  }
  return (
    <input
      type="checkbox"
      aria-label="Select all"
      checked={allSelected}
      onChange={(event) => (event.target.checked ? selectAll(ids) : clear())}
    />
  );
}
