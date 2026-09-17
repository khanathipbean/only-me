"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckIcon, ClearIcon } from "@/components/icons";

/**
 * How long the toast stays. Four seconds flat was fine for "Module created"
 * and far too short for "Moved to REQ-PM-010 ผู้ใช้สามารถส่ง Policy…", so the
 * message pays for its own reading time — roughly 12 characters a second,
 * held between a floor that isn't a flash and a ceiling that isn't in the way.
 */
const MIN_MS = 4000;
const MAX_MS = 9000;
const MS_PER_CHARACTER = 80;

function readingTime(message: string) {
  return Math.min(MAX_MS, Math.max(MIN_MS, 1500 + message.length * MS_PER_CHARACTER));
}

/**
 * Reads a one-shot `?toast=` message a server action's redirect left behind
 * (see `withToast`), shows it briefly, then strips it from the URL so a
 * refresh or a back-navigation doesn't replay it. Mounted once in the root
 * layout — every page gets this for free without importing anything itself.
 *
 * The countdown pauses while the pointer is over the toast and while the tab
 * is in the background: a message that expires unread has done nothing, and
 * the tab case is not rare — an upload or an import is exactly when people
 * look away.
 */
export function ToastListener() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const toastParam = searchParams.get("toast");
  const [message, setMessage] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  /** The whole countdown. The progress bar animates over this and is paused by
   *  CSS rather than restarted, so it keeps its own place without being told. */
  const [duration, setDuration] = useState(MIN_MS);

  /** What is left of the countdown, so a pause can resume where it stopped. */
  const remaining = useRef(MIN_MS);
  const startedAt = useRef(0);

  const dismiss = useCallback(() => {
    setMessage(null);
    const params = new URLSearchParams(searchParams);
    params.delete("toast");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  useEffect(() => {
    if (!toastParam) {
      return;
    }
    // Deferred via .then(), not called directly: the react-hooks "no setState
    // in effect" lint treats a synchronous setState call inside the effect
    // body as still executing synchronously — nesting it in a microtask
    // callback keeps it out of the effect's own synchronous body (same
    // pattern as useTheme/Breadcrumb).
    const span = readingTime(toastParam);
    Promise.resolve().then(() => {
      setMessage(toastParam);
      setDuration(span);
    });
    remaining.current = span;
  }, [toastParam]);

  // One timer, restarted whenever the countdown resumes. `paused` covers both
  // reasons to hold it: the pointer resting on the toast, and the tab being
  // hidden, which the listener below folds into the same flag.
  useEffect(() => {
    if (!message || paused) {
      return;
    }
    startedAt.current = Date.now();
    const timer = setTimeout(dismiss, remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt.current));
    };
  }, [message, paused, dismiss]);

  useEffect(() => {
    function onVisibility() {
      setPaused(document.hidden);
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  if (!message) {
    return null;
  }

  return (
    <div
      /* Remounted per message: a second toast arriving while the first is
         still up has to restart both animations, and changing a running
         animation's duration only re-times it in place. */
      key={message}
      role="status"
      aria-live="polite"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(document.hidden)}
      /* Top right, below the header and its tab bar rather than on top of
         them: at `top-4` this landed squarely over the search field, the theme
         toggle and the account menu. It floats over page content instead,
         which is the part you can scroll away from. Full width only on a phone,
         where a 22.5rem box has nowhere to sit. */
      className="toast-enter fixed top-28 right-4 left-4 z-50 overflow-hidden rounded-xl border border-border bg-surface shadow-xl sm:left-auto sm:w-90"
    >
      <div className="flex items-start gap-3 px-4 py-3">
        {/* The only colour in the box. A green slab behind the whole toast
            fought both themes; a tinted disc reads as "done" just as clearly
            and lets the message keep the theme's own text colour. */}
        <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
          <CheckIcon className="size-3" />
        </span>

        <p className="flex-1 text-sm leading-5 text-foreground">{message}</p>

        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="-mr-1 -mt-0.5 rounded-md p-1 text-muted transition-colors hover:bg-black/[.05] hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none dark:hover:bg-white/[.08]"
        >
          <ClearIcon className="size-4" />
        </button>
      </div>

      {/* How much time is left, rather than a toast that simply disappears
          mid-sentence. It is also the pause made visible: hovering stops the
          bar, which is the only hint that hovering does anything. */}
      <span
        aria-hidden="true"
        style={{
          animationDuration: `${duration}ms`,
          animationPlayState: paused ? "paused" : "running",
        }}
        className="toast-progress block h-0.5 origin-left bg-emerald-500/60"
      />
    </div>
  );
}
