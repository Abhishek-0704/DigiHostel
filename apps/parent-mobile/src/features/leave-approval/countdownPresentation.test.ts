import { describe, expect, it } from "vitest";
import { deriveCountdownPresentation } from "./countdownPresentation";

const NOW = new Date("2026-09-01T12:00:00.000Z");

describe("deriveCountdownPresentation", () => {
  it("missing timestamp (undefined) -> unavailable", () => {
    expect(deriveCountdownPresentation(undefined, NOW)).toEqual({
      urgency: "unavailable",
      label: "Time remaining isn't available",
      accessibleLabel: "Time remaining is not available for this request.",
    });
  });

  it("missing timestamp (null) -> unavailable", () => {
    expect(deriveCountdownPresentation(null, NOW).urgency).toBe("unavailable");
  });

  it("invalid timestamp -> unavailable", () => {
    expect(deriveCountdownPresentation("not-a-date", NOW).urgency).toBe("unavailable");
  });

  it("zero remaining (exact expiry instant) -> expired", () => {
    expect(deriveCountdownPresentation(NOW.toISOString(), NOW)).toEqual({
      urgency: "expired",
      label: "Approval time has ended",
      accessibleLabel: "Approval time has ended.",
    });
  });

  it("past expiry -> expired", () => {
    const past = new Date(NOW.getTime() - 60_000).toISOString();
    expect(deriveCountdownPresentation(past, NOW).urgency).toBe("expired");
  });

  it("future expiry, well beyond warning threshold -> normal urgency", () => {
    const future = new Date(NOW.getTime() + 3 * 60 * 60 * 1000).toISOString(); // 3h
    const result = deriveCountdownPresentation(future, NOW);
    expect(result.urgency).toBe("normal");
    expect(result.label).toBe("3h 0m remaining");
  });

  it("near expiry within the warning threshold -> warning urgency", () => {
    const future = new Date(NOW.getTime() + 20 * 60 * 1000).toISOString(); // 20min
    const result = deriveCountdownPresentation(future, NOW);
    expect(result.urgency).toBe("warning");
    expect(result.label).toBe("20m remaining");
  });

  it("near expiry within the critical threshold -> critical urgency", () => {
    const future = new Date(NOW.getTime() + 2 * 60 * 1000).toISOString(); // 2min
    const result = deriveCountdownPresentation(future, NOW);
    expect(result.urgency).toBe("critical");
    expect(result.label).toBe("2m remaining");
  });

  it("produces an accessible label distinct from the short label", () => {
    const future = new Date(NOW.getTime() + 90 * 60 * 1000).toISOString(); // 1h30m
    const result = deriveCountdownPresentation(future, NOW);
    expect(result.label).toBe("1h 30m remaining");
    expect(result.accessibleLabel).toBe("1 hour 30 minutes remaining to respond.");
  });

  it("uses singular units in the accessible label at exactly 1 hour / 1 minute", () => {
    const future = new Date(NOW.getTime() + 61 * 60 * 1000).toISOString(); // 1h1m
    const result = deriveCountdownPresentation(future, NOW);
    expect(result.accessibleLabel).toBe("1 hour 1 minute remaining to respond.");
  });
});
