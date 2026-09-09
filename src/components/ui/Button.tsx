import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

const BASE_CLASS =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-md px-3.5 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "bg-brand text-white hover:bg-brand-hover",
  secondary:
    "border border-border bg-surface text-foreground hover:bg-black/[.03] dark:hover:bg-white/[.05]",
  danger: "bg-red-600 text-white hover:bg-red-700",
  ghost: "text-muted hover:bg-black/[.05] hover:text-foreground dark:hover:bg-white/[.08]",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button className={`${BASE_CLASS} ${VARIANT_CLASS[variant]} ${className}`} {...props} />
  );
}

export function LinkButton({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link className={`${BASE_CLASS} ${VARIANT_CLASS[variant]} ${className}`} {...props} />;
}

const ICON_BUTTON_BASE_CLASS =
  "inline-flex size-9 shrink-0 items-center justify-center rounded-md transition-colors disabled:pointer-events-none disabled:opacity-50 [&>svg]:size-4";

/** A fixed-size, perfectly centered square button for a single icon — e.g. Edit, Delete, Log out, Clear filters. */
export function IconButton({
  variant = "ghost",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button className={`${ICON_BUTTON_BASE_CLASS} ${VARIANT_CLASS[variant]} ${className}`} {...props} />
  );
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
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return (
    <Link className={`${ICON_BUTTON_BASE_CLASS} ${VARIANT_CLASS[variant]} ${className}`} {...props} />
  );
}
