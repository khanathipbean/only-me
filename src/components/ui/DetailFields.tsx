import type { ReactNode } from "react";

/**
 * A label-above-value field list. Lives in its own module rather than beside
 * `ExpandableRow`, which is a client component: a server page that only wants
 * these two would otherwise drag that whole file — state, effects and all —
 * into the browser bundle.
 */
const COLUMNS_CLASS = {
  1: "grid-cols-1",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
} as const;

export function DetailFields({
  children,
  columns = 2,
}: {
  children: ReactNode;
  /** Most field lists read better in two columns; a row of short fields
   *  (Preconditions/Expected Result/Condition/Test Data, say) can ask for
   *  three instead so the row doesn't leave one side empty. */
  columns?: keyof typeof COLUMNS_CLASS;
}) {
  return <dl className={`grid gap-x-6 gap-y-3 ${COLUMNS_CLASS[columns]}`}>{children}</dl>;
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
    <div
      // `items-start`, not `items-center`: grid cells stretch to the tallest
      // cell in their row by default, and centering within that taller cell
      // is what pushed a short field's label down out of line with a
      // multi-line neighbour (e.g. a short "Expected Result" beside a
      // several-step "Test Steps" list).
      className="flex items-start gap-3"
      // A Tailwind class name has to match a fixed set of column counts
      // (`sm:col-span-2`, `sm:col-span-3`, ...) to be generated at all; an
      // inline style sidesteps that so "wide" spans correctly whatever
      // `columns` the parent `DetailFields` was given. Below `sm` the grid
      // has no explicit column count yet, so this is a no-op there.
      style={wide ? { gridColumn: "1 / -1" } : undefined}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <div className="flex min-w-0 flex-col gap-0.5">
        <dt className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</dt>
        <dd className="text-sm whitespace-pre-wrap text-foreground">{children ?? "—"}</dd>
      </div>
    </div>
  );
}
