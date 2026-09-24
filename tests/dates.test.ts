import { describe, expect, it } from "vitest";
import { formatDate, formatTimestamp, toDateInputValue } from "@/lib/dates";

/* These two formats used to disagree about which number is the month:
 * `formatTimestamp` read day-first and `formatDate` month-first, on the same
 * page. And a third shape — the raw `yyyy-mm-dd` an <input type="date">
 * needs — was being printed at readers as if it were one of them. */
describe("dates", () => {
  const day = new Date("2026-09-16T00:00:00.000Z");

  it("puts the day before the month, and names the month so neither can be misread", () => {
    const formatted = formatDate(day);
    expect(formatted).toContain("16");
    expect(formatted).toContain("2026");
    expect(formatted).toMatch(/^16 \D/);
    // Never the numeric form, where 16/09 and 09/16 are one typo apart.
    expect(formatted).not.toMatch(/^\d+[/-]\d+/);
  });

  it("agrees with the timestamp format about the order", () => {
    const at = new Date("2026-09-16T12:59:46.988Z");
    expect(formatTimestamp(at)).toMatch(/^16 /);
    expect(formatDate(day)).toMatch(/^16 /);
  });

  it("keeps Asia/Bangkok, so a late-evening UTC moment is not shown as the day before", () => {
    // 23:30 in Bangkok on the 16th; 16:30 UTC.
    expect(formatTimestamp(new Date("2026-09-16T16:30:00.000Z"))).toMatch(/^16 /);
    // And 07:00 in Bangkok on the 17th, which is still the 16th in UTC.
    expect(formatTimestamp(new Date("2026-09-17T00:00:00.000Z"))).toMatch(/^17 /);
  });

  it("gives an <input type=\"date\"> the yyyy-mm-dd it requires, whatever the reading order", () => {
    // The one date string that must not follow the rule above: the HTML spec
    // fixes this shape, and the control renders blank if it is anything else.
    expect(toDateInputValue(day)).toBe("2026-09-16");
    expect(toDateInputValue(null)).toBe("");
    expect(toDateInputValue(undefined)).toBe("");
  });
});
