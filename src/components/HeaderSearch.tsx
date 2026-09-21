"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Badge, type Tone } from "@/components/ui/Badge";
import {
  BoxIcon,
  BranchIcon,
  ChevronRightIcon,
  FileTextIcon,
  FolderIcon,
  LayersIcon,
  ClipboardListIcon,
  ListChecksIcon,
} from "@/components/icons";

const DEBOUNCE_MS = 300;

const RESULT_TYPE_TONE: Record<string, Tone> = {
  Project: "purple",
  Module: "indigo",
  Requirement: "cyan",
  Scenario: "blue",
  TestGroup: "amber",
  TestCase: "green",
  Note: "gray",
};

/** Fixed order, so the groups sit where you last saw them however the
 *  matches fall — and it is the order of the hierarchy itself, widest first. */
const GROUPS = [
  { type: "Project", heading: "Projects", icon: <BoxIcon /> },
  { type: "Module", heading: "Modules", icon: <LayersIcon /> },
  { type: "Requirement", heading: "Requirements", icon: <FileTextIcon /> },
  { type: "Scenario", heading: "Scenarios", icon: <BranchIcon /> },
  { type: "TestGroup", heading: "Test Groups", icon: <FolderIcon /> },
  { type: "TestCase", heading: "Test Cases", icon: <ListChecksIcon /> },
  { type: "Note", heading: "Notes", icon: <ClipboardListIcon /> },
] as const;

/**
 * Where "View all" goes for a group, or null when there is nowhere honest to
 * send it.
 *
 * Projects have a list of their own. Modules have one per Project, so the
 * link only appears when every match in the group sits in the same Project —
 * otherwise it would have to pick one and silently drop the rest.
 *
 * Nothing deeper gets a link at all: a Requirements list lives inside one
 * Module, a Scenarios list inside one Requirement, and so on down. Matches in
 * those groups come from different parents, so there is no single page that
 * holds them.
 */
function viewAllHref(type: string, items: SearchResult[], term: string): string | null {
  const query = `search=${encodeURIComponent(term)}`;

  if (type === "Project") {
    return `/projects?${query}`;
  }

  /* Modules and Notes each have a list of their own per Project, so the link
   * works whenever every match in the group sits in the same one — otherwise
   * it would have to pick a Project and drop the rest without saying. */
  if (type === "Module" || type === "Note") {
    const projectIds = new Set(items.map((item) => item.projectId));
    if (projectIds.size !== 1) {
      return null;
    }
    const path = type === "Module" ? "modules" : "notes";
    return `/projects/${items[0].projectId}/${path}?${query}`;
  }

  return null;
}

type SearchResult = {
  type: string;
  id: string;
  label: string;
  projectId: string;
  projectName: string;
  position: string;
  href: string;
};

/**
 * Search from the header, with results in a panel under the box.
 *
 * Deliberately not a page of its own. A `/search` route meant every search
 * navigated away from whatever you were doing, and a search that found
 * nothing left you on a dead end with no way back to where you had been.
 * Here nothing navigates until you pick a result, so clearing the box simply
 * returns you to the page you never left.
 */
export function HeaderSearch({ className = "" }: { className?: string }) {
  const [query, setQuery] = useState("");
  /* Results are stored with the term they belong to, so a reply that lands
   * after the next keystroke is simply ignored rather than having to be
   * cleared — which would mean calling setState straight from the effect. */
  const [data, setData] = useState<{ term: string; items: SearchResult[] } | null>(null);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    const term = query.trim();
    if (!term) {
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: controller.signal })
        .then((response) => {
          // The session can lapse while this page sits open; the API says 401
          // rather than redirecting, so send the browser to sign in again.
          if (response.status === 401) {
            router.push("/login");
            return null;
          }
          return response.ok ? response.json() : null;
        })
        .then((body: { results: SearchResult[] } | null) => {
          if (body) setData({ term, items: body.results });
        })
        .catch((error: unknown) => {
          // An aborted request is the next keystroke, not a failure.
          if ((error as { name?: string })?.name !== "AbortError") {
            setData({ term, items: [] });
          }
        });
    }, DEBOUNCE_MS);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, router]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const term = query.trim();
  const showPanel = open && term.length > 0;
  const results = data?.term === term ? data.items : null;
  const searching = results === null;

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <input
        type="search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        role="combobox"
        aria-expanded={showPanel}
        aria-controls={panelId}
        aria-label="Search"
        placeholder="Search Projects, Modules, Requirements, Scenarios, Test Groups, Test Cases"
        className="block w-full rounded-full border border-border bg-background px-4 py-1.5 text-sm text-foreground placeholder:text-muted outline-none focus:border-brand focus:ring-1 focus:ring-brand"
      />

      {showPanel && (
        <div
          id={panelId}
          className="scrollbar-slim absolute top-full right-0 left-0 z-30 mt-2 max-h-[28rem] overflow-y-auto rounded-lg border border-border bg-surface shadow-lg"
        >
          {searching ? (
            <p className="px-4 py-3 text-sm text-muted">Searching…</p>
          ) : results && results.length > 0 ? (
            /* Grouped by kind rather than one flat run: a search for "login"
               matches at every level, and ungrouped those arrive interleaved,
               so finding the Module among forty Test Cases meant reading each
               row's badge. The badge stays on the row all the same — scroll a
               long group and its heading leaves the panel. */
            <div className="flex flex-col gap-3 p-3">
              {GROUPS.map(({ type, heading, icon }) => {
                const items = results.filter((result) => result.type === type);
                if (items.length === 0) {
                  return null;
                }
                const allHref = viewAllHref(type, items, term);

                return (
                  /* Boxed, not just spaced: the panel scrolls, and a
                     heading that has scrolled past leaves its rows looking
                     like they belong to the group above. A border travels
                     with them. */
                  <section
                    key={type}
                    className="overflow-hidden rounded-lg border border-border"
                  >
                    <div className="flex items-center gap-2 px-3 py-2">
                      <span className="shrink-0 text-muted">{icon}</span>
                      <h2 className="flex-1 truncate text-xs font-semibold tracking-wide text-muted uppercase">
                        {heading}
                      </h2>
                      <span className="shrink-0 text-xs tabular-nums text-muted">
                        {items.length}
                      </span>
                      {allHref && (
                        <Link
                          href={allHref}
                          onClick={() => setOpen(false)}
                          className="flex shrink-0 items-center gap-0.5 text-xs font-medium text-brand hover:underline"
                        >
                          View all
                          <ChevronRightIcon className="size-3" />
                        </Link>
                      )}
                    </div>
                    <ul>
                      {items.map((result) => (
                        <li key={`${result.type}-${result.id}`}>
                          <Link
                            href={result.href}
                            onClick={() => setOpen(false)}
                            className="flex items-center gap-3 px-3 py-2 hover:bg-black/[.05] dark:hover:bg-white/[.08]"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-foreground">
                                {result.label}
                              </span>
                              <span className="block truncate text-xs text-muted">
                                {result.projectName}
                                {result.position && ` — ${result.position}`}
                              </span>
                            </span>
                            <span className="shrink-0">
                              <Badge tone={RESULT_TYPE_TONE[result.type] ?? "gray"}>
                                {result.type}
                              </Badge>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          ) : (
            <p className="px-4 py-3 text-sm text-muted">
              No results for &quot;{term}&quot;. Clear the box to carry on where you were.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
