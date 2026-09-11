/**
 * A round monogram for someone with no uploaded picture — their initial on a
 * brand-coloured disc.
 *
 * The letter is decorative: on its own it tells a screen reader nothing, and
 * replacing the email text with it would otherwise lose who is signed in. The
 * full name sits beside it in an `sr-only` span, and `title` puts it back
 * within reach of a mouse.
 */
export function Avatar({ name, title }: { name: string; title?: string }) {
  // `trim()` first: a leading space would otherwise become the "initial".
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  return (
    <span
      title={title ?? name}
      /* Neutral, not `bg-brand`: the theme is charcoal now, and the indigo
         accent read as a leftover from the old palette. A quiet disc also
         keeps it from looking like the primary button — this marks who you
         are, it isn't a call to action. */
      className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-black/[.06] text-sm font-semibold text-foreground select-none dark:bg-white/[.10]"
    >
      <span aria-hidden="true">{initial}</span>
      <span className="sr-only">{name}</span>
    </span>
  );
}
