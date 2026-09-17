"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { IconButton, IconLinkButton } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  FirstPageIcon,
  LastPageIcon,
} from "@/components/icons";

/** The first entry is the server-side default (see DEFAULT_PAGE_SIZE in
 * lib/audit-log.ts) and the last must stay within MAX_PAGE_SIZE, which clamps
 * anything larger. Not imported from there on purpose: that module pulls in
 * Prisma, and this is a client component. */
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/** How many numbered buttons sit in the sliding window around the current
 * page (excluding the pinned first/last). Five was chosen to match the
 * reference design: on page 1 of a long list that's "1 2 3 4 5 … 466". */
const WINDOW_SIZE = 5;

/**
 * The page numbers to render, with `"ellipsis"` marking a collapsed gap.
 *
 * First and last are always pinned so the total range stays visible no
 * matter where `current` sits; the window slides to keep `current` inside it
 * without ever running off either end.
 */
function pageNumbers(current: number, total: number): (number | "ellipsis")[] {
  if (total <= WINDOW_SIZE + 2) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const start = Math.min(Math.max(current - 2, 1), total - WINDOW_SIZE + 1);
  const end = start + WINDOW_SIZE - 1;

  const pages: (number | "ellipsis")[] = [];
  if (start > 1) {
    pages.push(1);
    if (start > 2) pages.push("ellipsis");
  }
  for (let page = start; page <= end; page++) {
    pages.push(page);
  }
  if (end < total) {
    if (end < total - 1) pages.push("ellipsis");
    pages.push(total);
  }
  return pages;
}

/**
 * Numbered page controls (first/previous/…/next/last) plus a rows-per-page
 * selector for a server-paginated table.
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
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  /**
   * Given together, the control reports changes instead of navigating, and
   * the caller holds the page. A list that carries state across pages — the
   * run picker's ticked cases — cannot use the URL for this: every page would
   * be a fresh render, and what was ticked would be gone.
   */
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
}) {
  const controlled = Boolean(onPageChange);
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
    if (onPageSizeChange) {
      onPageSizeChange(Number(next));
      return;
    }
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

  /** The same square either way: a link when the page lives in the URL, a
   *  button when the caller owns it. */
  function pageControl(target: number, label: string, children: ReactNode, className = "") {
    return controlled ? (
      <IconButton
        type="button"
        variant="secondary"
        aria-label={label}
        title={label}
        className={className}
        onClick={() => onPageChange?.(target)}
      >
        {children}
      </IconButton>
    ) : (
      <IconLinkButton
        href={hrefForPage(target)}
        variant="secondary"
        aria-label={label}
        title={label}
        className={className}
      >
        {children}
      </IconLinkButton>
    );
  }

  return (
    // A deliberate stack below sm:, not flex-wrap: with three pieces (rows
    // selector, page count, Previous/Next) all marked nowrap, flex-wrap chose
    // where to break based on whatever ran out of room first — often mid-group,
    // e.g. Previous landing on the row-count's own line. Two clean rows read
    // better than a wrap that could land anywhere.
    <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
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
            className="w-18 shrink-0"
          />
        </label>
        <p className="shrink-0 whitespace-nowrap text-sm text-muted">
          Page {page} of {totalPages} ({total} total)
        </p>
      </div>
      {/* First/Previous, the numbered window, then Next/Last — all one
          fixed-height row of size-9 squares so the numbers lining up next to
          the arrows reads as one control, not two glued together. Disabled
          buttons rather than dead links at either end, same reasoning as the
          old Previous/Next: the control can't be clicked into a page that
          doesn't exist. */}
      <div className="flex items-center gap-1">
        {page > 1 ? (
          pageControl(1, "First page", <FirstPageIcon />)
        ) : (
          <IconButton type="button" variant="secondary" aria-label="First page" title="First page" disabled>
            <FirstPageIcon />
          </IconButton>
        )}
        {page > 1 ? (
          pageControl(page - 1, "Previous page", <ChevronLeftIcon />)
        ) : (
          <IconButton type="button" variant="secondary" aria-label="Previous page" title="Previous page" disabled>
            <ChevronLeftIcon />
          </IconButton>
        )}

        {pageNumbers(page, totalPages).map((entry, index) =>
          entry === "ellipsis" ? (
            <span key={`ellipsis-${index}`} className="flex size-9 items-center justify-center text-sm text-muted">
              …
            </span>
          ) : entry === page ? (
            <span
              key={entry}
              aria-current="page"
              /* Neutral foreground/background, not `bg-brand`: this app's
                 theme is charcoal, and the indigo accent reads as a leftover
                 from an older palette everywhere it's tried against emphasis
                 chrome (see Avatar's own note on the same trade-off) — a
                 quiet current-page marker instead of the primary button's
                 twin in an unrelated color. */
              className="flex size-9 shrink-0 items-center justify-center rounded-md bg-foreground text-sm font-semibold text-background"
            >
              {entry}
            </span>
          ) : (
            <span key={entry}>
              {pageControl(entry, `Page ${entry}`, entry, "text-sm font-medium")}
            </span>
          ),
        )}

        {page < totalPages ? (
          pageControl(page + 1, "Next page", <ChevronRightIcon />)
        ) : (
          <IconButton type="button" variant="secondary" aria-label="Next page" title="Next page" disabled>
            <ChevronRightIcon />
          </IconButton>
        )}
        {page < totalPages ? (
          pageControl(totalPages, "Last page", <LastPageIcon />)
        ) : (
          <IconButton type="button" variant="secondary" aria-label="Last page" title="Last page" disabled>
            <LastPageIcon />
          </IconButton>
        )}
      </div>
    </div>
  );
}
