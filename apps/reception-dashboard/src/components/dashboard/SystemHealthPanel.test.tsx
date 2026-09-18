// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SystemHealthPanel } from "./SystemHealthPanel";
import { useAuthContext } from "../../contexts/AuthContext";

vi.mock("../../contexts/AuthContext", () => ({ useAuthContext: vi.fn() }));

const mockUseAuthContext = vi.mocked(useAuthContext);

afterEach(cleanup);

function setup(status: string) {
  mockUseAuthContext.mockReturnValue({
    status,
    signOut: vi.fn(),
    refreshAssuranceLevel: vi.fn(),
    lastSignOutReason: null,
    inactivityStatus: "active",
    inactivityRemainingMs: 0,
    resetInactivityTimer: vi.fn(),
  } as never);
}

describe("SystemHealthPanel", () => {
  it("shows Authentication as Operational for a genuinely authenticated session", () => {
    setup("authenticated");
    render(<SystemHealthPanel realtimeState="subscribed" />);
    expect(screen.getByText("Authentication")).toBeTruthy();
    expect(screen.getAllByText("Operational").length).toBeGreaterThan(0);
    expect(screen.getByText("Session active")).toBeTruthy();
  });

  it("shows Realtime as Operational only when the probe actually subscribed", () => {
    setup("authenticated");
    render(<SystemHealthPanel realtimeState="subscribed" />);
    expect(screen.getByText("Connected")).toBeTruthy();
  });

  it("never claims Realtime is connected when the probe reports an error", () => {
    setup("authenticated");
    render(<SystemHealthPanel realtimeState="error" />);
    expect(screen.getByText("Degraded")).toBeTruthy();
    expect(screen.queryByText("Connected")).toBeNull();
  });

  it("honestly reports SAP Integration and Notification Service as not configured, never as healthy", () => {
    setup("authenticated");
    render(<SystemHealthPanel realtimeState="subscribed" />);
    expect(screen.getByText("SAP Integration")).toBeTruthy();
    expect(screen.getByText("Notification Service")).toBeTruthy();
    expect(screen.getAllByText("Not configured").length).toBe(2);
  });

  it("reports Background Jobs as Unknown, not fabricated as healthy", () => {
    setup("authenticated");
    render(<SystemHealthPanel realtimeState="subscribed" />);
    expect(screen.getByText("Background Jobs")).toBeTruthy();
    expect(screen.getByText("Unknown")).toBeTruthy();
  });
});
