import { describe, it, expect } from "vitest";
import { buildApp } from "../app.js";

describe("GET /api/v1/healthz", () => {
  it("returns status ok", async () => {
    // /healthz never invokes app.authenticate, so this fake verifier is
    // never called — it exists only so buildApp() can construct without a
    // real SUPABASE_URL, since registering the auth boundary is now
    // mandatory for every route (fail-secure), not just protected ones.
    const app = await buildApp({
      authOverrides: {
        jwtVerifier: {
          verify: async () => {
            throw new Error("unexpected: /healthz should never trigger JWT verification");
          },
        },
      },
    });
    const response = await app.inject({ method: "GET", url: "/api/v1/healthz" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });

    await app.close();
  });
});
