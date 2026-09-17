import { describe, expect, it } from "vitest";
import { withToast } from "@/lib/toast";

describe("withToast", () => {
  it("adds a message to a bare path", () => {
    expect(withToast("/projects/p1/modules", "Module archived")).toBe(
      "/projects/p1/modules?toast=Module+archived",
    );
  });

  it("keeps the filters and page already on the href", () => {
    // Load-bearing: every list page builds its redirect target with the page
    // it was on, so a toast must not be what sends the user back to page 1.
    const href = withToast("/projects/p1/modules?search=policy&page=3", "Module archived");
    const params = new URLSearchParams(href.split("?")[1]);
    expect(params.get("search")).toBe("policy");
    expect(params.get("page")).toBe("3");
    expect(params.get("toast")).toBe("Module archived");
  });

  it("escapes a message carrying a destination name", () => {
    const href = withToast("/projects/p1/modules", "Moved to Policy & Controls");
    expect(new URLSearchParams(href.split("?")[1]).get("toast")).toBe(
      "Moved to Policy & Controls",
    );
  });

  it("replaces a message rather than stacking a second one", () => {
    const href = withToast(withToast("/x", "First"), "Second");
    expect(new URLSearchParams(href.split("?")[1]).getAll("toast")).toEqual(["Second"]);
  });
});
