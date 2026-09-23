import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildApp } from "../app.js";
import { FakeOtpSender } from "../domain/auth/__fixtures__/fake-otp-sender.js";
import { FakeStaffRepository } from "../domain/staff/__fixtures__/fake-repository.js";

// /healthz and /readyz never invoke app.authenticate, so this fake verifier
// is never called — it exists only so buildApp() can construct without a
// real SUPABASE_URL, since registering the auth boundary is now mandatory
// for every route (fail-secure), not just protected ones. Same reasoning
// applies to otpSender below (plugins/otpAuth.ts).
async function buildTestApp() {
  return buildApp({
    authOverrides: {
      jwtVerifier: {
        verify: async () => {
          throw new Error("unexpected: /healthz/readyz should never trigger JWT verification");
        },
      },
    },
    otpAuthOverrides: { otpSender: new FakeOtpSender() },
    staffOverrides: { staffRepository: new FakeStaffRepository() },
  });
}

describe("GET /api/v1/healthz", () => {
  it("returns status ok and a version identifier, without touching the database (liveness only)", async () => {
    const app = await buildTestApp();
    const response = await app.inject({ method: "GET", url: "/api/v1/healthz" });

    expect(response.statusCode).toBe(200);
    // Neither RENDER_GIT_COMMIT nor BUILD_SHA is set in this test
    // environment -> "unknown", proving the field is always present rather
    // than silently omitted.
    expect(response.json()).toEqual({ status: "ok", version: "unknown" });

    await app.close();
  });

  it("prefers RENDER_GIT_COMMIT over BUILD_SHA when both are set (F-07E)", async () => {
    const original = { render: process.env.RENDER_GIT_COMMIT, build: process.env.BUILD_SHA };
    process.env.RENDER_GIT_COMMIT = "render-injected-sha";
    process.env.BUILD_SHA = "stale-fallback-sha";
    try {
      const app = await buildTestApp();
      const response = await app.inject({ method: "GET", url: "/api/v1/healthz" });
      expect(response.json()).toEqual({ status: "ok", version: "render-injected-sha" });
      await app.close();
    } finally {
      process.env.RENDER_GIT_COMMIT = original.render;
      process.env.BUILD_SHA = original.build;
    }
  });

  it("falls back to BUILD_SHA when RENDER_GIT_COMMIT is absent (local dev/non-Render hosts)", async () => {
    const original = { render: process.env.RENDER_GIT_COMMIT, build: process.env.BUILD_SHA };
    delete process.env.RENDER_GIT_COMMIT;
    process.env.BUILD_SHA = "local-build-sha";
    try {
      const app = await buildTestApp();
      const response = await app.inject({ method: "GET", url: "/api/v1/healthz" });
      expect(response.json()).toEqual({ status: "ok", version: "local-build-sha" });
      await app.close();
    } finally {
      process.env.RENDER_GIT_COMMIT = original.render;
      process.env.BUILD_SHA = original.build;
    }
  });

  it("carries an x-request-id response header on every response, including 2xx (F-07)", async () => {
    const app = await buildTestApp();
    const response = await app.inject({ method: "GET", url: "/api/v1/healthz" });

    expect(response.headers["x-request-id"]).toBeTruthy();

    await app.close();
  });

  it("carries baseline defense-in-depth security headers on every response (QG-06, F-QG06-08)", async () => {
    const app = await buildTestApp();
    const response = await app.inject({ method: "GET", url: "/api/v1/healthz" });

    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["strict-transport-security"]).toBe(
      "max-age=15552000; includeSubDomains",
    );

    await app.close();
  });
});

describe("GET /api/v1/readyz — unreachable database (mocked)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns 503 with a generic body — never the underlying error's message or stack (F-06 security requirement)", async () => {
    vi.doMock("@digihostel/db", async () => {
      const actual = await vi.importActual<typeof import("@digihostel/db")>("@digihostel/db");
      return {
        ...actual,
        db: {
          execute: async () => {
            throw new Error("connection to postgres://app:s3cr3t@db-host:5432/digihostel failed");
          },
        },
      };
    });
    const { buildApp: buildAppWithMockedDb } = await import("../app.js");
    const app = await buildAppWithMockedDb({
      authOverrides: {
        jwtVerifier: {
          verify: async () => {
            throw new Error("unexpected");
          },
        },
      },
      otpAuthOverrides: { otpSender: new FakeOtpSender() },
      staffOverrides: { staffRepository: new FakeStaffRepository() },
    });

    const response = await app.inject({ method: "GET", url: "/api/v1/readyz" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: "not_ready" });
    expect(response.body).not.toContain("postgres://");
    expect(response.body).not.toContain("s3cr3t");

    await app.close();
    vi.doUnmock("@digihostel/db");
  });
});

describe.skipIf(!process.env.DATABASE_URL)("GET /api/v1/readyz — real Postgres integration", () => {
  it("returns 200 when the database is reachable", async () => {
    const app = await buildTestApp();
    const response = await app.inject({ method: "GET", url: "/api/v1/readyz" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });

    await app.close();
  });
});
