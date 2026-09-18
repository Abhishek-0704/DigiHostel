import { describe, it, expect } from "vitest";
import { deriveInactivityStatus } from "./inactivityStatus";

const CONFIG = { idleTimeoutMs: 15 * 60_000, warningBeforeMs: 2 * 60_000 };

describe("deriveInactivityStatus", () => {
  it("reports active well before the warning threshold", () => {
    expect(deriveInactivityStatus(0, CONFIG)).toBe("active");
    expect(deriveInactivityStatus(5 * 60_000, CONFIG)).toBe("active");
  });

  it("reports warning once inside the warning window", () => {
    expect(deriveInactivityStatus(13 * 60_000, CONFIG)).toBe("warning");
    expect(deriveInactivityStatus(14.5 * 60_000, CONFIG)).toBe("warning");
  });

  it("reports expired once the full idle timeout is reached", () => {
    expect(deriveInactivityStatus(15 * 60_000, CONFIG)).toBe("expired");
    expect(deriveInactivityStatus(999 * 60_000, CONFIG)).toBe("expired");
  });

  it("treats the exact warning boundary as warning, not active (fail toward the safer state)", () => {
    expect(deriveInactivityStatus(13 * 60_000, CONFIG)).toBe("warning");
  });
});
