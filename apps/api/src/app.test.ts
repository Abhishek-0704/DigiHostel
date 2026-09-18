import { describe, it, expect, afterEach } from "vitest";
import { resolveCorsOrigins } from "./app.js";

/**
 * Reception Dashboard Prompt 1 (Authentication Infrastructure) — the first
 * test coverage for app.ts, scoped to the pure `resolveCorsOrigins()`
 * function only (buildApp() itself is already covered end-to-end by every
 * routes/*.test.ts file, which all construct a real app instance).
 */
describe("resolveCorsOrigins", () => {
  const ORIGINAL_ORIGINS = process.env.CORS_ALLOWED_ORIGINS;
  const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

  afterEach(() => {
    if (ORIGINAL_ORIGINS === undefined) delete process.env.CORS_ALLOWED_ORIGINS;
    else process.env.CORS_ALLOWED_ORIGINS = ORIGINAL_ORIGINS;
    if (ORIGINAL_NODE_ENV === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  });

  it("uses the explicit env allow-list when configured, regardless of NODE_ENV", () => {
    process.env.CORS_ALLOWED_ORIGINS = "https://reception.example.com, https://staging.example.com";
    process.env.NODE_ENV = "production";
    expect(resolveCorsOrigins()).toEqual([
      "https://reception.example.com",
      "https://staging.example.com",
    ]);
  });

  it("falls back to the real local Vite dev origin outside production when unset", () => {
    delete process.env.CORS_ALLOWED_ORIGINS;
    process.env.NODE_ENV = "development";
    expect(resolveCorsOrigins()).toEqual(["http://localhost:5173"]);
  });

  it("fails closed (false) in production when unset — no origin is guessed", () => {
    delete process.env.CORS_ALLOWED_ORIGINS;
    process.env.NODE_ENV = "production";
    expect(resolveCorsOrigins()).toBe(false);
  });

  it("ignores an empty/whitespace-only env value the same as unset", () => {
    process.env.CORS_ALLOWED_ORIGINS = "   ";
    process.env.NODE_ENV = "production";
    expect(resolveCorsOrigins()).toBe(false);
  });
});
