import { describe, it, expect } from "vitest";
import {
  isUnread,
  requiresAttention,
  isTerminalState,
  NOTIFICATION_STATE_LABEL,
  NOTIFICATION_STATE_TONE,
} from "./lifecycle";
import { NOTIFICATION_LIFECYCLE_STATES } from "./types";

describe("lifecycle predicates", () => {
  it("isUnread is true only for 'unread'", () => {
    expect(isUnread("unread")).toBe(true);
    expect(isUnread("read")).toBe(false);
  });

  it("requiresAttention covers unread and action_required only", () => {
    expect(requiresAttention("unread")).toBe(true);
    expect(requiresAttention("action_required")).toBe(true);
    expect(requiresAttention("read")).toBe(false);
    expect(requiresAttention("acknowledged")).toBe(false);
  });

  it("isTerminalState covers dismissed/archived/expired/completed only", () => {
    expect(isTerminalState("dismissed")).toBe(true);
    expect(isTerminalState("archived")).toBe(true);
    expect(isTerminalState("expired")).toBe(true);
    expect(isTerminalState("completed")).toBe(true);
    expect(isTerminalState("unread")).toBe(false);
    expect(isTerminalState("action_required")).toBe(false);
  });

  it("every lifecycle state has a label and a tone (extensibility check)", () => {
    for (const state of NOTIFICATION_LIFECYCLE_STATES) {
      expect(NOTIFICATION_STATE_LABEL[state]).toBeTruthy();
      expect(NOTIFICATION_STATE_TONE[state]).toBeTruthy();
    }
  });
});
