import { describe, expect, it } from "vitest";
import { mapProfileError } from "./profileErrors";
import { AppError } from "../../types/errors";

describe("mapProfileError", () => {
  it("passes an existing AppError through unchanged", () => {
    const original = new AppError("forbidden", "no");
    expect(mapProfileError(original)).toBe(original);
  });

  it("maps a raw error to profile_unavailable by default (read context)", () => {
    const mapped = mapProfileError(new Error("permission denied for table parents"));
    expect(mapped.kind).toBe("profile_unavailable");
    expect(mapped.userMessage).not.toMatch(/permission denied|parents/i);
  });

  it("maps a raw error to profile_update_failed for the write context", () => {
    const mapped = mapProfileError(new Error("row-level security violation"), "write");
    expect(mapped.kind).toBe("profile_update_failed");
  });
});
