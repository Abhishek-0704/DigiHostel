import { describe, it, expect } from "vitest";
import {
  isValidEmail,
  validateCredentials,
  isValidTotpCode,
  sanitizeTotpInput,
} from "./authFormValidation";

describe("isValidEmail", () => {
  it("accepts a well-formed email", () => {
    expect(isValidEmail("reception1@example.test")).toBe(true);
  });

  it("rejects an email with no @", () => {
    expect(isValidEmail("not-an-email")).toBe(false);
  });

  it("rejects an email with no domain suffix", () => {
    expect(isValidEmail("a@b")).toBe(false);
  });

  it("tolerates surrounding whitespace", () => {
    expect(isValidEmail("  reception1@example.test  ")).toBe(true);
  });
});

describe("validateCredentials", () => {
  it("returns no errors for a valid email + non-empty password", () => {
    expect(validateCredentials("reception1@example.test", "correct-password")).toEqual({});
  });

  it("flags an empty email", () => {
    expect(validateCredentials("", "pw")).toEqual({ email: "Enter your email address." });
  });

  it("flags a whitespace-only email as empty, not merely invalid-format", () => {
    expect(validateCredentials("   ", "pw")).toEqual({ email: "Enter your email address." });
  });

  it("flags an invalid email format", () => {
    expect(validateCredentials("not-an-email", "pw")).toEqual({
      email: "Enter a valid email address.",
    });
  });

  it("flags an empty password", () => {
    expect(validateCredentials("reception1@example.test", "")).toEqual({
      password: "Enter your password.",
    });
  });

  it("never rejects a password for being 'too simple' — no policy is enforced or revealed", () => {
    expect(validateCredentials("reception1@example.test", "a")).toEqual({});
  });

  it("returns both field errors together when both are invalid", () => {
    expect(validateCredentials("", "")).toEqual({
      email: "Enter your email address.",
      password: "Enter your password.",
    });
  });
});

describe("isValidTotpCode", () => {
  it("accepts exactly 6 digits", () => {
    expect(isValidTotpCode("123456")).toBe(true);
  });

  it.each(["12345", "1234567", "12345a", "", "abcdef"])("rejects %s", (code) => {
    expect(isValidTotpCode(code)).toBe(false);
  });
});

describe("sanitizeTotpInput", () => {
  it("strips non-digit characters", () => {
    expect(sanitizeTotpInput("12 34-56")).toBe("123456");
  });

  it("caps length at 6 digits", () => {
    expect(sanitizeTotpInput("1234567890")).toBe("123456");
  });
});
