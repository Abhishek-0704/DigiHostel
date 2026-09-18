import { describe, it, expect } from "vitest";
import { signOutReasonMessage } from "./signOutReasonMessage";

describe("signOutReasonMessage", () => {
  it("returns undefined for null (nothing to say on an ordinary visit)", () => {
    expect(signOutReasonMessage(null)).toBeUndefined();
  });

  it("returns a distinct message for session_invalid", () => {
    expect(signOutReasonMessage("session_invalid")).toMatch(/expired/i);
  });

  it("returns a distinct message for inactivity_timeout", () => {
    expect(signOutReasonMessage("inactivity_timeout")).toMatch(/inactivity/i);
  });

  it("returns a distinct message for user_initiated", () => {
    expect(signOutReasonMessage("user_initiated")).toMatch(/signed out/i);
  });

  it("never leaks internal detail — every message is plain, safe prose", () => {
    for (const reason of ["session_invalid", "inactivity_timeout", "user_initiated"] as const) {
      const message = signOutReasonMessage(reason);
      expect(message).not.toMatch(/token|jwt|supabase|sql/i);
    }
  });
});
