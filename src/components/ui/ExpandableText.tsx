"use client";

import { useState } from "react";
import { ChevronRightIcon } from "@/components/icons";

/** Roughly two lines' worth of characters at the width this is used at —
 *  a fixed count instead of measuring rendered height, which depends on
 *  DOM layout timing (`scrollHeight` vs `clientHeight` right after mount)
 *  that turned out unreliable in practice. A character count is blunter but
 *  never silently fails to clamp. */
const DEFAULT_COLLAPSED_CHARS = 160;

/**
 * Clamps long text with a trailing "…" and a "Show more"/"Show less"
 * toggle — for prose too long to fit a header card (a Project
 * description), which used to be a single truncated line behind a hover
 * tooltip. A tooltip works for a short aside; several lines of real content
 * deserves to be readable in place instead of hidden behind a hover.
 */
export function ExpandableText({
  text,
  collapsedChars = DEFAULT_COLLAPSED_CHARS,
}: {
  text: string;
  collapsedChars?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  // Code points, not UTF-16 units: `.length`/`.slice` count/cut surrogate
  // pairs in half, which turns an emoji sitting right at the cut point into
  // a stray unpaired surrogate — a visible replacement glyph, not just an
  // ordinary mid-word truncation.
  const codePoints = Array.from(text);
  const overflowing = codePoints.length > collapsedChars;
  const shown =
    expanded || !overflowing
      ? text
      : `${codePoints.slice(0, collapsedChars).join("").trimEnd()}…`;

  return (
    <div>
      <p className="text-sm whitespace-pre-line text-muted">{shown}</p>
      {overflowing && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-1 flex items-center gap-1 text-xs font-medium text-brand hover:underline"
        >
          {expanded ? "Show less" : "Show more"}
          <ChevronRightIcon
            className={`size-3 transition-transform ${expanded ? "-rotate-90" : "rotate-90"}`}
          />
        </button>
      )}
    </div>
  );
}
