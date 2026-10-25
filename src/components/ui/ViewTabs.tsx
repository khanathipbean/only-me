import Link from "next/link";
import type { ComponentType } from "react";

export type ViewTab = {
  label: string;
  href: string;
  /** True for the one being looked at. Worked out by the caller, which knows
   *  what its own addresses mean better than a string comparison does. */
  active: boolean;
  icon?: ComponentType<{ className?: string }>;
};

/**
 * One control with a segment per view, not a row of separate buttons: the set
 * is a single choice, and a box drawn round all of it says so before any of
 * the labels is read. The chosen segment is lifted onto the page's own
 * surface colour; the others stay flat against the track.
 *
 * Plain links, not buttons. Each view is an address, so it can be
 * bookmarked, opened in another window and gone Back out of.
 *
 * No `role="tablist"`/`"tab"`, though it is drawn as one: those promise a
 * widget that swaps a panel in place and answers arrow keys. These navigate.
 * Overriding the link role would take away what they are and advertise
 * behaviour they do not have, and `aria-current` is the right word for which
 * page you are on.
 *
 * Lifted out of the Members page when My Work wanted the same thing. Two
 * copies of a control drift apart one small fix at a time, and this one
 * carries enough decided-once detail to be worth keeping in a single place.
 */
export function ViewTabs({ label, tabs }: { label: string; tabs: ViewTab[] }) {
  return (
    <nav
      aria-label={label}
      className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-black/[.03] p-0.5 dark:bg-white/[.04]"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={tab.active ? "page" : undefined}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold [&>svg]:size-4 ${
              tab.active
                ? "bg-surface text-foreground shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            {Icon && <Icon />}
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
