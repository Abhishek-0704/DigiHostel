import { describe, it, expect, vi } from "vitest";
import pino from "pino";

/**
 * F-07 — verifies the redaction *configuration* itself behaves as expected,
 * independent of whether any current call site happens to pass a sensitive
 * field today (repository-wide search found none — this is defense-in-depth
 * for a future call site, per lib/logger.ts's own comment). Rebuilds the
 * same redact paths against an in-memory stream rather than importing the
 * real `logger` singleton, so this test never depends on process.env or
 * produces real log output.
 */
const sensitiveKeys = ["token", "accessToken", "refreshToken", "otp", "pushToken"];
const redactPaths = [
  "req.headers.authorization",
  ...sensitiveKeys,
  ...sensitiveKeys.map((key) => `*.${key}`),
];

function buildTestLogger(sink: { data: string }) {
  return pino(
    { redact: { paths: redactPaths, censor: "[REDACTED]" } },
    { write: (chunk: string) => (sink.data += chunk) },
  );
}

describe("logger redaction", () => {
  it("redacts a token-shaped field wherever it appears, does not leak the raw value", () => {
    const sink = { data: "" };
    const logger = buildTestLogger(sink);

    logger.info({ accessToken: "super-secret-value-do-not-leak" }, "test event");

    expect(sink.data).not.toContain("super-secret-value-do-not-leak");
    expect(sink.data).toContain("[REDACTED]");
    expect(sink.data).toContain("test event");
  });

  it("redacts an OTP-shaped field", () => {
    const sink = { data: "" };
    const logger = buildTestLogger(sink);

    logger.info({ otp: "123456" }, "test event");

    expect(sink.data).not.toContain("123456");
    expect(sink.data).toContain("[REDACTED]");
  });

  it("redacts the Authorization request header path specifically", () => {
    const sink = { data: "" };
    const logger = buildTestLogger(sink);

    logger.info({ req: { headers: { authorization: "Bearer real.jwt.value" } } }, "test event");

    expect(sink.data).not.toContain("real.jwt.value");
    expect(sink.data).toContain("[REDACTED]");
  });

  it("leaves unrelated, non-sensitive fields untouched", () => {
    const sink = { data: "" };
    const logger = buildTestLogger(sink);

    logger.info({ leaveRequestId: "11111111-1111-1111-1111-111111111111" }, "test event");

    expect(sink.data).toContain("11111111-1111-1111-1111-111111111111");
  });
});

describe("logger base.buildSha precedence (F-07 closure)", () => {
  // Imports the real singleton dynamically (module-load-time, so env vars
  // must be set before import) rather than reproducing the precedence
  // expression separately, so this test exercises the actual source of
  // truth in lib/logger.ts, not a copy of it — mirrors the same
  // RENDER_GIT_COMMIT/BUILD_SHA precedence health.test.ts already verifies
  // for /healthz.version (F-07E); this closes the second call site F-07E
  // missed.
  it("prefers RENDER_GIT_COMMIT over BUILD_SHA when both are set", async () => {
    const original = { render: process.env.RENDER_GIT_COMMIT, build: process.env.BUILD_SHA };
    process.env.RENDER_GIT_COMMIT = "render-injected-sha";
    process.env.BUILD_SHA = "stale-fallback-sha";
    try {
      vi.resetModules();
      const { logger } = await import("./logger.js");
      expect(
        (logger as unknown as { bindings: () => { buildSha: string } }).bindings().buildSha,
      ).toBe("render-injected-sha");
    } finally {
      process.env.RENDER_GIT_COMMIT = original.render;
      process.env.BUILD_SHA = original.build;
      vi.resetModules();
    }
  });

  it("falls back to BUILD_SHA when RENDER_GIT_COMMIT is absent (local dev/non-Render hosts)", async () => {
    const original = { render: process.env.RENDER_GIT_COMMIT, build: process.env.BUILD_SHA };
    delete process.env.RENDER_GIT_COMMIT;
    process.env.BUILD_SHA = "local-build-sha";
    try {
      vi.resetModules();
      const { logger } = await import("./logger.js");
      expect(
        (logger as unknown as { bindings: () => { buildSha: string } }).bindings().buildSha,
      ).toBe("local-build-sha");
    } finally {
      process.env.RENDER_GIT_COMMIT = original.render;
      process.env.BUILD_SHA = original.build;
      vi.resetModules();
    }
  });
});
