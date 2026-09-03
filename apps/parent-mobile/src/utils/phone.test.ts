import { describe, it, expect } from "vitest";
import { isValidPhoneNumber, maskPhoneNumber } from "./phone";

describe("isValidPhoneNumber", () => {
  it.each(["+919000000001", "919000000001", "+14155552671", "12345678"])(
    "accepts a well-formed E.164-shaped number: %s",
    (value) => {
      expect(isValidPhoneNumber(value)).toBe(true);
    },
  );

  it.each(["", "abc", "123", "+0123456789", "12345678901234567", "++91900000"])(
    "rejects a malformed number: %s",
    (value) => {
      expect(isValidPhoneNumber(value)).toBe(false);
    },
  );

  it("tolerates surrounding whitespace", () => {
    expect(isValidPhoneNumber("  +919000000001  ")).toBe(true);
  });
});

describe("maskPhoneNumber", () => {
  it("keeps only the last two digits visible", () => {
    expect(maskPhoneNumber("+919000000001")).toBe("***********01");
  });

  it("never returns the original value for any realistic phone number", () => {
    const input = "+14155552671";
    expect(maskPhoneNumber(input)).not.toBe(input);
    expect(maskPhoneNumber(input)).not.toContain(input.slice(0, -2));
  });

  it("handles very short input without throwing", () => {
    expect(maskPhoneNumber("1")).toBe("*");
    expect(maskPhoneNumber("")).toBe("");
  });
});
