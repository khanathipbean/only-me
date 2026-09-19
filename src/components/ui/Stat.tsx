import type { ReactNode } from "react";

/**
 * A "glass" tile: an icon, a label, and one fact about the project. Shared by
 * `DashboardView` (where it was defined originally) and the Overview tab's
 * summary — kept in its own plain module (no `"use client"`) so a
 * server-rendered page can use it without pulling `DashboardView`'s client
 * boundary along for the ride.
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
    // A glass pane, not a flat tint: a soft gradient fill plus blur reads as
    // a pane sitting just above the Card's surface, and the hairline top
    // edge (brighter than the border's other three sides) is what sells
    // "glass" rather than "tinted box" — light catching the top of a bevel.
    <div className="relative overflow-hidden rounded-xl border border-black/[.06] bg-gradient-to-b from-black/[.05] to-black/[.015] px-4 py-5 shadow-sm backdrop-blur-sm dark:border-white/10 dark:from-white/[.08] dark:to-white/[.02]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/70 dark:bg-white/15" />
      <div className="flex items-center gap-3.5">
        {/* One tint for all six, taken from the theme's own accent rather
            than a colour per card: these are not six categories to tell
            apart, they are six facts about one project, and the label beside
            each already names it. */}
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand [&>svg]:size-6 dark:bg-brand/15">
          {icon}
        </span>
        <span aria-hidden="true" className="h-10 w-px shrink-0 bg-border" />
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-muted">{label}</p>
          {/* Proportional figures, not tabular-nums: these sit alone, not in
              a column that needs to align digit-for-digit, and tabular-nums
              makes a standalone number like "5" look loose at display
              size. */}
          <p className="text-2xl font-semibold text-foreground">{value}</p>
        </div>
      </div>
    </div>
  );
}
