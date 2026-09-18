import { describe, expect, it } from "vitest";
import { parseTestSteps } from "@/lib/import/steps";

/**
 * The rule both sides of the import now depend on: the server writes the rows
 * this returns, and the preview counts them to tell the user what they are
 * about to get. If this drifts, the number on screen starts lying.
 */
describe("parseTestSteps", () => {
  it("makes one step per line", () => {
    expect(parseTestSteps("Open the menu\nChoose Semantic Type")).toEqual([
      "Open the menu",
      "Choose Semantic Type",
    ]);
  });

  it("drops the sheet's own numbering, which the UI adds back itself", () => {
    expect(parseTestSteps("1. Open the menu\n2. Choose Semantic Type")).toEqual([
      "Open the menu",
      "Choose Semantic Type",
    ]);
    expect(parseTestSteps("1) First\n2) Second")).toEqual(["First", "Second"]);
    expect(parseTestSteps("- First\n• Second\n* Third")).toEqual(["First", "Second", "Third"]);
  });

  it("keeps a single-line cell as exactly one step", () => {
    expect(parseTestSteps("Enter valid credentials and click Login")).toEqual([
      "Enter valid credentials and click Login",
    ]);
  });

  it("ignores blank lines and stray whitespace", () => {
    expect(parseTestSteps("  First  \n\n\n   \n  2.  Second  ")).toEqual(["First", "Second"]);
  });

  it("survives Windows line endings", () => {
    expect(parseTestSteps("1. First\r\n2. Second")).toEqual(["First", "Second"]);
  });

  it("leaves numbers that belong to the text alone", () => {
    // Only a marker at the very front goes. "2 items" is the step itself.
    expect(parseTestSteps("Select 2 items from the list")).toEqual([
      "Select 2 items from the list",
    ]);
  });

  it("keeps what was written when a cell is nothing but markers", () => {
    // Rather than leaving the Test Case with no steps at all.
    expect(parseTestSteps("1.")).toEqual(["1."]);
    expect(parseTestSteps("   ")).toEqual([""]);
  });
});
