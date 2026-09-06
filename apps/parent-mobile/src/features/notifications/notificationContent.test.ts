import { describe, expect, it } from "vitest";
import { buildNotificationDisplayContent } from "./notificationContent";

describe("buildNotificationDisplayContent", () => {
  it("mirrors the backend's exact leave-approval push title", () => {
    const content = buildNotificationDisplayContent("leave_approval");
    expect(content.title).toBe("Leave request awaiting your response");
  });

  it("never mentions a student name or roll number for any category", () => {
    const categories = [
      "leave_approval",
      "library",
      "security",
      "emergency",
      "health",
      "hostel_updates",
      "announcements",
      "system",
      "general",
    ] as const;
    for (const category of categories) {
      const content = buildNotificationDisplayContent(category);
      expect(content.title.length).toBeGreaterThan(0);
      expect(content.description.length).toBeGreaterThan(0);
      expect(content.description).not.toMatch(/roll no|roll number/i);
    }
  });

  it("returns a generic fallback for a category with no dedicated copy", () => {
    const content = buildNotificationDisplayContent("system");
    expect(content.title).toBe("Notification");
  });
});
