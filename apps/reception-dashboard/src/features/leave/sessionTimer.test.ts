import { describe, it, expect } from "vitest";
import {
  computeSessionTimer,
  formatSessionDuration,
  DEFAULT_ESCALATION_STAGE_TIMEOUT_MS,
} from "./sessionTimer";

describe("computeSessionTimer", () => {
  it("computes real elapsed time from updatedAt", () => {
    const updatedAt = "2026-01-01T00:00:00.000Z";
    const now = new Date("2026-01-01T00:00:30.000Z");
    const reading = computeSessionTimer(updatedAt, now, false);
    expect(reading.elapsedMs).toBe(30_000);
  });

  it("estimates the next check as the remaining portion of the stage timeout for a non-terminal session", () => {
    const updatedAt = "2026-01-01T00:00:00.000Z";
    const now = new Date("2026-01-01T00:00:30.000Z");
    const reading = computeSessionTimer(updatedAt, now, false, 90_000);
    expect(reading.estimatedNextCheckMs).toBe(60_000);
  });

  it("never returns a negative estimate once elapsed exceeds the stage timeout", () => {
    const updatedAt = "2026-01-01T00:00:00.000Z";
    const now = new Date("2026-01-01T00:05:00.000Z");
    const reading = computeSessionTimer(updatedAt, now, false, 90_000);
    expect(reading.estimatedNextCheckMs).toBe(0);
  });

  it("returns null for the estimate on a terminal session — there is no next stage to wait for", () => {
    const updatedAt = "2026-01-01T00:00:00.000Z";
    const now = new Date("2026-01-01T00:05:00.000Z");
    const reading = computeSessionTimer(updatedAt, now, true);
    expect(reading.estimatedNextCheckMs).toBeNull();
  });

  it("never returns negative elapsed time for clock skew (updatedAt in the future)", () => {
    const updatedAt = "2026-01-01T01:00:00.000Z";
    const now = new Date("2026-01-01T00:00:00.000Z");
    const reading = computeSessionTimer(updatedAt, now, false);
    expect(reading.elapsedMs).toBe(0);
  });

  it("uses the real, documented default stage timeout (90s) when none is supplied", () => {
    const updatedAt = "2026-01-01T00:00:00.000Z";
    const now = new Date("2026-01-01T00:00:00.000Z");
    const reading = computeSessionTimer(updatedAt, now, false);
    expect(reading.estimatedNextCheckMs).toBe(DEFAULT_ESCALATION_STAGE_TIMEOUT_MS);
  });
});

describe("formatSessionDuration", () => {
  it("formats seconds only under a minute", () => {
    expect(formatSessionDuration(45_000)).toBe("45s");
  });

  it("formats minutes and seconds under an hour", () => {
    expect(formatSessionDuration(125_000)).toBe("2m 5s");
  });

  it("formats hours and minutes at an hour or more", () => {
    expect(formatSessionDuration(3_725_000)).toBe("1h 2m");
  });
});
