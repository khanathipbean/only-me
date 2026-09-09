/** Shared Tailwind class strings for native form/table elements, kept as plain
 * strings (not components) so `name`/`defaultValue` on uncontrolled
 * server-action forms keep working unchanged. */

const fieldBaseClass =
  "block w-full rounded-md border border-border bg-surface py-2 text-sm text-foreground shadow-sm outline-none transition-colors focus:border-brand focus:ring-1 focus:ring-brand";

export const inputClass = `${fieldBaseClass} px-3 placeholder:text-muted`;

/** Native `<select>`: `appearance-none` hides the browser's own arrow (which
 * sits flush against the edge and can't be repositioned), replaced by
 * `.select-field` in globals.css — a custom chevron with proper inset. */
export const selectClass = `${fieldBaseClass} select-field appearance-none bg-no-repeat pl-3 pr-9`;

export const textareaClass = `${inputClass} min-h-24`;

export const checkboxClass = "size-4 rounded border-border text-brand focus:ring-brand";

export const labelClass = "flex flex-col gap-1.5 text-sm font-medium text-foreground";

export const formRowClass = "flex flex-wrap items-end gap-3";

export const tableWrapClass = "overflow-x-auto rounded-lg border border-border";

export const tableClass = "w-full min-w-max border-collapse text-sm";

export const thClass =
  "border-b border-border bg-black/[.02] px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted dark:bg-white/[.03]";

export const tdClass = "border-b border-border px-3 py-2 align-middle last:border-b-0";

export const trHoverClass = "transition-colors hover:bg-black/[.02] dark:hover:bg-white/[.04]";

export const mutedTextClass = "text-sm text-muted";

export const pageClass = "flex w-full flex-col gap-6 px-6 py-8 sm:px-8 lg:px-12 xl:px-16";
