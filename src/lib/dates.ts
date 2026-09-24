/**
 * One timezone for the whole app, not the reader's own.
 *
 * These timestamps are rendered on the server, which has no way of knowing
 * the viewer's zone — and the server itself runs in UTC, so formatting
 * without saying anything would quietly show every Thai reader a time seven
 * hours before the one they remember.
 *
 * A fixed zone is also the more useful answer for a team in one place: two
 * people looking at the same record read the same string and can talk about
 * it. Change this if the team stops being in one place; per-viewer time needs
 * a client component, since the zone only exists in the browser.
 */
const TIME_ZONE = "Asia/Bangkok";

/** Built once: constructing a formatter is the expensive part, and this one
 *  never varies. */
const TIMESTAMP = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** A moment someone can read: "13 Sept 2026, 19:59". Seconds are dropped —
 *  nothing here is decided by them, and the exact value stays one hover away
 *  wherever this is paired with the ISO string. */
export function formatTimestamp(date: Date): string {
  return TIMESTAMP.format(date);
}

/** Built once, same reasoning as `TIMESTAMP` above. `en-GB`, not `en-US`:
 *  day first, the order this team reads and writes dates in, and the order
 *  `TIMESTAMP` above already renders. Two date formats disagreeing about
 *  which number is the month is the kind of thing nobody notices until a
 *  deadline is read wrong. */
const DATE_ONLY = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** A day with no time on it: "11 Sept 2026" — for a date that only ever
 *  means a day (created-on, due-by), where a time of day would just be
 *  midnight UTC dressed up as information. */
export function formatDate(date: Date): string {
  return DATE_ONLY.format(date);
}

/**
 * The `yyyy-mm-dd` an `<input type="date">` requires — **not** something to
 * show anyone.
 *
 * It looks like a formatter and is not one: the HTML spec fixes this shape,
 * so it is the one date string in the app that must never follow the reading
 * order above. It lived as a private copy in two pages, where it was also
 * being used for display, which is how a run's dates came out as
 * "2026-09-01 → 2026-09-15" in the header. Named for the input so the next
 * person reaches for `formatDate` when they mean to show a date.
 *
 * `toISOString` and not a local formatting: these are stored at UTC midnight
 * and mean a day, so the UTC calendar day is the right one to hand back.
 */
export function toDateInputValue(date: Date | null | undefined): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * "2 min ago" / "3 hours ago" / "13 Sept 2026, 19:59" past a week. Unlike
 * `formatTimestamp`, this reads `Date.now()` and so only means anything in
 * the browser — every caller today is already a Client Component (the
 * notification panel), which sidesteps the server/fixed-timezone rationale
 * above rather than contradicting it.
 */
export function formatRelativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  if (diff < MINUTE) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} min ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} hour${Math.floor(diff / HOUR) === 1 ? "" : "s"} ago`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)} day${Math.floor(diff / DAY) === 1 ? "" : "s"} ago`;
  return formatTimestamp(date);
}
