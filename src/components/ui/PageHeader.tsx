import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  // pb-6 (24px) intentionally matches the page container's own `gap-6` below
  // the border (see pageClass in lib/ui), so the divider gets equal breathing
  // room above and below it.
  return (
    /* The actions stay on the title's row on anything desk-sized, and only
       drop beneath it on a tablet or a phone.
       Wrapping at every width sounds harmless and is not: the block on the
       left takes whatever width its content wants, so a page with a long line
       of badges and counts under its title pushed its own buttons onto a row
       of their own on a perfectly wide screen. They belong top right, where
       the reader's eye goes for them.
       `min-w-0` on the left block is what lets it give way — without it a
       flex child refuses to shrink below its content and the row overflows
       instead of the text wrapping inside it. */
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-6 lg:flex-nowrap">
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-muted">{subtitle}</div>}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
