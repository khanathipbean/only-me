import { describe, expect, it } from "vitest";
import {
  WORK_DAYS_BY_PRIORITY,
  addWorkingDays,
  isWorkOverdue,
  workUrgency,
  workingDaysBetween,
} from "@/lib/deadlines";

/** A date at 16:00 local time, so the weekday is unambiguous whatever the
 *  machine's zone does near midnight. */
function at(year: number, month: number, day: number) {
  return new Date(year, month - 1, day, 16, 0, 0);
}

describe("working days", () => {
  it("skips the weekend", () => {
    // Friday 2026-10-16 + 1 working day is Monday, not Saturday.
    const friday = at(2026, 10, 16);
    expect(friday.getDay()).toBe(5);
    const due = addWorkingDays(friday, 1);
    expect(due.getDay()).toBe(1);
    expect(due.getDate()).toBe(19);
  });

  it("starts counting from the next working day when handed over at a weekend", () => {
    const saturday = at(2026, 10, 17);
    expect(saturday.getDay()).toBe(6);
    const due = addWorkingDays(saturday, 1);
    expect(due.getDay()).toBe(1);
    expect(due.getDate()).toBe(19);
  });

  it("runs past a whole week for the longer windows", () => {
    // Monday + 7 working days lands on the Wednesday of the week after next.
    const monday = at(2026, 10, 19);
    expect(monday.getDay()).toBe(1);
    const due = addWorkingDays(monday, 7);
    expect(due.getDay()).toBe(3);
    expect(due.getDate()).toBe(28);
  });

  it("keeps the time of day", () => {
    const due = addWorkingDays(at(2026, 10, 16), 1);
    expect(due.getHours()).toBe(16);
  });

  it("gives every priority a window, worst the shortest", () => {
    expect(WORK_DAYS_BY_PRIORITY).toEqual({ CRITICAL: 1, HIGH: 3, MEDIUM: 5, LOW: 7 });
  });
});

describe("overdue", () => {
  it("is false when no repair is in flight", () => {
    // Not the same as being on time: nobody is on it at all.
    expect(isWorkOverdue({ dueAt: null })).toBe(false);
  });

  it("turns true once the deadline has passed", () => {
    expect(isWorkOverdue({ dueAt: new Date(Date.now() - 1000) })).toBe(true);
    expect(isWorkOverdue({ dueAt: new Date(Date.now() + 60_000) })).toBe(false);
  });
});

describe("working days between two dates", () => {
  it("counts by the calendar, not the clock", () => {
    // Monday afternoon to Tuesday morning is one day, the same as the other
    // way round — otherwise "one day left" would depend on what time of day
    // the case happened to be handed over.
    expect(workingDaysBetween(at(2026, 10, 19), new Date(2026, 9, 20, 9))).toBe(1);
    expect(workingDaysBetween(new Date(2026, 9, 19, 9), at(2026, 10, 20))).toBe(1);
  });

  it("is zero on the same day, and backwards", () => {
    expect(workingDaysBetween(at(2026, 10, 19), at(2026, 10, 19))).toBe(0);
    expect(workingDaysBetween(at(2026, 10, 20), at(2026, 10, 19))).toBe(0);
  });

  it("leaves the weekend out", () => {
    // Friday to Monday is one working day, not three.
    expect(workingDaysBetween(at(2026, 10, 16), at(2026, 10, 19))).toBe(1);
  });
});

describe("how worried to be", () => {
  const monday = at(2026, 10, 19);

  it("is red once the deadline has passed", () => {
    expect(workUrgency({ dueAt: at(2026, 10, 16), priority: "LOW" }, monday)).toBe("red");
  });

  it("says nothing when no repair is in flight", () => {
    expect(workUrgency({ dueAt: null, priority: "HIGH" }, monday)).toBeNull();
  });

  it("is green while more than half the window is left", () => {
    // Low: seven days, all of them still ahead.
    const due = addWorkingDays(monday, 7);
    expect(workUrgency({ dueAt: due, priority: "LOW" }, monday)).toBe("green");
  });

  it("turns amber once half the window has gone", () => {
    const due = addWorkingDays(monday, 3);
    expect(workUrgency({ dueAt: due, priority: "LOW" }, monday)).toBe("amber");
  });

  it("is amber from the start for Critical, which has nowhere else to go", () => {
    /* One working day in total. A rule counting days left would take it from
       green straight to red, skipping the colour that exists to warn. */
    const due = addWorkingDays(monday, 1);
    expect(workUrgency({ dueAt: due, priority: "CRITICAL" }, monday)).toBe("amber");
  });

  it("is amber on the last day of a long window too", () => {
    const due = addWorkingDays(monday, 1);
    expect(workUrgency({ dueAt: due, priority: "LOW" }, monday)).toBe("amber");
  });
});
