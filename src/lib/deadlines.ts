import type { Priority, ProjectStatus, TestRunStatus } from "@/generated/prisma/client";

/** A Project is overdue once its end date has passed while it's still DRAFT or ACTIVE. */
export function isProjectOverdue(project: { status: ProjectStatus; endDate: Date | null }) {
  return Boolean(project.endDate) && project.status !== "COMPLETED" && project.endDate! < new Date();
}

/** A Test Run is overdue once its end date has passed while it's still OPEN. */
export function isTestRunOverdue(run: { status: TestRunStatus; endsOn: Date | null }) {
  return Boolean(run.endsOn) && run.status === "OPEN" && run.endsOn! < new Date();
}

/**
 * How long a repair is given, in working days, by how bad the case is.
 *
 * Medium was asked for as "3-5" and Low as "7". A deadline has to be one
 * date, so the upper bound is what is promised: a range would mean either two
 * dates to explain or a deadline that arrives before anybody expected it.
 */
export const WORK_DAYS_BY_PRIORITY: Record<Priority, number> = {
  CRITICAL: 1,
  HIGH: 3,
  MEDIUM: 5,
  LOW: 7,
};

/**
 * `days` working days after `from`, Saturday and Sunday skipped.
 *
 * Working days rather than calendar days because the shortest window is one
 * day: a Critical case handed over at four on a Friday afternoon would
 * otherwise be late before anybody was back at a desk.
 *
 * No holiday calendar, deliberately. One would have to be maintained by hand,
 * per country, and be wrong the first year nobody updated it — a deadline one
 * day out is a smaller problem than a deadline nobody trusts. The time of day
 * is kept, so Friday 16:00 plus one working day is Monday 16:00.
 */
export function addWorkingDays(from: Date, days: number): Date {
  const result = new Date(from);
  let remaining = days;
  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    const weekday = result.getDay();
    if (weekday !== 0 && weekday !== 6) {
      remaining -= 1;
    }
  }
  return result;
}

/** A repair is overdue once its deadline has passed. Null means no repair is
 *  in flight, which is not the same as being on time. */
export function isWorkOverdue(testCase: { dueAt: Date | null }) {
  return Boolean(testCase.dueAt) && testCase.dueAt! < new Date();
}

/** Midnight, so "how many days apart" does not depend on the time of day two
 *  dates happen to carry. */
function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/**
 * Working days from one date to another, counted by the calendar rather than
 * by the clock: Monday afternoon to Tuesday morning is one day, the same as
 * Monday morning to Tuesday afternoon. Zero when `to` is not after `from`.
 */
export function workingDaysBetween(from: Date, to: Date): number {
  const start = startOfDay(from);
  const end = startOfDay(to);
  if (end <= start) {
    return 0;
  }
  let count = 0;
  const cursor = new Date(start);
  while (cursor < end) {
    cursor.setDate(cursor.getDate() + 1);
    const weekday = cursor.getDay();
    if (weekday !== 0 && weekday !== 6) {
      count += 1;
    }
  }
  return count;
}

export type WorkUrgency = "green" | "amber" | "red";

/**
 * How worried to be about a repair, as a proportion of the window it was
 * given rather than a fixed number of days left.
 *
 * A fixed rule — "two days left turns amber" — cannot work here, because the
 * windows run from one working day to seven. A Critical case has one day in
 * total, so two days left is a state it is never in: it would go from green
 * straight to red, which is the one transition a warning colour exists to
 * prevent.
 *
 * Critical is therefore amber from the moment it is handed over, and that is
 * correct rather than a rounding artefact: a repair due tomorrow is urgent on
 * the day it arrives.
 */
export function workUrgency(
  work: { dueAt: Date | null; priority: Priority },
  now: Date = new Date(),
): WorkUrgency | null {
  if (!work.dueAt) {
    return null;
  }
  if (work.dueAt < now) {
    return "red";
  }
  const remaining = workingDaysBetween(now, work.dueAt);
  const window = WORK_DAYS_BY_PRIORITY[work.priority];
  /* Half the window gone, or down to the last day — whichever comes first.
   * The second half of that test is what catches the short windows, where
   * half of one day is not a number of days at all. */
  return remaining <= 1 || remaining * 2 <= window ? "amber" : "green";
}
