import { describe, expect, it } from "vitest";
import { errorHref, listHrefWithFilters } from "@/lib/hrefs";

describe("sending a reader back to a list with a message", () => {
  it("keeps the filters they had set", () => {
    const { query } = listHrefWithFilters("/projects", {
      search: "login",
      status: "ACTIVE",
      page: 3,
    });

    const href = errorHref("/projects", query, "Project code already exists");
    const params = new URLSearchParams(href.split("?")[1]);

    // The bug this exists for: the message arrived, the filters did not, and
    // somebody on page three of a filtered list landed on page one of an
    // unfiltered one.
    expect(params.get("search")).toBe("login");
    expect(params.get("status")).toBe("ACTIVE");
    expect(params.get("page")).toBe("3");
    expect(params.get("error")).toBe("Project code already exists");
  });

  it("encodes a message that would otherwise break the URL", () => {
    const href = errorHref("/members", "", "Email & name can't both be blank");

    expect(href).not.toContain("& name");
    expect(new URLSearchParams(href.split("?")[1]).get("error")).toBe(
      "Email & name can't both be blank",
    );
  });

  it("carries the extras that are not filters", () => {
    const href = errorHref("/members", "", "Nope", { userId: "u1" });

    expect(new URLSearchParams(href.split("?")[1]).get("userId")).toBe("u1");
  });

  it("leaves out an extra with nothing in it", () => {
    const href = errorHref("/members", "", "Nope", { userId: undefined });

    expect(href).not.toContain("userId");
  });

  it("writes the message under the name the page reads it by", () => {
    /* Some pages have several error slots — one for the name form, one for
     * the password form, one for the picture — and a message in the wrong
     * one appears under the wrong heading. */
    const href = errorHref("/profile", "", "Too short", {}, "passwordError");
    const params = new URLSearchParams(href.split("?")[1]);

    expect(params.get("passwordError")).toBe("Too short");
    expect(params.get("error")).toBeNull();
  });

  it("replaces a stale message rather than adding a second one", () => {
    const href = errorHref("/projects", "error=Something+old", "Something new");

    expect(new URLSearchParams(href.split("?")[1]).getAll("error")).toEqual(["Something new"]);
  });
});
