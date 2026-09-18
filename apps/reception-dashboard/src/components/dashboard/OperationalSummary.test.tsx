// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { OperationalSummary } from "./OperationalSummary";
import { useAuthorization } from "../../contexts/AuthorizationContext";
import { useNotificationCenter } from "../../contexts/NotificationContext";
import { OPERATIONAL_SUMMARY_METRICS } from "../../features/dashboard";

vi.mock("../../contexts/AuthorizationContext", () => ({ useAuthorization: vi.fn() }));
vi.mock("../../contexts/NotificationContext", () => ({ useNotificationCenter: vi.fn() }));

const mockUseAuthorization = vi.mocked(useAuthorization);
const mockUseNotificationCenter = vi.mocked(useNotificationCenter);

afterEach(cleanup);

function setup(hasPermission: (p: string) => boolean) {
  mockUseAuthorization.mockReturnValue({
    role: "reception_warden",
    hostelId: null,
    staffName: null,
    permissions: [],
    isAuthorizationLoading: false,
    isAuthorized: true,
    authorizationError: null,
    hasRole: () => false,
    hasPermission: hasPermission as never,
    can: () => false,
    canAccessHostel: () => false,
    refreshAuthorization: vi.fn(),
  } as never);
  mockUseNotificationCenter.mockReturnValue({
    notifications: [],
    unreadCount: 0,
    isLoading: false,
    error: null,
    refresh: vi.fn(),
    markAsRead: vi.fn(),
    acknowledge: vi.fn(),
    dismiss: vi.fn(),
    archive: vi.fn(),
    markAllAsRead: vi.fn(),
  });
}

describe("OperationalSummary", () => {
  it("renders every metric when every permission is granted", () => {
    setup(() => true);
    render(
      <MemoryRouter>
        <OperationalSummary />
      </MemoryRouter>,
    );
    for (const metric of OPERATIONAL_SUMMARY_METRICS) {
      expect(screen.getByText(metric.label)).toBeTruthy();
    }
    // The one genuinely REAL metric (Prompt 6) — composed from the
    // canonical NotificationContext, not a second placeholder.
    expect(screen.getByText("Active Notifications")).toBeTruthy();
    expect(screen.getByText("0")).toBeTruthy();
  });

  it("hides a metric whose destination the caller lacks permission for", () => {
    setup(() => false);
    const { container } = render(
      <MemoryRouter>
        <OperationalSummary />
      </MemoryRouter>,
    );
    expect(container.textContent).not.toContain("Pending Parent Approvals");
  });

  it("is a labelled section landmark", () => {
    setup(() => true);
    render(
      <MemoryRouter>
        <OperationalSummary />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Operational Summary" })).toBeTruthy();
  });
});
