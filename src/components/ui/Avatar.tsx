/**
 * A round monogram for someone with no uploaded picture — their initial on a
 * brand-coloured disc. Given `src`, shows their uploaded picture instead.
 *
 * The letter (or picture) is decorative: on its own it tells a screen reader
 * nothing, and replacing the email text with it would otherwise lose who is
 * signed in. The full name sits beside it in an `sr-only` span, and `title`
 * puts it back within reach of a mouse.
 */
export function Avatar({
  name,
  title,
  src,
  size = "size-8",
}: {
  name: string;
  title?: string;
  /** Route serving the picture's bytes, e.g. `/api/users/{id}/avatar`. */
  src?: string | null;
  /** Tailwind size utility — the header trigger and the profile page's
   * larger preview aren't the same disc. */
  size?: string;
}) {
  // `trim()` first: a leading space would otherwise become the "initial".
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  if (src) {
    return (
      // A plain <img>, not next/image: the source is an authenticated route
      // whose dimensions aren't known ahead of time, same reasoning as
      // FilePreview's inline image preview.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        title={title ?? name}
        className={`${size} shrink-0 rounded-full border border-border object-cover select-none`}
      />
    );
  }

  return (
    <span
      title={title ?? name}
      /* Neutral, not `bg-brand`: the theme is charcoal now, and the indigo
         accent read as a leftover from the old palette. A quiet disc also
         keeps it from looking like the primary button — this marks who you
         are, it isn't a call to action. */
      className={`flex ${size} shrink-0 items-center justify-center rounded-full border border-border bg-black/[.06] text-sm font-semibold text-foreground select-none dark:bg-white/[.10]`}
    >
      <span aria-hidden="true">{initial}</span>
      <span className="sr-only">{name}</span>
    </span>
  );
}
