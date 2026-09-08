"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { BreadcrumbSegment } from "@/lib/breadcrumb";

export type { BreadcrumbSegment };

const STORAGE_PREFIX = "breadcrumb-list-state:";

/**
 * Renders the current hierarchy path; every segment but the last is a link.
 * Also remembers this page's own search/filter query string (keyed by
 * pathname) so that a later Breadcrumb one level down can restore it when
 * linking back up here, per the "preserve prior search/filters/list page"
 * requirement.
 */
export function Breadcrumb({ segments }: { segments: BreadcrumbSegment[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Starts identical to the plain hrefs (matching what the server rendered)
  // and is only replaced after mount, so there is nothing to restore
  // synchronously during the effect itself — avoiding both a hydration
  // mismatch and a synchronous setState-in-effect call.
  const [restoredHrefs, setRestoredHrefs] = useState<Record<string, string>>({});

  useEffect(() => {
    const search = searchParams.toString();
    try {
      if (search) {
        sessionStorage.setItem(`${STORAGE_PREFIX}${pathname}`, search);
      } else {
        sessionStorage.removeItem(`${STORAGE_PREFIX}${pathname}`);
      }
    } catch {
      // sessionStorage unavailable (e.g. private browsing) — recording is best-effort.
    }

    // Deferred via .then() rather than read directly here: on the very first
    // client render (hydration) this must produce the same bare hrefs the
    // server rendered, so any restored href only appears after that render.
    Promise.resolve().then(() => {
      const restored: Record<string, string> = {};
      try {
        for (const segment of segments) {
          const stored = sessionStorage.getItem(`${STORAGE_PREFIX}${segment.href}`);
          if (stored) {
            restored[segment.href] = `${segment.href}?${stored}`;
          }
        }
      } catch {
        // sessionStorage unavailable — links just fall back to their bare href.
      }
      setRestoredHrefs(restored);
    });
  }, [pathname, searchParams, segments]);

  return (
    <nav aria-label="Breadcrumb">
      {segments.map((segment, index) => {
        const isCurrent = index === segments.length - 1;
        return (
          <span key={segment.href}>
            {index > 0 && " > "}
            {isCurrent ? (
              <span aria-current="page">{segment.label}</span>
            ) : (
              <Link href={restoredHrefs[segment.href] ?? segment.href}>{segment.label}</Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
