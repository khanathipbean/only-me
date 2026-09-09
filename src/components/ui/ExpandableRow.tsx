"use client";

import { useId, useState, type ReactNode } from "react";
import { IconButton } from "@/components/ui/Button";
import { ChevronRightIcon } from "@/components/icons";
import { tdClass, trHoverClass } from "@/lib/ui";

/**
 * A table row that expands a detail panel underneath itself instead of
 * navigating to a detail page.
 *
 * Renders two `<tr>`s: the row proper, and a full-width row holding the panel.
 * A `<tr>`/`<td>` can't be height-animated directly (their `display` is
 * table-internal, and `height` on them behaves as a minimum), so the panel
 * lives in a nested grid whose single track animates between `0fr` and `1fr`
 * with the content clipped by `overflow-hidden` — the standard way to slide
 * open a box of unknown height without hardcoding a max-height.
 *
 * The panel stays in the DOM while collapsed, which is what makes the
 * animation possible but would otherwise leave its links and text reachable by
 * Tab and by screen readers; `inert` plus `aria-hidden` takes it out of both.
 */
export function ExpandableRow({
  cells,
  actions,
  detail,
  colSpan,
  detailLabel,
}: {
  /** The `<td>`s for every column except the trailing actions column. */
  cells: ReactNode;
  /** Extra controls placed before the expand toggle (e.g. an Edit modal). */
  actions?: ReactNode;
  /** Panel body, rendered below the row when expanded. */
  detail: ReactNode;
  /** Total column count, so the panel row spans the whole table. */
  colSpan: number;
  /** Names the row in the toggle's accessible label, e.g. the row's title. */
  detailLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const toggleLabel = open ? `Hide details for ${detailLabel}` : `Show details for ${detailLabel}`;

  return (
    <>
      <tr className={trHoverClass}>
        {cells}
        <td className={tdClass}>
          <div className="flex items-center justify-end gap-1">
            {actions}
            <IconButton
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              aria-controls={panelId}
              aria-label={toggleLabel}
              title={open ? "Hide details" : "Show details"}
            >
              <ChevronRightIcon
                className={`size-4 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
              />
            </IconButton>
          </div>
        </td>
      </tr>
      <tr>
        {/* No border or padding of its own: the row above already draws the
            separator, and any padding here would show as a gap while collapsed. */}
        <td colSpan={colSpan} className="border-0 p-0">
          <div
            id={panelId}
            inert={!open}
            aria-hidden={!open}
            className={`grid transition-[grid-template-rows] duration-200 ease-out ${
              open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
            }`}
          >
            <div className="overflow-hidden">
              <div className="border-b border-border bg-black/[.015] px-3 py-4 dark:bg-white/[.02]">
                {detail}
              </div>
            </div>
          </div>
        </td>
      </tr>
    </>
  );
}

/** Field list for an `ExpandableRow` panel, mirroring the detail pages' cards. */
export function DetailFields({ children }: { children: ReactNode }) {
  return <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">{children}</dl>;
}

export function DetailField({
  label,
  children,
  wide,
}: {
  label: string;
  children?: ReactNode;
  /** Spans both columns — for long prose or a step list. */
  wide?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-0.5 ${wide ? "sm:col-span-2" : ""}`}>
      <dt className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</dt>
      <dd className="text-sm whitespace-pre-wrap text-foreground">{children ?? "—"}</dd>
    </div>
  );
}
