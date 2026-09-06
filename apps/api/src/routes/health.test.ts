import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildApp } from "../app.js";
import { FakeOtpSender } from "../domain/auth/__fixtures__/fake-otp-sender.js";

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
  });
}

describe("GET /api/v1/healthz", () => {
  it("returns status ok and a version identifier, without touching the database (liveness only)", async () => {
    const app = await buildTestApp();
    const response = await app.inject({ method: "GET", url: "/api/v1/healthz" });

    expect(response.statusCode).toBe(200);
    // No BUILD_SHA set in this test environment -> "unknown", proving the
    // field is always present rather than silently omitted.
    expect(response.json()).toEqual({ status: "ok", version: "unknown" });

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
