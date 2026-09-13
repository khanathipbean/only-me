import type { SVGProps } from "react";

type IconProps = Omit<SVGProps<SVGSVGElement>, "viewBox" | "fill" | "stroke">;

function IconBase({ className = "size-4", ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...props}
    />
  );
}

export function EditIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
      <path d="m15 5 4 4" />
    </IconBase>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      {/* Lid, then a small handle above it, then a plain tapered body — no
          ribs inside, which turn to mush once the glyph is small. */}
      <path d="M4 7h16" />
      <path d="M9.5 7V5.6a.6.6 0 0 1 .6-.6h3.8a.6.6 0 0 1 .6.6V7" />
      <path d="M6.2 7.8l.85 11.3A2 2 0 0 0 9.04 21h5.92a2 2 0 0 0 1.99-1.9L17.8 7.8" />
    </IconBase>
  );
}

export function LogoutIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15" />
      <path d="M12 9l3 3-3 3M15 12H3" />
    </IconBase>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </IconBase>
  );
}

export function UserPlusIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="9" cy="7" r="4" />
      <path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2" />
      <path d="M19 8v6M22 11h-6" />
    </IconBase>
  );
}

export function ClearIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M6 18L18 6M6 6l12 12" />
    </IconBase>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M9 5l7 7-7 7" />
    </IconBase>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M15 5l-7 7 7 7" />
    </IconBase>
  );
}

/** "Skip to first page" — a chevron pinned against a bar. */
export function FirstPageIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M17 5l-7 7 7 7" />
      <path d="M7 5v14" />
    </IconBase>
  );
}

/** "Skip to last page" — mirrors `FirstPageIcon`. */
export function LastPageIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M7 5l7 7-7 7" />
      <path d="M17 5v14" />
    </IconBase>
  );
}

export function SunIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </IconBase>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </IconBase>
  );
}

export function EyeIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M2.25 12S6 5.25 12 5.25 21.75 12 21.75 12 18 18.75 12 18.75 2.25 12 2.25 12z" />
      <circle cx="12" cy="12" r="3" />
    </IconBase>
  );
}

export function EyeOffIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M3.98 8.22A10.48 10.48 0 001.93 12c1.29 4.34 5.31 7.5 10.07 7.5.99 0 1.95-.14 2.86-.4M6.23 6.23A10.45 10.45 0 0112 4.5c4.76 0 8.77 3.16 10.07 7.5a10.52 10.52 0 01-4.3 5.77M6.23 6.23L3 3m3.23 3.23l3.65 3.65m7.89 7.89L21 21m-3.23-3.23l-3.65-3.65m0 0a3 3 0 10-4.24-4.24" />
    </IconBase>
  );
}

export function MoreVerticalIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="5" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="12" cy="19" r="1" />
    </IconBase>
  );
}

export function ArrowUpRightIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M7 17 17 7M9 7h8v8" />
    </IconBase>
  );
}

/** The plain funnel `FilterOffIcon` strikes through — toggling the full
 * filter panel open, as opposed to clearing it. */
export function FilterIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M21 4H3l7.2 8.5V19l3.6 2v-8.5L21 4z" />
    </IconBase>
  );
}

/** A funnel with a line struck through it — clearing the filters, as opposed
 * to `ClearIcon`, whose × means "close this". */
export function FilterOffIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M21 4H3l7.2 8.5V19l3.6 2v-8.5L21 4z" />
      <path d="M3.5 3.5l17 17" />
    </IconBase>
  );
}

export function FileIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </IconBase>
  );
}

/** Shared page outline for every typed-file icon below, with a short label
 * badged across the bottom — `fill`/`stroke="none"` on the `<text>` since it
 * sits inside `IconBase`, which sets `fill="none"` for the outline paths. */
function FileBadgeIcon({ label, ...props }: IconProps & { label: string }) {
  return (
    <IconBase {...props}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <text
        x="12"
        y="17.6"
        textAnchor="middle"
        fontSize="6.2"
        fontWeight="700"
        letterSpacing="-0.3"
        fill="currentColor"
        stroke="none"
      >
        {label}
      </text>
    </IconBase>
  );
}

export function FilePdfIcon(props: IconProps) {
  return <FileBadgeIcon label="PDF" {...props} />;
}

export function FileWordIcon(props: IconProps) {
  return <FileBadgeIcon label="DOC" {...props} />;
}

export function FileExcelIcon(props: IconProps) {
  return <FileBadgeIcon label="XLS" {...props} />;
}

export function FileCsvIcon(props: IconProps) {
  return <FileBadgeIcon label="CSV" {...props} />;
}

/** Same page outline, with a little mountain-and-sun glyph instead of a
 * label — there's no three-letter shorthand for "image" that reads at 20px. */
export function FileImageIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <circle cx="9.75" cy="12.75" r="1.1" fill="currentColor" stroke="none" />
      <path d="M6.5 18l3.25-3.25a1 1 0 0 1 1.4 0L13.5 17M12 15.5l.75-.75a1 1 0 0 1 1.4 0L16.5 17" />
    </IconBase>
  );
}

/** A 3/4 ring, not a full circle: an unbroken circle gives `animate-spin`
 * nothing to show rotating. Callers add the spin themselves — this icon is
 * also just a static "loading" glyph without it. */
export function SpinnerIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M21 12a9 9 0 1 1-9-9" />
    </IconBase>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </IconBase>
  );
}
