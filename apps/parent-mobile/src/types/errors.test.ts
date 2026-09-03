import { describe, it, expect } from "vitest";
import { AppError, toAppError, safeMessageFor } from "./errors";

describe("toAppError", () => {
  it("passes an existing AppError through unchanged", () => {
    const original = new AppError("forbidden", safeMessageFor("forbidden"));
    expect(toAppError(original)).toBe(original);
  });

  it("maps an arbitrary raw error to a safe, generic AppError — never exposing the raw message", () => {
    const raw = new Error("connection to postgres://app:s3cr3t@db-host:5432/digihostel failed");
    const mapped = toAppError(raw);
    expect(mapped).toBeInstanceOf(AppError);
    expect(mapped.kind).toBe("unknown");
    expect(mapped.userMessage).not.toContain("postgres://");
    expect(mapped.userMessage).not.toContain("s3cr3t");
    expect(mapped.cause).toBe(raw);
  });

  it("maps a non-Error thrown value the same safe way", () => {
    const mapped = toAppError("a plain string throw");
    expect(mapped.userMessage).toBe(safeMessageFor("unknown"));
  });
});

describe("safeMessageFor", () => {
  it("returns a distinct message per error kind", () => {
    const kinds = [
      "network",
      "unauthenticated",
      "forbidden",
      "not_found",
      "conflict",
      "validation",
      "unknown",
    ] as const;
    const messages = kinds.map(safeMessageFor);
    expect(new Set(messages).size).toBe(kinds.length);
  });
});
