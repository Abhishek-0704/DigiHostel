import { describe, it, expect, vi, afterEach } from "vitest";
import { isChallengeExpired } from "./mfaService";

describe("isChallengeExpired", () => {
  afterEach(() => vi.useRealTimers());

  it("returns false for a challenge expiring in the future", () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    expect(isChallengeExpired(nowSeconds + 300)).toBe(false);
  });

  it("returns true for a challenge that already expired", () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    expect(isChallengeExpired(nowSeconds - 1)).toBe(true);
  });

  it("returns true exactly at the expiry boundary (fail closed, not fail open)", () => {
    vi.useFakeTimers();
    const fixedNowMs = 1_700_000_000_000;
    vi.setSystemTime(fixedNowMs);
    expect(isChallengeExpired(fixedNowMs / 1000)).toBe(true);
  });
});
