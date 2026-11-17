export class LinkValidationError extends Error {}

/** The longest address that will be stored. Well past anything a person
 *  pastes by hand, and short of the point where a row is mostly one column. */
export const MAX_URL_LENGTH = 2048;

/**
 * The address, or a refusal.
 *
 * The app renders this into an `href`, which makes the scheme the whole
 * question: a stored `javascript:alert(document.cookie)` is a script that
 * runs on this app's own origin the moment a colleague clicks the row, with
 * that colleague's session. An allow-list of two schemes is the guard, and it
 * has to live here rather than in the form — the form is a convenience, and
 * the next caller (an import, a seed, an API) does not go through it.
 *
 * Deliberately not a regular expression. `new URL` is the parser the browser
 * will use on the way out, so agreeing with it is the point; a pattern of my
 * own would be a second opinion about what an address is, and the browser's
 * is the one that decides what runs.
 *
 * In its own file, with nothing imported, so it can be tested as what it is:
 * a pure function about a string. Everything else in `@/lib/links` opens a
 * database connection at import time, and a guard that can only be exercised
 * with Postgres running is a guard that stops being exercised.
 */
export function assertSafeUrl(raw: string): string {
  const text = raw?.trim() ?? "";
  if (!text) {
    throw new LinkValidationError("Address is required");
  }
  if (text.length > MAX_URL_LENGTH) {
    throw new LinkValidationError(`Address is longer than ${MAX_URL_LENGTH} characters`);
  }

  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    /* Named rather than general: "that is not a web address" sends people
     * looking at what they pasted, where "invalid input" sends them nowhere. */
    throw new LinkValidationError(
      "That is not a web address — it needs to start with http:// or https://",
    );
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new LinkValidationError(
      `Only http:// and https:// addresses can be stored, not ${parsed.protocol}`,
    );
  }
  /* `parsed.href`, not the text as typed: the parser has already resolved the
   * casing of the scheme and host and encoded what had to be encoded, so what
   * is stored is what a browser would actually go to. */
  return parsed.href;
}
