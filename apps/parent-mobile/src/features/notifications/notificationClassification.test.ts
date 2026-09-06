import { describe, expect, it } from "vitest";
import {
  CATEGORIES_WITH_REAL_DATA,
  deriveCategory,
  derivePriority,
  isActionable,
  isUnread,
  isValidRawNotificationRow,
  mapRowToNotification,
  type RawNotificationRow,
} from "./notificationClassification";

function row(overrides: Partial<RawNotificationRow> = {}): RawNotificationRow {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    related_leave_request_id: null,
    related_library_pass_id: null,
    status: "delivered",
    created_at: "2026-09-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("deriveCategory", () => {
  it("maps a related leave request to leave_approval", () => {
    expect(deriveCategory(row({ related_leave_request_id: "leave-1" }))).toBe("leave_approval");
  });

  it("maps a related library pass to library", () => {
    expect(deriveCategory(row({ related_library_pass_id: "pass-1" }))).toBe("library");
  });

  it("prefers leave_approval when both are somehow set", () => {
    expect(
      deriveCategory(
        row({ related_leave_request_id: "leave-1", related_library_pass_id: "pass-1" }),
      ),
    ).toBe("leave_approval");
  });

  it("falls back to general when neither is set", () => {
    expect(deriveCategory(row())).toBe("general");
  });
});

describe("derivePriority", () => {
  it("is high for leave_approval", () => {
    expect(derivePriority("leave_approval")).toBe("high");
  });

  it.each([
    "security",
    "emergency",
    "health",
    "hostel_updates",
    "announcements",
    "system",
    "library",
    "general",
  ] as const)("is normal for %s", (category) => {
    expect(derivePriority(category)).toBe("normal");
  });
});

describe("isActionable", () => {
  it("is actionable only for leave_approval", () => {
    expect(isActionable({ category: "leave_approval" })).toBe(true);
    expect(isActionable({ category: "security" })).toBe(false);
    expect(isActionable({ category: "general" })).toBe(false);
  });
});

describe("isUnread", () => {
  it("is always true — no read-state persistence exists", () => {
    expect(isUnread()).toBe(true);
  });
});

describe("CATEGORIES_WITH_REAL_DATA", () => {
  it("contains only leave_approval", () => {
    expect(CATEGORIES_WITH_REAL_DATA).toEqual(["leave_approval"]);
  });
});

describe("mapRowToNotification", () => {
  it("maps a leave-approval row into a ParentNotification with safe, generic content", () => {
    const result = mapRowToNotification(
      row({ related_leave_request_id: "leave-1", status: "sent" }),
    );
    expect(result).toEqual({
      id: "11111111-1111-1111-1111-111111111111",
      category: "leave_approval",
      priority: "high",
      title: "Leave request awaiting your response",
      description: expect.any(String),
      deliveryStatus: "sent",
      createdAt: "2026-09-01T10:00:00.000Z",
      relatedLeaveRequestId: "leave-1",
    });
  });

  it("never includes a student name or roll number in generated content", () => {
    const result = mapRowToNotification(row({ related_leave_request_id: "leave-1" }));
    expect(result.title).not.toMatch(/roll/i);
    expect(result.description).not.toMatch(/roll/i);
  });
});

describe("isValidRawNotificationRow", () => {
  it("accepts a well-formed row", () => {
    expect(isValidRawNotificationRow(row())).toBe(true);
  });

  it("rejects null/undefined/non-object values", () => {
    expect(isValidRawNotificationRow(null)).toBe(false);
    expect(isValidRawNotificationRow(undefined)).toBe(false);
    expect(isValidRawNotificationRow("row")).toBe(false);
  });

  it("rejects a row with a missing id", () => {
    const malformed: Record<string, unknown> = { ...row() };
    delete malformed.id;
    expect(isValidRawNotificationRow(malformed)).toBe(false);
  });

  it("rejects a row with an unrecognized status", () => {
    expect(isValidRawNotificationRow(row({ status: "unknown" as never }))).toBe(false);
  });

  it("rejects a row with an unparseable created_at", () => {
    expect(isValidRawNotificationRow(row({ created_at: "not-a-date" }))).toBe(false);
  });
});
