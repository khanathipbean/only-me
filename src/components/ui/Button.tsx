import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";
import { Tooltip } from "@/components/ui/Tooltip";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

const BASE_CLASS =
  "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-50";

export type ButtonSize = "md" | "lg";

/** Height, padding and text size live here rather than in `className` on the
 * call site: `h-9` and `h-11` both set `height`, so appending one to the other
 * doesn't reliably override — Tailwind's emit order decides, not the order
 * they're written. Composing from a fixed set sidesteps that entirely. */
const SIZE_CLASS: Record<ButtonSize, string> = {
  md: "h-9 px-3.5 text-sm",
  lg: "h-11 px-5 text-base",
};

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  /* Built from the theme's own foreground/background rather than the brand
   * accent, so the primary button can't clash with the palette: on the dark
   * charcoal theme it's near-white on black, on the light one near-black on
   * white. The brand colour stays what it is — a link and focus accent. */
  primary: "bg-foreground text-background hover:bg-foreground/85",
  secondary:
    "border border-border bg-surface text-foreground hover:bg-black/[.03] dark:hover:bg-white/[.05]",
  danger: "bg-red-600 text-white hover:bg-red-700",
  ghost: "text-muted hover:bg-black/[.05] hover:text-foreground dark:hover:bg-white/[.08]",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      className={`${BASE_CLASS} ${SIZE_CLASS[size]} ${VARIANT_CLASS[variant]} ${className}`}
      {...props}
    />
  );
}

export function LinkButton({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <Link
      className={`${BASE_CLASS} ${SIZE_CLASS[size]} ${VARIANT_CLASS[variant]} ${className}`}
      {...props}
    />
  );
}

const ICON_BUTTON_BASE_CLASS =
  "inline-flex size-9 shrink-0 items-center justify-center rounded-md transition-colors disabled:pointer-events-none disabled:opacity-50";

/** The glyph size, kept off the base class and out of `className`: it's set
 * through the `[&>svg]` variant, which outranks any `size-*` the icon itself
 * carries, so a caller can't enlarge a glyph by styling the icon. The button
 * box stays 36px either way, so a bigger glyph doesn't break row alignment. */
const ICON_SIZE_CLASS = {
  md: "[&>svg]:size-4",
  lg: "[&>svg]:size-6",
} as const;

export type IconSize = keyof typeof ICON_SIZE_CLASS;

/**
 * A fixed-size, perfectly centered square button for a single icon — e.g.
 * Edit, Delete, Log out, Clear filters.
 *
 * A `title` grows a styled `Tooltip` around the button instead of just
 * sitting on the element as a bare attribute: a native title tooltip is slow
 * to appear and styled by the OS, not this app. It's popped off `props` so it
 * doesn't ALSO render as a native tooltip stacked behind the styled one.
 */
export function IconButton({
  variant = "ghost",
  iconSize = "md",
  className = "",
  title,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  iconSize?: IconSize;
}) {
  const button = (
    <button
      className={`${ICON_BUTTON_BASE_CLASS} ${ICON_SIZE_CLASS[iconSize]} ${VARIANT_CLASS[variant]} ${className}`}
      {...props}
    />
  );
  return title ? <Tooltip label={title}>{button}</Tooltip> : button;
}

/**
 * `IconButton` that navigates — the same square as `IconButton` but rendered as
 * a `Link`, the way `LinkButton` mirrors `Button`. Used for the per-row "open
 * the detail page" arrow in the list tables, where a real link (middle-click,
 * open in new tab, prefetch) is the right element and a `<button>` isn't.
 * Pass an accessible name via `aria-label`: the icon alone leaves none.
 */
export function IconLinkButton({
  variant = "ghost",
  iconSize = "md",
  className = "",
  title,
  ...props
}: ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  iconSize?: IconSize;
  title?: string;
}) {
  const link = (
    <Link
      className={`${ICON_BUTTON_BASE_CLASS} ${ICON_SIZE_CLASS[iconSize]} ${VARIANT_CLASS[variant]} ${className}`}
      {...props}
    />
  );
  return title ? <Tooltip label={title}>{link}</Tooltip> : link;
}
