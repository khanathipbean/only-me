import type { ReactNode } from "react";

const TONE_CLASS = {
  gray: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  green: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  red: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  purple: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
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
} as const satisfies Record<Tone, string>;

export function toneBarClass(tone: Tone): string {
  return TONE_BAR_CLASS[tone];
}

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${TONE_CLASS[tone]}`}
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
