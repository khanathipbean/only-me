"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Badge, type Tone } from "@/components/ui/Badge";

const DEBOUNCE_MS = 300;

const RESULT_TYPE_TONE: Record<string, Tone> = {
  Project: "purple",
  Module: "indigo",
  Requirement: "cyan",
  Scenario: "blue",
  TestGroup: "amber",
  TestCase: "green",
};

type SearchResult = {
  type: string;
  id: string;
  label: string;
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
        placeholder="Search Projects, Scenarios, Test Groups, Test Cases"
        className="block w-full rounded-full border border-border bg-background px-4 py-1.5 text-sm text-foreground placeholder:text-muted outline-none focus:border-brand focus:ring-1 focus:ring-brand"
      />

      {showPanel && (
        <div
          id={panelId}
          className="absolute top-full right-0 left-0 z-30 mt-2 max-h-96 overflow-y-auto rounded-lg border border-border bg-surface py-1 shadow-lg"
        >
          {searching ? (
            <p className="px-4 py-3 text-sm text-muted">Searching…</p>
          ) : results && results.length > 0 ? (
            <ul>
              {results.map((result) => (
                <li key={`${result.type}-${result.id}`}>
                  <Link
                    href={result.href}
                    onClick={() => setOpen(false)}
                    className="flex flex-col gap-1 px-4 py-2 hover:bg-black/[.05] dark:hover:bg-white/[.08]"
                  >
                    <span className="truncate text-sm font-medium text-foreground">
                      {result.label}
                    </span>
                    <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
                      <Badge tone={RESULT_TYPE_TONE[result.type] ?? "gray"}>{result.type}</Badge>
                      <span className="truncate">{result.projectName}</span>
                      {result.position && <span className="truncate">— {result.position}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
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
