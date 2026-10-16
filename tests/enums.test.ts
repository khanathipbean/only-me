import { describe, expect, it } from "vitest";
import {
  ChoiceError,
  PRIORITY_VALUES,
  PROJECT_STATUS_VALUES,
  TEST_TYPE_VALUES,
  readChoice,
  readChoiceIfPresent,
  readFilterChoice,
  readOptionalChoice,
} from "@/lib/enums";

describe("reading a fixed set of values off a form", () => {
  it("returns a value the field is allowed to hold", () => {
    expect(readChoice("ACTIVE", PROJECT_STATUS_VALUES, "Status")).toBe("ACTIVE");
  });

  it("refuses one it is not, and names what it would have taken", () => {
    /* The behaviour this replaced: the value went to Prisma untouched, Prisma
     * threw its own invocation error, the page's catch only knew about its
     * own ValidationError, and the reader got a crash page. */
    expect(() => readChoice("DROP TABLE", PROJECT_STATUS_VALUES, "Status")).toThrow(ChoiceError);
    expect(() => readChoice("DROP TABLE", PROJECT_STATUS_VALUES, "Status")).toThrow(
      /DRAFT, ACTIVE, COMPLETED/,
    );
  });

  it("refuses a field that was not sent at all", () => {
    expect(() => readChoice(null, PRIORITY_VALUES, "Priority")).toThrow(ChoiceError);
  });

  it("refuses a file where a choice belongs", () => {
    // `formData.get` returns a File for a file input, so a renamed field can
    // arrive as one. `as never` would have passed the object straight through.
    const file = new File(["x"], "sneaky.txt");
    expect(() => readChoice(file, PRIORITY_VALUES, "Priority")).toThrow(ChoiceError);
  });

  it("is case-sensitive, because the column is", () => {
    expect(() => readChoice("active", PROJECT_STATUS_VALUES, "Status")).toThrow(ChoiceError);
  });

  describe("a field that may be left empty", () => {
    it("reads blank as nothing chosen", () => {
      expect(readOptionalChoice("", TEST_TYPE_VALUES, "Test Type")).toBeNull();
      expect(readOptionalChoice(null, TEST_TYPE_VALUES, "Test Type")).toBeNull();
    });

    it("still refuses a value that is neither blank nor allowed", () => {
      expect(() => readOptionalChoice("MAYBE", TEST_TYPE_VALUES, "Test Type")).toThrow(ChoiceError);
    });
  });
});

describe("a field a JSON body is allowed to leave out", () => {
  it("reads absent as not provided, so the column keeps what it had", () => {
    /* The distinction that cost thirty-three tests in one go: the strict
     * reader is right for a form, which always submits its select, and wrong
     * for a PATCH that names only the fields it touches. */
    expect(readChoiceIfPresent(undefined, PROJECT_STATUS_VALUES, "Status")).toBeUndefined();
    expect(readChoiceIfPresent(null, PROJECT_STATUS_VALUES, "Status")).toBeUndefined();
    expect(readChoiceIfPresent("", PROJECT_STATUS_VALUES, "Status")).toBeUndefined();
  });

  it("still refuses a value the column cannot hold", () => {
    expect(() => readChoiceIfPresent("WHENEVER", PROJECT_STATUS_VALUES, "Status")).toThrow(
      ChoiceError,
    );
  });

  it("passes a real value through", () => {
    expect(readChoiceIfPresent("COMPLETED", PROJECT_STATUS_VALUES, "Status")).toBe("COMPLETED");
  });
});

describe("narrowing a list by a value that cannot exist", () => {
  it("is treated as no filter rather than an error", () => {
    expect(readFilterChoice("NONSENSE", PROJECT_STATUS_VALUES)).toBeUndefined();
    expect(readFilterChoice(null, PROJECT_STATUS_VALUES)).toBeUndefined();
  });

  it("still narrows by one that can", () => {
    expect(readFilterChoice("ACTIVE", PROJECT_STATUS_VALUES)).toBe("ACTIVE");
  });
});
