import { describe, it, expect, vi } from "vitest";
import { delay, withRetry } from "./async";

describe("delay", () => {
  it("resolves after roughly the requested time", async () => {
    vi.useFakeTimers();
    const promise = delay(1000);
    vi.advanceTimersByTime(1000);
    await expect(promise).resolves.toBeUndefined();
    vi.useRealTimers();
  });
});

describe("withRetry", () => {
  it("returns the result immediately on first success, no retry needed", async () => {
    const operation = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(operation, { baseDelayMs: 0, maxDelayMs: 0 });
    expect(result).toBe("ok");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("retries on failure and eventually succeeds", async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce("ok");
    const result = await withRetry(operation, {
      maxAttempts: 3,
      baseDelayMs: 0,
      maxDelayMs: 0,
    });
    expect(result).toBe("ok");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("throws the last error once maxAttempts is exhausted, never exceeding it", async () => {
    const operation = vi.fn().mockRejectedValue(new Error("persistent failure"));
    await expect(
      withRetry(operation, { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0 }),
    ).rejects.toThrow("persistent failure");
    expect(operation).toHaveBeenCalledTimes(3);
  });
});
