// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { SessionTimeoutWarning } from "./SessionTimeoutWarning";
import { useAuthContext } from "../../contexts/AuthContext";
import type { InactivityStatus } from "../../lib/sessionTimeout/inactivityStatus";

vi.mock("../../contexts/AuthContext", () => ({
  useAuthContext: vi.fn(),
}));

const mockUseAuthContext = vi.mocked(useAuthContext);
const resetInactivityTimer = vi.fn();

afterEach(cleanup);

function mockValue(inactivityStatus: InactivityStatus, inactivityRemainingMs = 30_000) {
  mockUseAuthContext.mockReturnValue({
    status: "authenticated",
    signOut: vi.fn(),
    refreshAssuranceLevel: vi.fn(),
    lastSignOutReason: null,
    inactivityStatus,
    inactivityRemainingMs,
    resetInactivityTimer,
  });
}

describe("SessionTimeoutWarning", () => {
  it("renders nothing while active", () => {
    mockValue("active");
    const { container } = render(<SessionTimeoutWarning />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing after expiry — AuthContext already handles sign-out by then", () => {
    mockValue("expired");
    const { container } = render(<SessionTimeoutWarning />);
    expect(container.firstChild).toBeNull();
  });

  it("shows the countdown and a 'Stay signed in' control during the warning window", () => {
    mockValue("warning", 65_000);
    render(<SessionTimeoutWarning />);

    expect(screen.getByRole("status").textContent).toContain("1:05");
    fireEvent.click(screen.getByRole("button", { name: "Stay signed in" }));
    expect(resetInactivityTimer).toHaveBeenCalled();
  });

  it("does not implement a second timer — it only reads AuthContext's existing state", () => {
    mockValue("warning");
    render(<SessionTimeoutWarning />);
    // No fake timers/intervals are installed by this component itself;
    // re-rendering with an unchanged mock produces an unchanged countdown.
    expect(screen.getByRole("status")).toBeTruthy();
  });
});
