import { describe, it, expect } from "vitest";
import {
  validateLocalPhoneNumber,
  sanitizeOtpInput,
  isCompleteOtp,
  COUNTRY_CODE,
  LOCAL_NUMBER_LENGTH,
  OTP_LENGTH,
} from "./validation";

describe("validateLocalPhoneNumber", () => {
  it("rejects a number shorter than the required local length", () => {
    const result = validateLocalPhoneNumber("900000");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.message).toContain(`${LOCAL_NUMBER_LENGTH}-digit`);
    }
  });

  it("rejects a number longer than the required local length", () => {
    const result = validateLocalPhoneNumber("9".repeat(LOCAL_NUMBER_LENGTH + 1));
    expect(result.valid).toBe(false);
  });

  it("accepts a well-formed local number and composes it with the fixed country code", () => {
    const local = "9000000001";
    expect(local).toHaveLength(LOCAL_NUMBER_LENGTH);
    const result = validateLocalPhoneNumber(local);
    expect(result).toEqual({ valid: true, fullNumber: `${COUNTRY_CODE}${local}` });
  });

  it("never claims a number belongs to a real registered parent — purely format validation, no such field exists on the result", () => {
    const result = validateLocalPhoneNumber("9000000001");
    expect(result).not.toHaveProperty("isRegisteredParent");
    expect(result).not.toHaveProperty("belongsToParent");
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
