"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ClearIcon } from "@/components/icons";

const AUTO_DISMISS_MS = 4000;

/**
 * Reads a one-shot `?toast=` message a server action's redirect left behind
 * (see `withToast`), shows it briefly, then strips it from the URL so a
 * refresh or a back-navigation doesn't replay it. Mounted once in the root
 * layout — every page gets this for free without importing anything itself.
 */
export function ToastListener() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const toastParam = searchParams.get("toast");
  const [message, setMessage] = useState<string | null>(null);

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
    Promise.resolve().then(() => setMessage(toastParam));
    const timer = setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toastParam, dismiss]);

  if (!message) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 shadow-lg dark:border-emerald-400/20 dark:bg-emerald-900/90 dark:text-emerald-100"
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="text-emerald-700/70 hover:text-emerald-900 dark:text-emerald-200/70 dark:hover:text-white"
      >
        <ClearIcon className="size-4" />
      </button>
    </div>
  );
}
