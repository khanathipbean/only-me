"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { InfoIcon } from "@/components/icons";

const SHOW_DELAY_MS = 300;
const GAP = 8;
const BOX_WIDTH = 320;

const ROLES = [
  {
    name: "Admin",
    summary: "Everything a Tester can do, plus this Members page and creating new Projects.",
  },
  {
    name: "Tester",
    summary:
      "Full access to a Project's content: create, edit, archive, and delete Modules, Requirements, Scenarios, Test Groups, and Test Cases; upload Files; record test results. Can't reach Members or create a Project.",
  },
];

/**
 * "What can each role do" tacked onto the page subtitle — an info icon whose
 * hover/focus popover carries real paragraphs, unlike the plain single-line
 * `Tooltip` every icon button already uses (that one is hardcoded to
 * `whitespace-nowrap`, which this content would just overflow).
 *
 * Left-anchored under the trigger rather than centered: a 320px box centered
 * on an icon this close to the header's left edge would run past the
 * viewport, the same reason `Tooltip` only centers a short label.
 */
export function RoleGuideTooltip() {
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<{ top: number; left: number } | null>(null);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const showTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  function scheduleShow() {
    if (showTimeout.current) clearTimeout(showTimeout.current);
    showTimeout.current = setTimeout(() => {
      const rect = wrapperRef.current?.getBoundingClientRect();
      if (!rect) return;
      setBox({
        top: rect.bottom + GAP,
        left: Math.min(rect.left, window.innerWidth - BOX_WIDTH - GAP),
      });
      setOpen(true);
    }, SHOW_DELAY_MS);
  }

  function hide() {
    if (showTimeout.current) clearTimeout(showTimeout.current);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [open]);

  return (
    <span
      ref={wrapperRef}
      // Sized to the subtitle's own line height (text-sm → 20px), not the
      // IconButton's usual size-9: a box taller than the text it sits next
      // to centers on itself, not on the text's optical center, which is
      // exactly the mismatch the title placement had before this moved here.
      className="inline-flex items-center self-center"
      onMouseEnter={scheduleShow}
      onMouseLeave={hide}
      onFocus={scheduleShow}
      onBlur={hide}
    >
      <button
        type="button"
        aria-label="What can each role do?"
        className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted outline-none transition-colors hover:bg-black/[.05] hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand dark:hover:bg-white/[.08]"
      >
        <InfoIcon className="size-4" />
      </button>

      {open &&
        box &&
        createPortal(
          <div
            role="tooltip"
            style={{ top: box.top, left: box.left, width: BOX_WIDTH }}
            className="fixed z-50 flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 text-left shadow-lg"
          >
            {ROLES.map((role) => (
              <div key={role.name}>
                <p className="text-sm font-semibold text-foreground">{role.name}</p>
                <p className="mt-0.5 text-sm text-muted">{role.summary}</p>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </span>
  );
}
