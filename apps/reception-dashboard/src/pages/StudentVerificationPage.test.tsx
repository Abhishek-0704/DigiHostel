// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import StudentVerificationPage from "./StudentVerificationPage";
import { useLeaveQueue, useLeaveApprovalEvents, useAuthorizeExit } from "../features/leave";
import { useLeaveQueueRealtime, useLeaveApprovalEventsRealtime } from "../hooks";
import { useAuthorization } from "../contexts/AuthorizationContext";
import type {
  LeaveQueueItem,
  LeaveQueueState,
  LeaveApprovalEventsState,
  AuthorizeExitState,
} from "../features/leave";
import type { LeaveApprovalEvent } from "@digihostel/api-client-react";

// jsdom does not implement <dialog>'s showModal()/close() (Dialog.tsx relies
// on the native element for focus trapping/Escape-to-close) — this is the
// first test in this codebase to actually open a ConfirmationDialog, so no
// existing polyfill exists to reuse. A minimal one, scoped to this file only.
if (typeof HTMLDialogElement !== "undefined") {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}

vi.mock("../features/leave", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../features/leave")>()),
  useLeaveQueue: vi.fn(),
  useLeaveApprovalEvents: vi.fn(),
  useAuthorizeExit: vi.fn(),
}));
vi.mock("../hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../hooks")>()),
  useLeaveQueueRealtime: vi.fn(() => "connected"),
  useLeaveApprovalEventsRealtime: vi.fn(() => "connected"),
}));
vi.mock("../contexts/AuthorizationContext", () => ({ useAuthorization: vi.fn() }));

const mockUseLeaveQueue = vi.mocked(useLeaveQueue);
const mockUseLeaveApprovalEvents = vi.mocked(useLeaveApprovalEvents);
const mockUseAuthorizeExit = vi.mocked(useAuthorizeExit);
const mockUseLeaveQueueRealtime = vi.mocked(useLeaveQueueRealtime);
const mockUseLeaveApprovalEventsRealtime = vi.mocked(useLeaveApprovalEventsRealtime);
const mockUseAuthorization = vi.mocked(useAuthorization);

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
    status: "approved",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

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

function setupAuthorizeExit(overrides: Partial<AuthorizeExitState> = {}) {
  mockUseAuthorizeExit.mockReturnValue({
    authorize: vi.fn(),
    isPending: false,
    error: null,
    data: null,
    reset: vi.fn(),
    ...overrides,
  });
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
  setupAuthorizeExit();
}

function renderPage(rollNumber = "TEST-001", leaveRequestId: string | null = "lr-42") {
  const queryClient = new QueryClient();
  const search = leaveRequestId ? `?leaveRequestId=${leaveRequestId}` : "";
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/students/${rollNumber}/verification${search}`]}>
        <Routes>
          <Route path="/students/:rollNumber/verification" element={<StudentVerificationPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("StudentVerificationPage", () => {
  it("shows an honest empty state when no leaveRequestId query parameter is present", () => {
    setup([fixtureItem()]);
    renderPage("TEST-001", null);
    expect(screen.getByText("No leave request selected")).toBeTruthy();
  });

  it("shows an honest not-found state for an id the queue doesn't contain", () => {
    setup([fixtureItem({ id: "some-other-id" })]);
    renderPage();
    expect(
      screen.getByText(/could not be found, or you are not authorized to view it/),
    ).toBeTruthy();
  });

  it("renders real student/leave details for a found, approved request", () => {
    setup([fixtureItem()]);
    renderPage();
    expect(screen.getByText("TEST-001")).toBeTruthy();
    expect(screen.getByText("Kalinga")).toBeTruthy();
    expect(screen.getByText("Family function")).toBeTruthy();
  });

  it("shows the blocked banner and denies checklist success for a non-approved leave request", () => {
    setup([fixtureItem({ status: "father_notified" })]);
    renderPage();
    expect(screen.getByRole("alert").textContent).toContain("father_notified");
    expect(screen.getByText(/Not complete \(father_notified\)/)).toBeTruthy();
  });

  it("never checks mentor/SAP approval as a real precondition — shown as informational-only, not available", () => {
    setup([fixtureItem()]);
    renderPage();
    expect(screen.getByText(/Mentor\/SAP approval/)).toBeTruthy();
    expect(screen.getByText("Not available")).toBeTruthy();
  });

  it("shows real parent-approval evidence from the approval event timeline when available", () => {
    setup([fixtureItem()], {}, [
      {
        id: "ev1",
        eventType: "responded",
        response: "approved",
        biometricConfirmed: true,
        occurredAt: "2026-01-05T10:00:00.000Z",
      },
    ]);
    renderPage();
    expect(screen.getAllByText(/Approved/).length).toBeGreaterThan(0);
  });

  it("the Authorize Exit action is hidden without the movement:exit permission", () => {
    setup([fixtureItem()]);
    setupAuthorization(() => false);
    renderPage();
    expect(screen.queryByRole("button", { name: "Authorize Exit" })).toBeNull();
  });

  it("Authorize Exit stays disabled until identity is confirmed, even for an approved request", () => {
    setup([fixtureItem()]);
    renderPage();
    const button = screen.getByRole("button", { name: "Authorize Exit" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);
    expect(button.disabled).toBe(false);
  });

  it("the identity-confirmation checkbox is disabled for a non-approved request", () => {
    setup([fixtureItem({ status: "father_notified" })]);
    renderPage();
    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    expect(checkbox.disabled).toBe(true);
  });

  it("clicking Authorize Exit opens a confirmation dialog before calling the mutation", () => {
    const authorize = vi.fn();
    setup([fixtureItem()]);
    setupAuthorizeExit({ authorize });
    renderPage();

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Authorize Exit" }));

    expect(screen.getByText("Confirm Exit Authorization")).toBeTruthy();
    expect(authorize).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Confirm Authorization" }));
    expect(authorize).toHaveBeenCalledWith("lr-42");
  });

  it("shows an honest error message when the mutation fails", () => {
    setup([fixtureItem()]);
    setupAuthorizeExit({
      error: { kind: "conflict", userMessage: "Already authorized." } as never,
    });
    renderPage();
    expect(screen.getByText("Already authorized.")).toBeTruthy();
  });

  it("shows a real success state once the exit is authorized, and hides the action panel", () => {
    setup([fixtureItem()]);
    setupAuthorizeExit({
      data: {
        id: "exit-1",
        leaveRequestId: "lr-42",
        identityConfirmed: true,
        authorizedAt: "2026-01-06T09:00:00.000Z",
      } as never,
    });
    renderPage();
    expect(screen.getByText("Exit authorized")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Authorize Exit" })).toBeNull();
  });
});
