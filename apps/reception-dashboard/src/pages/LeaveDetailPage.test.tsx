// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import LeaveDetailPage from "./LeaveDetailPage";
import { useLeaveQueue, useLeaveApprovalEvents } from "../features/leave";
import { useLeaveQueueRealtime, useLeaveApprovalEventsRealtime } from "../hooks";
import { useAuthorization } from "../contexts/AuthorizationContext";
import type { LeaveQueueItem, LeaveQueueState, LeaveApprovalEventsState } from "../features/leave";
import type { LeaveApprovalEvent } from "@digihostel/api-client-react";

vi.mock("../features/leave", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../features/leave")>()),
  useLeaveQueue: vi.fn(),
  useLeaveApprovalEvents: vi.fn(),
}));
vi.mock("../hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../hooks")>()),
  useLeaveQueueRealtime: vi.fn(() => "connected"),
  useLeaveApprovalEventsRealtime: vi.fn(() => "connected"),
}));
vi.mock("../contexts/AuthorizationContext", () => ({ useAuthorization: vi.fn() }));

const mockUseLeaveQueue = vi.mocked(useLeaveQueue);
const mockUseLeaveApprovalEvents = vi.mocked(useLeaveApprovalEvents);
const mockUseLeaveQueueRealtime = vi.mocked(useLeaveQueueRealtime);
const mockUseLeaveApprovalEventsRealtime = vi.mocked(useLeaveApprovalEventsRealtime);
const mockUseAuthorization = vi.mocked(useAuthorization);

// Reception-Initiated Parent Approval correction: the page now renders a
// permission-gated "Send for Parent Approval" button (`Can`), so every test
// needs a real (mocked) authorization result — matches
// `LeaveRequestDetailPanel.test.tsx`'s established `setupAuthorization`
// pattern. Grants the permission by default so its presence is the norm the
// dedicated tests below deviate from, not the other way around.
function setupAuthorization(hasPermission: (p: string) => boolean = () => true) {
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
}

afterEach(cleanup);

function fixtureItem(overrides: Partial<LeaveQueueItem> = {}): LeaveQueueItem {
  return {
    id: "lr-42",
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
    status: "father_notified",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function setup(
  items: LeaveQueueItem[],
  queueOverrides: Partial<LeaveQueueState> = {},
  events: LeaveApprovalEvent[] = [],
  eventsOverrides: Partial<LeaveApprovalEventsState> = {},
) {
  mockUseLeaveQueue.mockReturnValue({
    items,
    isLoading: false,
    isFetching: false,
    error: null,
    refresh: vi.fn(),
    ...queueOverrides,
  });
  mockUseLeaveApprovalEvents.mockReturnValue({
    events,
    isLoading: false,
    error: null,
    refresh: vi.fn(),
    ...eventsOverrides,
  });
  mockUseLeaveQueueRealtime.mockReturnValue("connected");
  mockUseLeaveApprovalEventsRealtime.mockReturnValue("connected");
  setupAuthorization();
}

function renderPage(id = "lr-42") {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/leave/${id}`]}>
        <Routes>
          <Route path="/leave/:id" element={<LeaveDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("LeaveDetailPage", () => {
  it("shows a loading state while the queue is still resolving", () => {
    setup([], { isLoading: true });
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Approval Session" })).toBeTruthy();
  });

  it("shows an honest not-found/not-authorized state for an id the queue doesn't contain", () => {
    setup([fixtureItem({ id: "some-other-id" })]);
    renderPage("lr-42");
    expect(
      screen.getByText(/could not be found, or you are not authorized to view it/),
    ).toBeTruthy();
  });

  it("renders the real student, status, and leave period for a found request", () => {
    setup([fixtureItem()]);
    renderPage();
    expect(
      screen.getByRole("heading", { level: 1, name: "Approval Session — Jane Doe" }),
    ).toBeTruthy();
    expect(screen.getByText("TEST-001")).toBeTruthy();
    expect(screen.getByText("Father notified")).toBeTruthy();
  });

  it("shows the real approval timeline", () => {
    setup([fixtureItem()], {}, [
      {
        id: "ev1",
        eventType: "escalated",
        response: null,
        biometricConfirmed: false,
        occurredAt: "2026-01-01T01:00:00.000Z",
      },
    ]);
    renderPage();
    expect(screen.getByText("Escalated to next contact")).toBeTruthy();
  });

  it("shows the result banner and handoff note for an approved session", () => {
    setup([fixtureItem({ status: "approved" })]);
    renderPage();
    expect(screen.getByText("Session approved")).toBeTruthy();
    expect(screen.getByText(/Ready for Student Verification/)).toBeTruthy();
  });

  it("shows a real 'Verify Student' navigation link for an approved session when the caller holds student:verify", () => {
    setup([fixtureItem({ status: "approved" })]);
    renderPage();
    expect(screen.getByRole("button", { name: "Verify Student" })).toBeTruthy();
  });

  it("hides the 'Verify Student' link when the caller lacks student:verify (fail closed)", () => {
    setup([fixtureItem({ status: "approved" })]);
    setupAuthorization(() => false);
    renderPage();
    expect(screen.queryByRole("button", { name: "Verify Student" })).toBeNull();
  });

  it("never shows the 'Verify Student' link for a non-terminal session (nothing to hand off yet)", () => {
    setup([fixtureItem({ status: "father_notified" })]);
    renderPage();
    expect(screen.queryByRole("button", { name: "Verify Student" })).toBeNull();
  });

  it("shows the manual-verification note when escalation is exhausted", () => {
    setup([fixtureItem({ status: "manual_verification" })]);
    renderPage();
    expect(screen.getByText(/Automated escalation is exhausted/)).toBeTruthy();
  });

  it("never shows parent/guardian identity", () => {
    setup([fixtureItem()]);
    renderPage();
    expect(screen.getByText(/not exposed to reception staff through this workspace/)).toBeTruthy();
  });

  describe("Reception-Initiated Parent Approval correction — Send for Parent Approval action", () => {
    it("shows the Send for Parent Approval action for a pending request when the caller holds the permission", () => {
      setup([fixtureItem({ status: "pending" })]);
      renderPage();
      expect(screen.getByRole("button", { name: "Send for Parent Approval" })).toBeTruthy();
      expect(screen.getByText(/has not been sent for parent approval yet/)).toBeTruthy();
    });

    it("hides the Send for Parent Approval action when the caller lacks the permission (fail closed, same as every other Can-gated control)", () => {
      setup([fixtureItem({ status: "pending" })]);
      setupAuthorization(() => false);
      renderPage();
      expect(screen.queryByRole("button", { name: "Send for Parent Approval" })).toBeNull();
    });

    it.each(["father_notified", "manual_verification", "approved", "rejected", "expired"] as const)(
      "never shows the Send for Parent Approval action once the request is past pending (%s)",
      (status) => {
        setup([fixtureItem({ status })]);
        renderPage();
        expect(screen.queryByRole("button", { name: "Send for Parent Approval" })).toBeNull();
      },
    );
  });
});
