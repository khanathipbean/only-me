/** A muted label plus a bordered pill holding the count — sits beside a
 * filter row (or alone, on pages with no filters) so the number of matching
 * rows is visible without scrolling down to Pagination's own "X total". */
export function ResultCount({ total }: { total: number }) {
  return (
    <p className="flex shrink-0 items-center gap-2 text-sm text-muted">
      Total Results:
      <span className="rounded-md border border-border bg-surface px-2.5 py-1 text-sm font-bold text-foreground">
        {total}
      </span>
    </p>
  );
}
