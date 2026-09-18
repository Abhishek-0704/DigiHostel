// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LeaveQueuePage from "./LeaveQueuePage";
import { useLeaveQueue } from "../features/leave";
import { useLeaveQueueRealtime } from "../hooks";
import { useAuthorization } from "../contexts/AuthorizationContext";
import type { LeaveQueueItem, LeaveQueueState } from "../features/leave";

vi.mock("../features/leave", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../features/leave")>()),
  useLeaveQueue: vi.fn(),
}));
vi.mock("../hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../hooks")>()),
  useLeaveQueueRealtime: vi.fn(() => "connected"),
}));
vi.mock("../contexts/AuthorizationContext", () => ({ useAuthorization: vi.fn() }));

const mockUseLeaveQueue = vi.mocked(useLeaveQueue);
const mockUseLeaveQueueRealtime = vi.mocked(useLeaveQueueRealtime);
const mockUseAuthorization = vi.mocked(useAuthorization);

afterEach(cleanup);

function fixture(overrides: Partial<LeaveQueueItem> = {}): LeaveQueueItem {
  return {
    id: "lr1",
    studentId: "s1",
    studentRollNumber: "TEST-001",
    studentFullName: "Jane Doe",
    studentHostelId: "h1",
    studentHostelName: "Kalinga",
    studentRoomId: "r1",
    studentRoomNumber: "101",
    reason: "Family function",
    startDate: "2026-01-10",
    endDate: "2026-01-12",
    status: "pending",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function setup(items: LeaveQueueItem[] = [], overrides: Partial<LeaveQueueState> = {}) {
  mockUseLeaveQueue.mockReturnValue({
    items,
    isLoading: false,
    isFetching: false,
    error: null,
    refresh: vi.fn(),
    ...overrides,
  });
  mockUseLeaveQueueRealtime.mockReturnValue("connected");
  mockUseAuthorization.mockReturnValue({
    role: "reception_warden",
    hostelId: "h1",
    staffName: null,
    permissions: [],
    isAuthorizationLoading: false,
    isAuthorized: true,
    authorizationError: null,
    hasRole: () => false,
    hasPermission: () => true,
    can: () => false,
    canAccessHostel: () => false,
    refreshAuthorization: vi.fn(),
  } as never);
}

function renderPage() {
  return render(
    <MemoryRouter>
      <LeaveQueuePage />
    </MemoryRouter>,
  );
}

describe("LeaveQueuePage", () => {
  it("renders inside the shell's page template with the real title and breadcrumb", () => {
    setup([]);
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Leave Requests" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeTruthy();
  });

  it("shows the honest empty state when the queue is empty", () => {
    setup([]);
    renderPage();
    expect(screen.getByText("No leave requests")).toBeTruthy();
  });

  it("lists real leave requests from the queue", () => {
    setup([fixture()]);
    renderPage();
    expect(screen.getByText("Jane Doe")).toBeTruthy();
  });

  it("search narrows the visible list", () => {
    setup([
      fixture({ id: "a", studentFullName: "Jane Doe" }),
      fixture({ id: "b", studentFullName: "John Roe" }),
    ]);
    renderPage();
    fireEvent.change(screen.getByLabelText("Search leave requests"), {
      target: { value: "jane" },
    });
    expect(screen.getByText("Jane Doe")).toBeTruthy();
    expect(screen.queryByText("John Roe")).toBeNull();
  });

  it("selecting a request opens its detail, and closing returns to the list", () => {
    setup([fixture()]);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "View" }));
    expect(screen.getByRole("heading", { name: "Jane Doe" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close leave request detail" }));
    expect(screen.getByText("No request selected")).toBeTruthy();
  });

  it("shows the hostel-scope indicator for a hostel-scoped role", () => {
    setup([]);
    renderPage();
    expect(screen.getByText("Hostel-scoped")).toBeTruthy();
  });

  it("shows 'All hostels' for super_admin", () => {
    setup([]);
    mockUseAuthorization.mockReturnValue({
      role: "super_admin",
      hostelId: null,
      staffName: null,
      permissions: [],
      isAuthorizationLoading: false,
      isAuthorized: true,
      authorizationError: null,
      hasRole: () => false,
      hasPermission: () => true,
      can: () => false,
      canAccessHostel: () => false,
      refreshAuthorization: vi.fn(),
    } as never);
    renderPage();
    expect(screen.getByText("All hostels")).toBeTruthy();
  });

  it("propagates a real fetch error to the table with a retry action", () => {
    const refresh = vi.fn();
    setup([], {
      error: {
        name: "AppError",
        message: "x",
        kind: "unknown",
        userMessage: "Something went wrong. Please try again.",
      } as never,
      refresh,
    });
    renderPage();
    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refresh).toHaveBeenCalled();
  });

  it("never renders a fabricated leave request — only what the real queue hook actually provides", () => {
    setup([]);
    renderPage();
    expect(screen.queryByText(/Jane Doe/)).toBeNull();
  });
});
