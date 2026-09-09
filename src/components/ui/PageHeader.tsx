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
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
