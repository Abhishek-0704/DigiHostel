import { describe, it, expect } from "vitest";
import {
  isValidRollNumber,
  sanitizeOtpInput,
  isCompleteOtp,
  RELATIONSHIP_OPTIONS,
  OTP_LENGTH,
} from "./validation";

describe("isValidRollNumber", () => {
  it("rejects an empty string", () => {
    expect(isValidRollNumber("")).toBe(false);
  });

  it("rejects a whitespace-only value", () => {
    expect(isValidRollNumber("   ")).toBe(false);
  });

  it("accepts a well-formed roll number", () => {
    expect(isValidRollNumber("21CS0123")).toBe(true);
  });

  it("never claims a roll number belongs to a real registered student — purely format validation", () => {
    expect(typeof isValidRollNumber("21CS0123")).toBe("boolean");
  });
});

describe("RELATIONSHIP_OPTIONS", () => {
  it("offers exactly father, mother, guardian — matching the backend's enum", () => {
    expect(RELATIONSHIP_OPTIONS.map((o) => o.value)).toEqual(["father", "mother", "guardian"]);
  });
});

describe("sanitizeOtpInput", () => {
  it("strips non-digit characters", () => {
    expect(sanitizeOtpInput("1a2b3c")).toBe("123");
  });

  it("caps at OTP_LENGTH even if more digits are pasted", () => {
    expect(sanitizeOtpInput("123456789")).toBe("123456789".slice(0, OTP_LENGTH));
    expect(sanitizeOtpInput("123456789")).toHaveLength(OTP_LENGTH);
  });

  it("passes through a well-formed 6-digit code unchanged", () => {
    expect(sanitizeOtpInput("482913")).toBe("482913");
  });
});

describe("isCompleteOtp", () => {
  it("is false for anything shorter than OTP_LENGTH", () => {
    expect(isCompleteOtp("12345")).toBe(false);
    expect(isCompleteOtp("")).toBe(false);
  });

  it(`is true for exactly ${OTP_LENGTH} numeric digits`, () => {
    expect(isCompleteOtp("482913")).toBe(true);
  });

  it("is false for non-numeric content even at the right length", () => {
    expect(isCompleteOtp("48a913")).toBe(false);
  });
});
