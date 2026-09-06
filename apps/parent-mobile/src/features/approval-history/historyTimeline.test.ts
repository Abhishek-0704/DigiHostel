import { describe, expect, it } from "vitest";
import { buildTimelineFromEvents } from "./historyTimeline";

describe("buildTimelineFromEvents", () => {
  it("always starts with a 'Leave requested' entry from requestedAt", () => {
    const timeline = buildTimelineFromEvents([], "2026-09-01T10:00:00.000Z", "awaiting_response");
    expect(timeline[0]).toEqual({
      id: "requested",
      label: "Leave requested",
      status: "completed",
      timestamp: "2026-09-01T10:00:00.000Z",
    });
  });

  it("appends a trailing 'current' step only when still awaiting_response", () => {
    const timeline = buildTimelineFromEvents([], "2026-09-01T10:00:00.000Z", "awaiting_response");
    expect(timeline).toHaveLength(2);
    expect(timeline[1]).toMatchObject({ id: "awaiting-response", status: "current" });
  });

  it("does not append a trailing step for a terminal status", () => {
    const timeline = buildTimelineFromEvents([], "2026-09-01T10:00:00.000Z", "approved");
    expect(timeline).toHaveLength(1);
  });

  it("renders every real event as completed, in the order given (chronological, oldest first)", () => {
    const timeline = buildTimelineFromEvents(
      [
        {
          id: "evt-1",
          eventType: "notified",
          response: null,
          occurredAt: "2026-09-02T00:00:00.000Z",
        },
        {
          id: "evt-2",
          eventType: "responded",
          response: "approved",
          occurredAt: "2026-09-03T00:00:00.000Z",
        },
      ],
      "2026-09-01T10:00:00.000Z",
      "approved",
    );
    expect(timeline).toEqual([
      {
        id: "requested",
        label: "Leave requested",
        status: "completed",
        timestamp: "2026-09-01T10:00:00.000Z",
      },
      {
        id: "evt-1",
        label: "Escalation notice sent",
        status: "completed",
        timestamp: "2026-09-02T00:00:00.000Z",
      },
      {
        id: "evt-2",
        label: "Approved",
        status: "completed",
        timestamp: "2026-09-03T00:00:00.000Z",
      },
    ]);
  });

  it.each([
    ["notified", null, "Escalation notice sent"],
    ["responded", "approved", "Approved"],
    ["responded", "rejected", "Rejected"],
    ["responded", "no_response", "Response recorded"],
    ["escalated", null, "Escalated to next contact"],
    ["expired", null, "Marked expired by hostel staff"],
    ["manual_override", null, "Resolved by hostel staff"],
  ] as const)(
    "labels %s/%s as %s — no other event type/response combination is invented",
    (eventType, response, label) => {
      const timeline = buildTimelineFromEvents(
        [{ id: "evt-1", eventType, response, occurredAt: "2026-09-02T00:00:00.000Z" }],
        null,
        "unknown",
      );
      expect(timeline[1].label).toBe(label);
    },
  );

  it("never fabricates an event beyond what is passed in — no academic/reception/exit events exist to add", () => {
    const timeline = buildTimelineFromEvents([], null, "unknown");
    expect(timeline).toHaveLength(1);
    expect(timeline.every((event) => event.id === "requested")).toBe(true);
  });
});
