import { describe, expect, it } from "vitest";
import { resolveNotificationDeepLink } from "./notificationDeepLink";

describe("resolveNotificationDeepLink", () => {
  it("resolves a supported, well-formed leave_approval payload", () => {
    const result = resolveNotificationDeepLink({
      type: "leave_approval",
      leaveRequestId: "11111111-1111-1111-1111-111111111111",
    });
    expect(result).toEqual({
      kind: "leave_approval",
      leaveRequestId: "11111111-1111-1111-1111-111111111111",
      href: {
        pathname: "/(app)/leave/[id]",
        params: { id: "11111111-1111-1111-1111-111111111111" },
      },
    });
  });

  it("classifies a recognized-shape but unknown type as unsupported", () => {
    expect(resolveNotificationDeepLink({ type: "library_update", passId: "x" })).toEqual({
      kind: "unsupported",
    });
  });

  it("classifies a missing leaveRequestId on a leave_approval payload as invalid", () => {
    expect(resolveNotificationDeepLink({ type: "leave_approval" })).toEqual({ kind: "invalid" });
  });

  it("classifies a non-UUID leaveRequestId as invalid", () => {
    expect(
      resolveNotificationDeepLink({ type: "leave_approval", leaveRequestId: "not-a-uuid" }),
    ).toEqual({ kind: "invalid" });
  });

  it("classifies malformed payloads (null, array, string, missing type) as invalid", () => {
    expect(resolveNotificationDeepLink(null)).toEqual({ kind: "invalid" });
    expect(resolveNotificationDeepLink(undefined)).toEqual({ kind: "invalid" });
    expect(resolveNotificationDeepLink([])).toEqual({ kind: "invalid" });
    expect(resolveNotificationDeepLink("https://evil.example.com")).toEqual({ kind: "invalid" });
    expect(resolveNotificationDeepLink({})).toEqual({ kind: "invalid" });
  });

  it("never produces an external URL — only an in-app Href object", () => {
    const result = resolveNotificationDeepLink({
      type: "leave_approval",
      leaveRequestId: "11111111-1111-1111-1111-111111111111",
    });
    if (result.kind === "leave_approval") {
      expect(typeof result.href).toBe("object");
      expect(JSON.stringify(result.href)).not.toMatch(/^"?https?:\/\//);
    }
  });

  it("resolution is independent of auth state — authorization stays with AuthGate/backend on navigation, not this pure function", () => {
    // This function only ever validates payload shape and produces an
    // in-app Href into the already AuthGate-protected (app) group; it takes
    // no auth-state input by design, since deep-link routing must never
    // itself decide authorization (see this file's own doc comment).
    const result = resolveNotificationDeepLink({
      type: "leave_approval",
      leaveRequestId: "11111111-1111-1111-1111-111111111111",
    });
    expect(result.kind).toBe("leave_approval");
  });
});
