"use client";

import { useEffect } from "react";
import Link from "next/link";
import { pageClass } from "@/lib/ui";

/**
 * What a reader sees when something throws, instead of the blank page Next
 * shows without this file.
 *
 * That blank page is not hypothetical — it is what appeared when the
 * `LoginThrottle` table had not been created yet, and the only reason anybody
 * understood it was that a developer was watching the terminal at the time.
 * A reader gets no terminal.
 *
 * The message deliberately says nothing about what went wrong. `error.digest`
 * is the hash Next puts in the server log for this exact throw, so it is the
 * one thing worth showing: it is useless to an attacker and it is the only
 * thing that lets somebody reporting this be matched to the log entry.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    /* The nearest thing this project has to error tracking. Nothing collects
     * these yet — when something does, this is where it attaches. */
    console.error("Unhandled error on this page:", error);
  }, [error]);

  return (
    <main className={`${pageClass} items-center justify-center py-24 text-center`}>
      <h1 className="text-2xl font-semibold text-foreground">Something went wrong</h1>
      <p className="max-w-md text-sm text-muted">
        The page could not be loaded. Trying again often works — if it does not, the reference
        below will let somebody find what happened.
      </p>
      {error.digest && (
        <p className="font-mono text-xs text-muted">
          reference <span className="text-foreground">{error.digest}</span>
        </p>
      )}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
        >
          Try again
        </button>
        <Link
          href="/projects"
          className="rounded-md border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-black/[.05] dark:hover:bg-white/[.08]"
        >
          Back to Projects
        </Link>
      </div>
    </main>
  );
}
