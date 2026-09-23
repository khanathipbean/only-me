import type { ReactNode } from "react";

const TONE_CLASS = {
  gray: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  green: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  red: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  purple: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  indigo: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  cyan: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300",
} as const;

export type Tone = keyof typeof TONE_CLASS;

/** Solid fill for a meter/bar segment — stronger than the Badge pill's soft background. */
const TONE_BAR_CLASS = {
  gray: "bg-slate-400 dark:bg-slate-500",
  blue: "bg-blue-500",
  green: "bg-emerald-500",
  red: "bg-red-500",
  amber: "bg-amber-500",
  purple: "bg-purple-500",
  indigo: "bg-indigo-500",
  cyan: "bg-cyan-500",
} as const satisfies Record<Tone, string>;

export function toneBarClass(tone: Tone): string {
  return TONE_BAR_CLASS[tone];
}

/**
 * A filled pill says "this is a state" — a status, a priority, a result. The
 * outline is for something that is only a name: a Feature, which groups
 * Requirements inside a Module without meaning anything on its own.
 *
 * The distinction is not decoration. Every filled tone in this file is spoken
 * for (red is FAILED and CRITICAL, amber is BLOCKED, and so on), so a label
 * wearing one borrows a meaning it doesn't have — and a Requirement row showed
 * two cyan pills side by side, one naming the level and one naming the
 * Feature.
 *
 * Quiet, not absent. The first attempt used the muted text colour and the
 * table's own border token, which made it read as a disabled chip rather than
 * a label — the same weight as the "1 scenario(s)" beside it, on a border the
 * same weight as the row divider under it. It has a faint fill and its own
 * foreground now, so it reads as a discrete thing without taking a colour that
 * means something.
 */
const OUTLINE_CLASS =
  "border border-muted/35 bg-muted/10 text-foreground/80 dark:bg-muted/15";

export function Badge({
  tone,
  variant = "solid",
  children,
}: {
  tone: Tone;
  variant?: "solid" | "outline";
  children: ReactNode;
}) {
  return (
    <span
      // `w-fit` because `inline-flex` stops deciding the width once the pill
      // is a flex or grid item: a column container stretches it to the full
      // width by default, and the Test Group preview showed a DRAFT pill run
      // the whole way across the dialog. A pill is only ever as wide as what
      // it says, so the rule belongs here rather than on each caller — the
      // two callers beside that one were already wrapping their badges in a
      // row `<div>`, which hid the same trap.
      className={`inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${
        variant === "outline" ? OUTLINE_CLASS : TONE_CLASS[tone]
      }`}
    >
      {children}
    </span>
  );
}

export function testResultTone(value: string): Tone {
  switch (value) {
    case "PASSED":
      return "green";
    case "FAILED":
      return "red";
    case "BLOCKED":
      return "amber";
    case "SKIPPED":
      return "purple";
    default:
      return "gray"; // NOT_RUN
  }
}

export function priorityTone(value: string): Tone {
  switch (value) {
    case "CRITICAL":
      return "red";
    case "HIGH":
      return "amber";
    case "MEDIUM":
      return "blue";
    default:
      return "gray"; // LOW
  }
}

export function workflowStatusTone(value: string): Tone {
  switch (value) {
    case "READY":
      return "blue";
    case "IN_PROGRESS":
      return "amber";
    case "COMPLETED":
      return "green";
    default:
      return "gray"; // DRAFT
  }
}

export function projectStatusTone(value: string): Tone {
  switch (value) {
    case "ACTIVE":
      return "green";
    case "COMPLETED":
      return "blue";
    default:
      return "gray"; // DRAFT
  }
}

export function roleTone(value: string): Tone {
  switch (value) {
    case "ADMIN":
      return "purple";
    case "QA_LEAD":
      return "blue";
    case "TESTER":
      return "green";
    default:
      return "gray"; // VIEWER
  }
}
