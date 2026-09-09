"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button, LinkButton } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";

/** The first entry is the server-side default (see DEFAULT_PAGE_SIZE in
 * lib/audit-log.ts) and the last must stay within MAX_PAGE_SIZE, which clamps
 * anything larger. Not imported from there on purpose: that module pulls in
 * Prisma, and this is a client component. */
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/**
 * Prev/Next controls plus a rows-per-page selector for a server-paginated
 * table.
 *
 * Every URL is built from the *current* query string with only the paging
 * params changed, so the active filters survive both paging and resizing.
 * Changing a filter resets paging for free: FilterForm rebuilds the query from
 * its own fields only, which drops `page` — otherwise you could sit on page 5
 * of a filter that now has one page.
 *
 * A missing target page renders a disabled <button> rather than a dead link,
 * so the control can't be clicked into a page that doesn't exist.
 */
export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function withParams(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  function hrefForPage(target: number) {
    return withParams((params) => {
      // Page 1 is the default — keep it out of the URL so the first page has
      // one canonical address instead of both `?page=1` and no param at all.
      if (target <= 1) {
        params.delete("page");
      } else {
        params.set("page", String(target));
      }
    });
  }

  function changePageSize(next: string) {
    router.push(
      withParams((params) => {
        params.set("pageSize", next);
        // Back to the first page: keeping the current page could land past the
        // end (page 4 of 4 at 10 rows becomes page 1 of 1 at 100 rows).
        params.delete("page");
      }),
      { scroll: false },
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {/* whitespace-nowrap on both the label and the count: they sit in a
            flex row that can squeeze, and "Rows per page" was wrapping onto
            two lines as soon as the row got tight. */}
        <label className="flex shrink-0 items-center gap-2 whitespace-nowrap text-sm text-muted">
          Rows per page
          <Select
            value={String(pageSize)}
            onChange={changePageSize}
            options={PAGE_SIZE_OPTIONS.map((option) => ({
              value: String(option),
              label: String(option),
            }))}
            ariaLabel="Rows per page"
            className="w-20 shrink-0"
          />
        </label>
        <p className="shrink-0 whitespace-nowrap text-sm text-muted">
          Page {page} of {totalPages} ({total} total)
        </p>
      </div>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <LinkButton href={hrefForPage(page - 1)} variant="secondary">
            Previous
          </LinkButton>
        ) : (
          <Button type="button" variant="secondary" disabled>
            Previous
          </Button>
        )}
        {page < totalPages ? (
          <LinkButton href={hrefForPage(page + 1)} variant="secondary">
            Next
          </LinkButton>
        ) : (
          <Button type="button" variant="secondary" disabled>
            Next
          </Button>
        )}
      </div>
    </div>
  );
}
