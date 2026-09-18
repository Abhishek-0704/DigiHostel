import { describe, it, expect } from "vitest";
import { OPERATIONAL_SUMMARY_METRICS } from "./operationalSummary";
import { ROUTES } from "../../constants/routes";

describe("OPERATIONAL_SUMMARY_METRICS", () => {
  it("has unique ids", () => {
    const ids = OPERATIONAL_SUMMARY_METRICS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("never fabricates a numeric value — every metric is honestly unavailable", () => {
    // Prompt 5 §7/§34's central rule: no metric may show a made-up number.
    // This is a genuine repository fact today, not a permanently-frozen
    // expectation — once a real backend source exists for one of these
    // metrics, this specific assertion is expected to be updated alongside
    // that change, not silently weakened.
    for (const metric of OPERATIONAL_SUMMARY_METRICS) {
      expect(metric.value).toBeNull();
      expect(metric.unavailableReason).toBeTruthy();
    }
  });

  it("only references routes that exist in ROUTES", () => {
    const knownRoutes = new Set<string>(Object.values(ROUTES));
    for (const metric of OPERATIONAL_SUMMARY_METRICS) {
      if (metric.route) expect(knownRoutes.has(metric.route)).toBe(true);
    }
  });
});
