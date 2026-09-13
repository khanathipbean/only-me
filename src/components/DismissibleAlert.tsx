"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ClearIcon } from "@/components/icons";

/**
 * A red validation-error banner tied to a redirect's `?error=` (and often
 * `?editId=`) query param — without this, the banner has no way to close and
 * a plain refresh keeps re-rendering it forever, since the server reads the
 * same param on every request. Dismissing strips those params from the URL,
 * which both closes the banner and stops it from surviving a refresh.
 */
export function DismissibleAlert({
  children,
  clearParams = ["error", "editId"],
  className = "",
}: {
  children: ReactNode;
  /** Which query params to drop on dismiss — override when a page uses a
   * differently-named pair (e.g. `moveError`). */
  clearParams?: string[];
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function dismiss() {
    const params = new URLSearchParams(searchParams);
    for (const key of clearParams) {
      params.delete(key);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <p
      role="alert"
      className={`flex items-start justify-between gap-3 rounded-md bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-900/40 dark:text-red-300 ${className}`}
    >
      <span>{children}</span>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 text-red-700/70 hover:text-red-900 dark:text-red-300/70 dark:hover:text-red-100"
      >
        <ClearIcon className="size-4" />
      </button>
    </p>
  );
}
