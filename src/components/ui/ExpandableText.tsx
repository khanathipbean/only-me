"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { ChevronRightIcon } from "@/components/icons";

/** Roughly two lines' worth of characters at the width this is used at —
 *  a fixed count instead of measuring rendered height, which depends on
 *  DOM layout timing (`scrollHeight` vs `clientHeight` right after mount)
 *  that turned out unreliable in practice. A character count is blunter but
 *  never silently fails to clamp. */
const DEFAULT_COLLAPSED_CHARS = 160;

/** Long enough to read as movement, short enough not to be waited on. Matches
 *  `ExpandableRow`, which opens the same kind of thing one level up. */
const DURATION_MS = 200;

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
  /* The height to animate to, in pixels, and only while animating. At rest it
   * is undefined so the paragraph sizes itself — otherwise a pinned pixel
   * height would clip or strand the text the moment the window was resized. */
  const [animatingTo, setAnimatingTo] = useState<number | null>(null);

  const liveRef = useRef<HTMLParagraphElement>(null);
  /* A copy of whichever state is not on screen, laid out but not shown, so
   * both heights can be read before anything moves. The alternative is
   * measuring after the swap, by which point the height to animate *from* is
   * already gone. `Select` keeps a hidden box for the same reason. */
  const measureRef = useRef<HTMLParagraphElement>(null);

  // Code points, not UTF-16 units: `.length`/`.slice` count/cut surrogate
  // pairs in half, which turns an emoji sitting right at the cut point into
  // a stray unpaired surrogate — a visible replacement glyph, not just an
  // ordinary mid-word truncation.
  const codePoints = Array.from(text);
  const overflowing = codePoints.length > collapsedChars;
  const clamped = `${codePoints.slice(0, collapsedChars).join("").trimEnd()}…`;

  const shown = expanded || !overflowing ? text : clamped;
  const hidden = expanded ? clamped : text;

  useLayoutEffect(() => {
    if (animatingTo === null) {
      return;
    }
    const timer = window.setTimeout(() => setAnimatingTo(null), DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [animatingTo]);

  function toggle() {
    const from = liveRef.current?.offsetHeight;
    const to = measureRef.current?.offsetHeight;

    /* Without both measurements there is nothing to animate between, so the
     * toggle still works — it just jumps, which is what it did before. */
    if (from !== undefined && to !== undefined && from !== to) {
      liveRef.current!.style.height = `${from}px`;
      // Read it back, so the browser treats the next value as a change to
      // animate rather than folding both into one frame.
      void liveRef.current!.offsetHeight;
      setAnimatingTo(to);
    }
    setExpanded((value) => !value);
  }

  return (
    /* `relative` so the measuring copy below can take this element's width.
     * Out of flow it would otherwise shrink to fit, and a paragraph measured
     * at the wrong width reports the wrong number of lines. */
    <div className="relative">
      <p
        ref={liveRef}
        /* The duration is a class, not an inline style, so
         * `motion-reduce` can take it away for anyone who has asked their
         * system for less movement. The height itself stays inline — it is a
         * measurement, and there is no class for a number. */
        className="overflow-hidden text-sm whitespace-pre-line text-muted transition-[height] duration-200 ease-out motion-reduce:transition-none"
        style={{ height: animatingTo === null ? undefined : `${animatingTo}px` }}
      >
        {shown}
      </p>

      {overflowing && (
        <>
          {/* Out of flow and out of the accessibility tree: it exists to be
              measured, and a screen reader meeting the same prose twice would
              be the cost of that. */}
          <p
            ref={measureRef}
            aria-hidden="true"
            className="pointer-events-none invisible absolute inset-x-0 top-0 text-sm whitespace-pre-line text-muted"
          >
            {hidden}
          </p>

          <button
            type="button"
            onClick={toggle}
            aria-expanded={expanded}
            className="mt-1 flex items-center gap-1 text-xs font-medium text-brand hover:underline"
          >
            {expanded ? "Show less" : "Show more"}
            <ChevronRightIcon
              className={`size-3 transition-transform duration-200 ${expanded ? "-rotate-90" : "rotate-90"}`}
            />
          </button>
        </>
      )}
    </div>
  );
}
