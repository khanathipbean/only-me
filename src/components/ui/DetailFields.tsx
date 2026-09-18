import type { ReactNode } from "react";

/**
 * A label-above-value field list. Lives in its own module rather than beside
 * `ExpandableRow`, which is a client component: a server page that only wants
 * these two would otherwise drag that whole file — state, effects and all —
 * into the browser bundle.
 */
export function DetailFields({ children }: { children: ReactNode }) {
  return <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">{children}</dl>;
}

export function DetailField({
  label,
  children,
  icon,
  wide,
}: {
  label: string;
  children?: ReactNode;
  /** Sits to the left of the label and value, vertically centred against the
   *  pair. For a field about a person or a moment, where a face or a clock
   *  says at a glance what kind of fact this is. */
  icon?: ReactNode;
  /** Spans both columns — for long prose or a step list. */
  wide?: boolean;
}) {
  return (
    <div className={`flex items-center gap-3 ${wide ? "sm:col-span-2" : ""}`}>
      {icon && <span className="shrink-0">{icon}</span>}
      <div className="flex min-w-0 flex-col gap-0.5">
        <dt className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</dt>
        <dd className="text-sm whitespace-pre-wrap text-foreground">{children ?? "—"}</dd>
      </div>
    </div>
  );
}
