// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import StudentReportHealthCasePage from "./StudentReportHealthCasePage";
import { useStudentProfile } from "../features/students";
import { useReportHealthCase } from "../features/health";
import type { StudentProfileState } from "../features/students";
import type { ReportHealthCaseState } from "../features/health";
import type { StudentProfile } from "@digihostel/api-client-react";

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
vi.mock("../features/health", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../features/health")>()),
  useReportHealthCase: vi.fn(),
}));

const mockUseStudentProfile = vi.mocked(useStudentProfile);
const mockUseReportHealthCase = vi.mocked(useReportHealthCase);

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
    guardians: [],
    currentLeave: null,
    timeline: [],
    hostelPresence: "inside_hostel",
    ...overrides,
  };
}

function setupProfile(overrides: Partial<StudentProfileState> = {}) {
  mockUseStudentProfile.mockReturnValue({
    profile: fixtureProfile(),
    isLoading: false,
    error: null,
    refresh: vi.fn(),
    ...overrides,
  });
}

function setupReport(overrides: Partial<ReportHealthCaseState> = {}) {
  mockUseReportHealthCase.mockReturnValue({
    report: vi.fn(),
    isPending: false,
    error: null,
    data: null,
    reset: vi.fn(),
    ...overrides,
  });
}

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/students/TEST-001/report-health-case"]}>
        <Routes>
          <Route
            path="/students/:rollNumber/report-health-case"
            element={<StudentReportHealthCasePage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("StudentReportHealthCasePage", () => {
  it("renders the student summary reused from the Student Operations Center", () => {
    setupProfile();
    setupReport();
    renderPage();
    expect(screen.getByText("Jane Doe")).toBeTruthy();
    expect(screen.getByText("Kalinga")).toBeTruthy();
  });

  it("the submit button is disabled until a description is entered", () => {
    setupProfile();
    setupReport();
    renderPage();
    const button = screen.getByRole("button", {
      name: "Report Health Case",
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Case description"), {
      target: { value: "Fever, sent to infirmary" },
    });
    expect(
      (screen.getByRole("button", { name: "Report Health Case" }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("clicking Report Health Case opens a confirmation dialog before submitting", () => {
    const reportFn = vi.fn();
    setupProfile();
    setupReport({ report: reportFn });
    renderPage();

    fireEvent.change(screen.getByLabelText("Case description"), {
      target: { value: "Fever, sent to infirmary" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Report Health Case" }));
    expect(screen.getByText("Confirm Health Case Report")).toBeTruthy();
    expect(reportFn).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole("button", { name: "Report Health Case" })[1]);
    expect(reportFn).toHaveBeenCalledWith({
      rollNumber: "TEST-001",
      category: "medical_observation",
      severity: "medium",
      description: "Fever, sent to infirmary",
    });
  });

  it("shows a real success state with a link to the created case", () => {
    setupProfile();
    setupReport({
      data: {
        id: "case-99",
        studentId: "s1",
        studentFullName: "Jane Doe",
        studentRollNumber: "TEST-001",
        hostelId: "h1",
        hostelName: "Kalinga",
        roomNumber: "101",
        category: "medical_observation",
        severity: "medium",
        status: "new",
        reportedAt: "2026-01-01T00:00:00.000Z",
        admittedAt: null,
        latestUpdateAt: "2026-01-01T00:00:00.000Z",
        assignedStaffId: null,
        assignedStaffName: null,
        description: "x",
        resolvedAt: null,
        dischargedAt: null,
        closedAt: null,
        cancelledAt: null,
        timeline: [],
      } as never,
    });
    renderPage();
    expect(screen.getByText("Case reported")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open Case" })).toBeTruthy();
  });

  it("shows an honest error message when reporting fails", () => {
    setupProfile();
    setupReport({ error: { userMessage: "You are not authorized for this student." } as never });
    renderPage();
    expect(screen.getByText("You are not authorized for this student.")).toBeTruthy();
  });
});
