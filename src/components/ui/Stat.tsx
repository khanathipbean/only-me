import type { ReactNode } from "react";

/**
 * One fact about the project, with the figure as the whole tile.
 *
 * It used to be a glass pane: a gradient fill, a blur, a hairline top edge, a
 * 48px tinted icon square and a vertical rule — six times over, for six
 * facts, which is a lot of chrome in front of six numbers. The number is what
 * anybody came for, so it is the only thing set large; the label sits under
 * it, and the icon is a watermark, there to be recognised rather than read.
 *
 * Lives in its own plain module (no `"use client"`) so a server-rendered page
 * can use it without pulling a client boundary along.
 */
export function Stat({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    /* A flat tint rather than `bg-surface`: these sit inside a Card, which is
     * already that colour, so a surface fill would leave nothing but the
     * border. This is the same half-step above the panel the old gradient
     * gave, without the gradient. */
    <div className="relative overflow-hidden rounded-xl border border-border bg-black/[.02] px-4 py-4 dark:bg-white/[.04]">
      {/* Cropped by the tile's own corner, and far enough back not to compete
          with the figure. `aria-hidden` because the label already says which
          figure this is — the icon is recognition, not information. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-2 -right-2 text-muted/15 [&>svg]:size-16"
      >
        {icon}
      </span>
      {/* Proportional figures, not tabular-nums: these sit alone, not in a
          column that needs to align digit-for-digit, and tabular-nums makes a
          standalone number like "3" look loose at display size. */}
      <p className="relative text-3xl font-semibold tracking-tight text-foreground">{value}</p>
      <p className="relative mt-1 truncate text-[11px] font-semibold tracking-wider text-muted uppercase">
        {label}
      </p>
    </div>
  );
}
