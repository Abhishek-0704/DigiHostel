// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import StudentProfilePage from "./StudentProfilePage";
import { useStudentProfile } from "../features/students";
import { useLeaveApprovalEventsRealtime } from "../hooks";
import { useAuthorization } from "../contexts/AuthorizationContext";
import type { StudentProfileState } from "../features/students";
import type { StudentProfile } from "@digihostel/api-client-react";

vi.mock("../features/students", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../features/students")>()),
  useStudentProfile: vi.fn(),
}));
vi.mock("../hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../hooks")>()),
  useLeaveApprovalEventsRealtime: vi.fn(() => "connected"),
}));
vi.mock("../contexts/AuthorizationContext", () => ({ useAuthorization: vi.fn() }));

const mockUseStudentProfile = vi.mocked(useStudentProfile);
const mockUseLeaveApprovalEventsRealtime = vi.mocked(useLeaveApprovalEventsRealtime);
const mockUseAuthorization = vi.mocked(useAuthorization);

afterEach(cleanup);

function fixtureProfile(overrides: Partial<StudentProfile> = {}): StudentProfile {
  return {
    id: "s1",
    rollNumber: "TEST-001",
    fullName: "Jane Doe",
    hostelId: "h1",
    hostelName: "Kalinga",
    roomId: "r1",
    roomNumber: "101",
    guardians: [{ fullName: "John Doe", relationshipType: "father", phoneNumber: "9999999999" }],
    currentLeave: null,
    timeline: [],
    hostelPresence: "inside_hostel",
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

function setup(overrides: Partial<StudentProfileState> = {}) {
  mockUseStudentProfile.mockReturnValue({
    profile: fixtureProfile(),
    isLoading: false,
    error: null,
    refresh: vi.fn(),
    ...overrides,
  });
  mockUseLeaveApprovalEventsRealtime.mockReturnValue("connected");
  setupAuthorization();
}

function renderPage(rollNumber = "TEST-001") {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/students/${rollNumber}`]}>
        <Routes>
          <Route path="/students/:rollNumber" element={<StudentProfilePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("StudentProfilePage", () => {
  it("renders identity and hostel information", () => {
    setup();
    renderPage();
    expect(screen.getByText("Kalinga")).toBeTruthy();
    expect(screen.getByText("101")).toBeTruthy();
  });

  it("shows the server-derived hostel presence badge (Inside Hostel by default)", () => {
    setup();
    renderPage();
    expect(screen.getByText("Inside Hostel")).toBeTruthy();
  });

  it("shows Outside Hostel when the server reports hostelPresence: outside_hostel", () => {
    setup({ profile: fixtureProfile({ hostelPresence: "outside_hostel" }) });
    renderPage();
    expect(screen.getByText("Outside Hostel")).toBeTruthy();
  });

  it("renders guardian information without fabricating a second guardian", () => {
    setup();
    renderPage();
    expect(screen.getByText("John Doe")).toBeTruthy();
  });

  it("shows an honest absence message when there are no linked guardians", () => {
    setup({ profile: fixtureProfile({ guardians: [] }) });
    renderPage();
    expect(screen.getByText("No linked parent/guardian on record.")).toBeTruthy();
  });

  it("shows an honest absence message when the student has no leave request — never a fabricated status", () => {
    setup();
    renderPage();
    expect(screen.getByText("This student has no leave request on record.")).toBeTruthy();
  });

  it("renders real current-leave data when a leave request exists", () => {
    setup({
      profile: fixtureProfile({
        currentLeave: {
          id: "lr-1",
          status: "approved",
          reason: "Family function",
          startDate: "2026-01-10",
          endDate: "2026-01-12",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          exitAuthorized: false,
          exitAuthorizedAt: null,
          returnRecorded: false,
          returnedAt: null,
        },
      }),
    });
    renderPage();
    expect(screen.getByText("Family function")).toBeTruthy();
    expect(screen.getByText("No exit authorization recorded for this leave request.")).toBeTruthy();
  });

  it("never claims mentor/academic/SAP data exists — always shown as unavailable", () => {
    setup();
    renderPage();
    expect(screen.getByText(/no data source/)).toBeTruthy();
    expect(screen.getByText(/BLOCKED \/ NOT IMPLEMENTED/)).toBeTruthy();
  });

  it("shows the Verify Student action only when the current leave is approved and the permission is granted", () => {
    setup({
      profile: fixtureProfile({
        currentLeave: {
          id: "lr-1",
          status: "father_notified",
          reason: "x",
          startDate: "2026-01-10",
          endDate: "2026-01-12",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          exitAuthorized: false,
          exitAuthorizedAt: null,
          returnRecorded: false,
          returnedAt: null,
        },
      }),
    });
    renderPage();
    expect(screen.queryByRole("button", { name: "Verify Student" })).toBeNull();
  });

  it("shows every future quick action as disabled — never a fake working route", () => {
    setup();
    renderPage();
    const button = screen.getByRole("button", { name: "Library Pass" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("shows the real Report Emergency action (Phase 4, Prompt 10 — no longer a disabled placeholder)", () => {
    setup();
    renderPage();
    const button = screen.getByRole("button", { name: "Report Emergency" }) as HTMLButtonElement;
    expect(button.disabled).toBeFalsy();
  });

  it("hides Report Emergency without the emergency:manage permission", () => {
    setup();
    setupAuthorization(() => false);
    renderPage();
    expect(screen.queryByRole("button", { name: "Report Emergency" })).toBeNull();
  });

  it("shows the real Report Health Case action (Phase 4, Prompt 11 — no longer a disabled placeholder)", () => {
    setup();
    renderPage();
    const button = screen.getByRole("button", { name: "Report Health Case" }) as HTMLButtonElement;
    expect(button.disabled).toBeFalsy();
  });

  it("hides Report Health Case without the health:manage permission", () => {
    setup();
    setupAuthorization(() => false);
    renderPage();
    expect(screen.queryByRole("button", { name: "Report Health Case" })).toBeNull();
  });

  it("shows the real Register Return action only once the student is exit-authorized and not yet returned", () => {
    setup({
      profile: fixtureProfile({
        currentLeave: {
          id: "lr-1",
          status: "approved",
          reason: "x",
          startDate: "2026-01-10",
          endDate: "2026-01-12",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          exitAuthorized: true,
          exitAuthorizedAt: "2026-01-05T10:00:00.000Z",
          returnRecorded: false,
          returnedAt: null,
        },
        hostelPresence: "outside_hostel",
      }),
    });
    renderPage();
    expect(screen.getByRole("button", { name: "Register Return" })).toBeTruthy();
  });

  it("hides Register Return once a return has already been recorded", () => {
    setup({
      profile: fixtureProfile({
        currentLeave: {
          id: "lr-1",
          status: "approved",
          reason: "x",
          startDate: "2026-01-10",
          endDate: "2026-01-12",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          exitAuthorized: true,
          exitAuthorizedAt: "2026-01-05T10:00:00.000Z",
          returnRecorded: true,
          returnedAt: "2026-01-06T09:00:00.000Z",
        },
        hostelPresence: "inside_hostel",
      }),
    });
    renderPage();
    expect(screen.queryByRole("button", { name: "Register Return" })).toBeNull();
  });

  it("hides Register Return without the movement:return permission, even when eligible", () => {
    setup({
      profile: fixtureProfile({
        currentLeave: {
          id: "lr-1",
          status: "approved",
          reason: "x",
          startDate: "2026-01-10",
          endDate: "2026-01-12",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          exitAuthorized: true,
          exitAuthorizedAt: "2026-01-05T10:00:00.000Z",
          returnRecorded: false,
          returnedAt: null,
        },
        hostelPresence: "outside_hostel",
      }),
    });
    setupAuthorization(() => false);
    renderPage();
    expect(screen.queryByRole("button", { name: "Register Return" })).toBeNull();
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
