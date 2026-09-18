import { describe, it, expect } from "vitest";
import { notificationService } from "./NotificationService";

describe("notificationService", () => {
  it("list() resolves to an honestly-empty array — no production notification producer exists yet", async () => {
    const result = await notificationService.list();
    expect(result).toEqual([]);
  });
});
