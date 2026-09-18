// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { SessionTimeline } from "./SessionTimeline";
import type { LeaveApprovalEvent } from "@digihostel/api-client-react";

afterEach(cleanup);

function make(overrides: Partial<LeaveApprovalEvent> = {}): LeaveApprovalEvent {
  return {
    id: "ev1",
    eventType: "escalated",
    response: null,
    biometricConfirmed: false,
    occurredAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("SessionTimeline", () => {
  it("shows a loading state", () => {
    render(<SessionTimeline events={[]} loading />);
    expect(screen.getByLabelText("Loading approval timeline")).toBeTruthy();
  });

  it("shows an error state with retry", () => {
    const onRetry = vi.fn();
    render(<SessionTimeline events={[]} error={{ message: "Failed.", onRetry }} />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("shows an honest empty state — never a fabricated event", () => {
    render(<SessionTimeline events={[]} />);
    expect(screen.getByText("No timeline events yet")).toBeTruthy();
  });

  it("renders real events with their real type and timestamp, never actor identity", () => {
    render(<SessionTimeline events={[make({ eventType: "escalated" })]} />);
    expect(screen.getByText("Escalated to next contact")).toBeTruthy();
    expect(screen.queryByText(/actorParentId|actorStaffId/)).toBeNull();
  });

  it("shows the real response and biometric-confirmation detail for a responded event", () => {
    render(
      <SessionTimeline
        events={[make({ eventType: "responded", response: "approved", biometricConfirmed: true })]}
      />,
    );
    expect(screen.getByText("Parent responded")).toBeTruthy();
    expect(screen.getByText("Approved")).toBeTruthy();
    expect(screen.getByText("Biometric confirmation recorded")).toBeTruthy();
  });
});
