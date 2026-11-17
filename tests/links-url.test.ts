import { describe, expect, it } from "vitest";
import { LinkValidationError, MAX_URL_LENGTH, assertSafeUrl } from "@/lib/links-url";

/**
 * The guard on a pasted address.
 *
 * This is the one piece of the Links feature where being wrong is not a bug
 * but a hole: the page renders what is stored here straight into an `href`,
 * so a scheme that gets through runs on this app's own origin, in the
 * session of whoever clicks the row. The refusals below are the feature.
 */
describe("storing a pasted address", () => {
  it("keeps an ordinary https address", () => {
    expect(assertSafeUrl("https://maholan.atlassian.net/browse/PROM-412")).toBe(
      "https://maholan.atlassian.net/browse/PROM-412",
    );
  });

  it("keeps a plain http one too", () => {
    /* Not everything inside an office network has a certificate, and refusing
       http would mean the environment under test could not be linked to —
       which is one of the addresses this exists for. */
    expect(assertSafeUrl("http://uat.internal:8080/policy")).toBe(
      "http://uat.internal:8080/policy",
    );
  });

  it("refuses a javascript: address", () => {
    /* The whole reason for the allow-list. Stored, this becomes a script that
       runs when a colleague clicks the row. */
    expect(() => assertSafeUrl("javascript:alert(document.cookie)")).toThrow(
      LinkValidationError,
    );
  });

  it("refuses the schemes that hide the same trick", () => {
    for (const address of [
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "file:///C:/Windows/System32/drivers/etc/hosts",
      // Parsed by `new URL` as a scheme, not as a path — so it needs refusing.
      "about:blank",
    ]) {
      expect(() => assertSafeUrl(address), address).toThrow(LinkValidationError);
    }
  });

  it("is not fooled by the scheme's casing or by leading space", () => {
    /* Both are what somebody trying it would reach for first, and both come
       back through `new URL`'s own normalising rather than through a pattern
       of ours that would have to think of them. */
    expect(() => assertSafeUrl("  JavaScript:alert(1)")).toThrow(LinkValidationError);
    expect(() => assertSafeUrl("JAVASCRIPT:alert(1)")).toThrow(LinkValidationError);
  });

  it("refuses something that is not an address at all", () => {
    for (const text of ["", "   ", "the Jira one", "maholan.atlassian.net"]) {
      expect(() => assertSafeUrl(text), JSON.stringify(text)).toThrow(LinkValidationError);
    }
  });

  it("refuses one longer than the column should hold", () => {
    const long = `https://example.com/${"a".repeat(MAX_URL_LENGTH)}`;
    expect(() => assertSafeUrl(long)).toThrow(/longer than/);
  });

  it("stores what a browser would go to, not what was typed", () => {
    /* The host lower-cased and the space encoded: the stored address and the
       one the browser opens have to be the same string, or the Audit Trail
       records a journey nobody took. */
    expect(assertSafeUrl("HTTPS://Maholan.CO.TH/a b")).toBe("https://maholan.co.th/a%20b");
  });

  it("says which scheme it refused", () => {
    /* A refusal that does not say what was wrong sends people back to paste
       the same thing again. */
    expect(() => assertSafeUrl("ftp://files.example.com/x")).toThrow(/ftp:/);
  });
});
