// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import StudentReturnPage from "./StudentReturnPage";
import { useStudentProfile } from "../features/students";
import { useRecordHostelReturn } from "../features/movement";
import { useLeaveApprovalEventsRealtime } from "../hooks";
import { useAuthorization } from "../contexts/AuthorizationContext";
import type { StudentProfileState } from "../features/students";
import type { RecordHostelReturnState } from "../features/movement";
import type { StudentProfile } from "@digihostel/api-client-react";

// jsdom does not implement <dialog>'s showModal()/close() — same minimal
// polyfill StudentVerificationPage.test.tsx already established as this
// codebase's first ConfirmationDialog test, reused verbatim here.
if (typeof HTMLDialogElement !== "undefined") {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}

vi.mock("../features/students", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../features/students")>()),
  useStudentProfile: vi.fn(),
}));
vi.mock("../features/movement", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../features/movement")>()),
  useRecordHostelReturn: vi.fn(),
}));
vi.mock("../hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../hooks")>()),
  useLeaveApprovalEventsRealtime: vi.fn(() => "connected"),
}));
vi.mock("../contexts/AuthorizationContext", () => ({ useAuthorization: vi.fn() }));

const mockUseStudentProfile = vi.mocked(useStudentProfile);
const mockUseRecordHostelReturn = vi.mocked(useRecordHostelReturn);
const mockUseLeaveApprovalEventsRealtime = vi.mocked(useLeaveApprovalEventsRealtime);
const mockUseAuthorization = vi.mocked(useAuthorization);

afterEach(cleanup);

const LEAVE_ID = "lr-42";

function fixtureProfile(overrides: Partial<StudentProfile> = {}): StudentProfile {
  return {
    id: "s1",
    rollNumber: "TEST-001",
    fullName: "Jane Doe",
    hostelId: "h1",
    hostelName: "Kalinga",
    roomId: "r1",
    roomNumber: "101",
    guardians: [],
    currentLeave: {
      id: LEAVE_ID,
      status: "approved",
      reason: "Family function",
      startDate: "2026-01-10",
      endDate: "2026-01-12",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      exitAuthorized: true,
      exitAuthorizedAt: "2026-01-05T10:00:00.000Z",
      returnRecorded: false,
      returnedAt: null,
    },
    timeline: [],
    hostelPresence: "outside_hostel",
    ...overrides,
  };
}

function setupAuthorization(hasPermission: (p: string) => boolean = () => true) {
  mockUseAuthorization.mockReturnValue({
    role: "reception_warden",
    hostelId: "h1",
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

function setupReturn(overrides: Partial<RecordHostelReturnState> = {}) {
  mockUseRecordHostelReturn.mockReturnValue({
    record: vi.fn(),
    isPending: false,
    error: null,
    data: null,
    reset: vi.fn(),
    ...overrides,
  });
}

function setup(profileOverrides: Partial<StudentProfileState> = {}) {
  mockUseStudentProfile.mockReturnValue({
    profile: fixtureProfile(),
    isLoading: false,
    error: null,
    refresh: vi.fn(),
    ...profileOverrides,
  });
  mockUseLeaveApprovalEventsRealtime.mockReturnValue("connected");
  setupAuthorization();
  setupReturn();
}

function renderPage(rollNumber = "TEST-001", leaveRequestId: string | null = LEAVE_ID) {
  const queryClient = new QueryClient();
  const search = leaveRequestId ? `?leaveRequestId=${leaveRequestId}` : "";
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/students/${rollNumber}/return${search}`]}>
        <Routes>
          <Route path="/students/:rollNumber/return" element={<StudentReturnPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("StudentReturnPage", () => {
  it("shows an honest empty state when no leaveRequestId query parameter is present", () => {
    setup();
    renderPage("TEST-001", null);
    expect(screen.getByText("No leave request selected")).toBeTruthy();
  });

  it("renders real student/movement details for an eligible leave", () => {
    setup();
    renderPage();
    expect(screen.getByText("TEST-001")).toBeTruthy();
    expect(screen.getByText("Kalinga")).toBeTruthy();
  });

  it("shows the server-derived hostel presence badge, matching the profile response", () => {
    setup();
    renderPage();
    expect(screen.getByText("Outside Hostel")).toBeTruthy();
  });

  it("shows the verification checklist as eligible when approved + exit-authorized + not yet returned", () => {
    setup();
    renderPage();
    expect(screen.getByRole("button", { name: "Register Return" })).toBeTruthy();
  });

  it("marks the checklist ineligible when the leave has not been exit-authorized", () => {
    setup({
      profile: fixtureProfile({
        currentLeave: {
          ...fixtureProfile().currentLeave!,
          exitAuthorized: false,
          exitAuthorizedAt: null,
        },
        hostelPresence: "inside_hostel",
      }) as never,
    });
    renderPage();
    const button = screen.getByRole("button", { name: "Register Return" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("shows a real success state once already returned, and hides the action panel", () => {
    setup({
      profile: fixtureProfile({
        currentLeave: {
          ...fixtureProfile().currentLeave!,
          returnRecorded: true,
          returnedAt: "2026-01-06T09:00:00.000Z",
        },
        hostelPresence: "inside_hostel",
      }) as never,
    });
    renderPage();
    expect(screen.getAllByText("Return recorded").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Register Return" })).toBeNull();
  });

  it("the Register Return action is hidden without the movement:return permission", () => {
    setup();
    setupAuthorization(() => false);
    renderPage();
    expect(screen.queryByRole("button", { name: "Register Return" })).toBeNull();
  });

  it("clicking Register Return opens a confirmation dialog before calling the mutation", () => {
    const record = vi.fn();
    setup();
    setupReturn({ record });
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Register Return" }));
    expect(screen.getByText("Confirm Register Return")).toBeTruthy();
    expect(record).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Confirm Return" }));
    expect(record).toHaveBeenCalledWith({ leaveRequestId: LEAVE_ID, rollNumber: "TEST-001" });
  });

  it("shows an honest error message when the mutation fails", () => {
    setup();
    setupReturn({ error: { kind: "conflict", userMessage: "Already returned." } as never });
    renderPage();
    expect(screen.getByText("Already returned.")).toBeTruthy();
  });

  it("shows a real success state once the mutation succeeds", () => {
    setup();
    setupReturn({
      data: {
        id: "movement-1",
        leaveRequestId: LEAVE_ID,
        studentId: "s1",
        occurredAt: "2026-01-06T09:00:00.000Z",
      } as never,
    });
    renderPage();
    expect(screen.getAllByText("Return recorded").length).toBeGreaterThan(0);
  });

  it("shows an honest error state for an inaccessible/nonexistent student", () => {
    setup({
      profile: null,
      error: { userMessage: "We couldn't find what you were looking for." } as never,
    });
    renderPage();
    expect(screen.getByText("We couldn't find what you were looking for.")).toBeTruthy();
  });
});
