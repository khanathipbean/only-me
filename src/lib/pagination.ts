/**
 * Shared paging arithmetic for the list tables, so they agree on the default
 * size, the cap, and what to do with a nonsense `?page=` — and so the UI's
 * rows-per-page options only have to line up with one source of truth.
 */

export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 100;

export type PageFilters = { page?: number; pageSize?: number };

function sanitizePositiveInt(value: number | undefined, fallback: number, max: number) {
  if (value === undefined || Number.isNaN(value) || value < 1) {
    return fallback;
  }
  return Math.min(value, max);
}

/**
 * Runs a paginated query.
 *
 * The count comes first so the page can be clamped *before* the rows are
 * fetched: filters can shrink a result set while `?page=5` is still in the
 * URL, and clamping only the displayed number left the table empty while
 * claiming to be on the last page. That costs one sequential round trip,
 * which is the right trade for never showing a blank page that exists.
 */
export async function paginate<T>(
  filters: PageFilters,
  count: () => Promise<number>,
  rows: (range: { skip: number; take: number }) => Promise<T[]>,
) {
  const pageSize = sanitizePositiveInt(filters.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const requested = sanitizePositiveInt(filters.page, 1, Number.MAX_SAFE_INTEGER);

  const total = await count();
  const totalPages = Math.max(Math.ceil(total / pageSize), 1);
  const page = Math.min(requested, totalPages);
  const items = await rows({ skip: (page - 1) * pageSize, take: pageSize });

  return { items, total, page, pageSize, totalPages };
}
