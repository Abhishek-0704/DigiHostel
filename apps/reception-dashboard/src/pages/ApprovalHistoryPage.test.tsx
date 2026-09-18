// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import ApprovalHistoryPage from "./ApprovalHistoryPage";
import { useLeaveQueue } from "../features/leave";
import { useAuthorization } from "../contexts/AuthorizationContext";
import type { LeaveQueueState } from "../features/leave";
import type { LeaveQueueItem } from "../features/leave/types";

vi.mock("../features/leave", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../features/leave")>()),
  useLeaveQueue: vi.fn(),
}));
vi.mock("../hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../hooks")>()),
  useDebouncedValue: (value: unknown) => value,
}));
vi.mock("../contexts/AuthorizationContext", () => ({ useAuthorization: vi.fn() }));

const mockUseLeaveQueue = vi.mocked(useLeaveQueue);
const mockUseAuthorization = vi.mocked(useAuthorization);

afterEach(cleanup);

function fixtureItem(overrides: Partial<LeaveQueueItem> = {}): LeaveQueueItem {
  return {
    id: "leave-1",
    studentId: "s1",
    studentRollNumber: "TEST-001",
    studentFullName: "Jane Doe",
    studentHostelId: "h1",
    studentHostelName: "Kalinga",
    studentRoomId: "r1",
    studentRoomNumber: "101",
    reason: "Family function",
    startDate: "2026-01-01",
    endDate: "2026-01-02",
    status: "approved",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T01:00:00.000Z",
    ...overrides,
  } as LeaveQueueItem;
}

function setup(items: LeaveQueueItem[], overrides: Partial<LeaveQueueState> = {}) {
  mockUseLeaveQueue.mockReturnValue({
    items,
    isLoading: false,
    isFetching: false,
    error: null,
    refresh: vi.fn(),
    ...overrides,
  });
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
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/approval-history"]}>
        <ApprovalHistoryPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ApprovalHistoryPage", () => {
  it("defaults to showing only decided (terminal-status) requests, excluding a still-pending one", () => {
    setup([
      fixtureItem({
        id: "leave-approved",
        status: "approved",
        studentFullName: "Approved Student",
      }),
      fixtureItem({ id: "leave-pending", status: "pending", studentFullName: "Pending Student" }),
    ]);
    renderPage();
    expect(screen.getByText("Approved Student")).toBeTruthy();
    expect(screen.queryByText("Pending Student")).toBeNull();
  });

  it("toggling to 'All requests' reveals the pending request too — reusing the SAME already-fetched dataset (useLeaveQueue takes no scope-varying params, so no new query key is ever created)", () => {
    setup([
      fixtureItem({
        id: "leave-approved",
        status: "approved",
        studentFullName: "Approved Student",
      }),
      fixtureItem({ id: "leave-pending", status: "pending", studentFullName: "Pending Student" }),
    ]);
    renderPage();
    fireEvent.click(screen.getByRole("radio", { name: /All requests/ }));
    expect(screen.getByText("Pending Student")).toBeTruthy();
    expect(mockUseLeaveQueue.mock.calls.every((call) => call.length === 0)).toBe(true);
  });

  it("search narrows to matching student name/roll number", () => {
    setup([
      fixtureItem({
        id: "leave-1",
        status: "approved",
        studentFullName: "Alpha One",
        studentRollNumber: "A001",
      }),
      fixtureItem({
        id: "leave-2",
        status: "rejected",
        studentFullName: "Beta Two",
        studentRollNumber: "B002",
      }),
    ]);
    renderPage();
    fireEvent.change(screen.getByLabelText("Search history"), { target: { value: "Alpha" } });
    expect(screen.getByText("Alpha One")).toBeTruthy();
    expect(screen.queryByText("Beta Two")).toBeNull();
  });

  it("shows an honest empty state when no decided requests exist", () => {
    setup([fixtureItem({ status: "pending" })]);
    renderPage();
    expect(screen.getByText("No decided requests yet")).toBeTruthy();
  });

  it("shows an honest error state without fabricating data", () => {
    setup([], { error: { userMessage: "Something went wrong." } as never });
    renderPage();
    expect(screen.getByText("Something went wrong.")).toBeTruthy();
  });

  it("shows the caller's hostel scope indicator", () => {
    setup([fixtureItem()]);
    renderPage();
    expect(screen.getByText("Hostel-scoped")).toBeTruthy();
  });
});
