import { describe, it, expect } from "vitest";
import { computeWaitingMinutes, formatWaitingDuration } from "./waitingTime";

describe("computeWaitingMinutes", () => {
  it("computes elapsed minutes between createdAt and now", () => {
    const createdAt = "2026-01-01T00:00:00.000Z";
    const now = new Date("2026-01-01T00:30:00.000Z");
    expect(computeWaitingMinutes(createdAt, now)).toBe(30);
  });

  it("never returns a negative value for a createdAt in the future (clock skew)", () => {
    const createdAt = "2026-01-01T01:00:00.000Z";
    const now = new Date("2026-01-01T00:00:00.000Z");
    expect(computeWaitingMinutes(createdAt, now)).toBe(0);
  });
});

describe("formatWaitingDuration", () => {
  it("shows <1m for sub-minute durations", () => {
    expect(formatWaitingDuration(0)).toBe("<1m");
  });

  it("shows minutes only under an hour", () => {
    expect(formatWaitingDuration(45)).toBe("45m");
  });

  it("shows hours and minutes under a day", () => {
    expect(formatWaitingDuration(134)).toBe("2h 14m");
  });

  it("shows days and hours at a day or more", () => {
    expect(formatWaitingDuration(1684)).toBe("1d 4h");
  });
});
