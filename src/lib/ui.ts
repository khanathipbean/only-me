/** Shared Tailwind class strings for native form/table elements, kept as plain
 * strings (not components) so `name`/`defaultValue` on uncontrolled
 * server-action forms keep working unchanged. */

/** Deliberately carries no width or padding of its own: each exported class
 * below sets those once. Two utilities for the same CSS property in one class
 * string (`w-full` + `w-auto`, `pr-9` + `pr-7`) don't reliably override each
 * other — the winner depends on the order Tailwind emits them, not the order
 * they're written — so variants compose from this instead of patching. */
const fieldBaseClass =
  "rounded-md border border-border bg-surface text-sm text-foreground shadow-sm outline-none transition-colors focus:border-brand focus:ring-1 focus:ring-brand";

export const inputClass = `block w-full ${fieldBaseClass} px-3 py-2 placeholder:text-muted`;

/** Native `<select>`: `appearance-none` hides the browser's own arrow (which
 * sits flush against the edge and can't be repositioned), replaced by
 * `.select-field` in globals.css — a custom chevron with proper inset. */
export const selectClass = `block w-full ${fieldBaseClass} select-field appearance-none bg-no-repeat py-2 pl-3 pr-9`;

/** Compact `<select>` for a small inline control (e.g. a rows-per-page
 * picker). Widths to its content rather than filling its container, and
 * reserves only enough right padding to clear the chevron — the full-width
 * variant's 36px looks like dead space around a two-digit value. */
export const selectCompactClass = `${fieldBaseClass} select-field appearance-none bg-no-repeat py-1.5 pl-2.5 pr-8`;

export const textareaClass = `${inputClass} min-h-24`;

export const checkboxClass = "size-4 rounded border-border text-brand focus:ring-brand";

export const labelClass = "flex flex-col gap-1.5 text-sm font-medium text-foreground";

export const formRowClass = "flex flex-wrap items-end gap-3";

export const tableWrapClass = "overflow-x-auto rounded-lg border border-border";

/**
 * No `min-w-max` on purpose: it forces the table to at least the sum of every
 * column's max-content width, which overrode the per-column `<colgroup>`
 * proportions each table declares and left the wrapper permanently scrolling.
 * Cells that must not wrap (a timestamp, say) carry their own
 * `whitespace-nowrap`, which still pushes the table past the wrapper and
 * scrolls — but only when genuinely needed.
 */
export const tableClass = "w-full border-collapse text-sm";

export const thClass =
  "border-b border-border bg-black/[.02] px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted dark:bg-white/[.03]";

export const tdClass = "border-b border-border px-3 py-2 align-middle last:border-b-0";

export const trHoverClass = "transition-colors hover:bg-black/[.02] dark:hover:bg-white/[.04]";

export const mutedTextClass = "text-sm text-muted";

export const pageClass = "flex w-full flex-col gap-6 px-6 py-8 sm:px-8 lg:px-12 xl:px-16";
