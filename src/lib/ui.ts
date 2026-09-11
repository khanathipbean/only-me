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

/** Input that reserves room on the right for a control sitting inside it (the
 * show/hide button on a password field). A separate export rather than
 * `${inputClass} pr-10`, because `px-3` and `pr-10` both resolve the right
 * padding and which one wins depends on Tailwind's emit order — the same trap
 * the note on `fieldBaseClass` describes. */
export const inputWithTrailingButtonClass = `block w-full ${fieldBaseClass} py-2 pr-10 pl-3 placeholder:text-muted`;

/** Native `<select>`: `appearance-none` hides the browser's own arrow (which
 * sits flush against the edge and can't be repositioned), replaced by
 * `.select-field` in globals.css — a custom chevron with proper inset. */
export const selectClass = `block w-full ${fieldBaseClass} select-field appearance-none bg-no-repeat py-2 pl-3 pr-9`;

/** Compact `<select>` for a small inline control (e.g. a rows-per-page
 * picker). Widths to its content rather than filling its container, and
 * reserves only enough right padding to clear the chevron — the full-width
 * variant's 36px looks like dead space around a two-digit value. */
export const selectCompactClass = `${fieldBaseClass} select-field appearance-none bg-no-repeat py-1.5 pl-2.5 pr-8`;

/**
 * A square button that lines up with the fields beside it — the Clear filters
 * "×", for instance. Built from the same base, padding and text size as
 * `inputClass`, so its height matches by construction (8px padding + a 20px
 * glyph + 1px border on each side = 38px) instead of by a hardcoded height
 * that would drift the moment the fields change.
 */
export const fieldButtonClass = `inline-flex shrink-0 items-center justify-center ${fieldBaseClass} p-2 text-muted hover:bg-black/[.03] hover:text-foreground dark:hover:bg-white/[.05] [&>svg]:size-5`;

export const textareaClass = `${inputClass} min-h-24`;

/**
 * Shared `<dialog>` chrome. Glass rather than a solid panel: the surface is
 * translucent and blurs what's behind it, echoing the login card.
 *
 * The tint comes from `bg-surface/75` rather than the login card's fixed
 * `bg-white/10`, because a modal opens over either theme — a fixed white
 * wash would be a dark smear on the light theme. Keeping the theme's own
 * surface means every token-based control inside stays readable in both.
 *
 * `text-left` is explicit because `text-align` inherits and a dialog is a
 * descendant of wherever it was declared — mounted inside a centred table
 * cell, every label in the form came out centred.
 *
 * Callers add their own `max-w-*`.
 */
export const dialogClass =
  "m-auto w-full rounded-2xl border border-border bg-surface/75 p-0 text-left text-foreground shadow-2xl ring-1 ring-white/5 backdrop-blur-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm";

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
export const tableClass = "data-table w-full border-collapse text-sm";

/* Alignment is a separate exported variant rather than something a call site
 * appends, because `text-left` and `text-center` both set `text-align` — two
 * of them in one class string resolve by Tailwind's emit order, not by the
 * order they were written. */
const thBaseClass =
  "border-b border-border bg-black/[.02] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted dark:bg-white/[.03]";

export const thClass = `${thBaseClass} text-left`;

/** Header for a column of badges or icon buttons, which centre in their cell. */
export const thCenterClass = `${thBaseClass} text-center`;

/* No `last:border-b-0` here: on a `<td>` that variant matches the last cell
 * *in its row*, so it stripped the bottom border from the trailing column and
 * the divider stopped short of the table's right edge. Suppressing the line
 * under the final row is the table's job — see `tableClass`. */
const tdBaseClass = "border-b border-border px-3 py-2 align-middle";

export const tdClass = `${tdBaseClass} text-left`;

export const tdCenterClass = `${tdBaseClass} text-center`;

export const trHoverClass = "transition-colors hover:bg-black/[.02] dark:hover:bg-white/[.04]";

export const mutedTextClass = "text-sm text-muted";

export const pageClass = "flex w-full flex-col gap-6 px-6 py-8 sm:px-8 lg:px-12 xl:px-16";
