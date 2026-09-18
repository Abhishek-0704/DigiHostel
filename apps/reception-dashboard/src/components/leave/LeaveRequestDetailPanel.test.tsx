// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { LeaveRequestDetailPanel } from "./LeaveRequestDetailPanel";
import { useAuthorization } from "../../contexts/AuthorizationContext";
import type { LeaveQueueItem } from "../../features/leave";

vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useNavigate: vi.fn(),
}));
vi.mock("../../contexts/AuthorizationContext", () => ({ useAuthorization: vi.fn() }));

const mockNavigate = vi.fn();
vi.mocked(useNavigate).mockReturnValue(mockNavigate);
const mockUseAuthorization = vi.mocked(useAuthorization);

afterEach(cleanup);

function setupAuthorization(hasPermission: (p: string) => boolean = () => false) {
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

function make(overrides: Partial<LeaveQueueItem> = {}): LeaveQueueItem {
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

function renderPanel(item: LeaveQueueItem | null, onClose = vi.fn()) {
  return render(
    <MemoryRouter>
      <LeaveRequestDetailPanel item={item} onClose={onClose} />
    </MemoryRouter>,
  );
}

describe("LeaveRequestDetailPanel", () => {
  it("shows a clear placeholder when nothing is selected", () => {
    setupAuthorization();
    renderPanel(null);
    expect(screen.getByText("No request selected")).toBeTruthy();
  });

  it("shows the student's name, roll number, hostel, room, and leave period", () => {
    setupAuthorization();
    renderPanel(make());
    expect(screen.getByRole("heading", { name: "Jane Doe" })).toBeTruthy();
    expect(screen.getByText("TEST-001")).toBeTruthy();
    expect(screen.getByText("Kalinga")).toBeTruthy();
    expect(screen.getByText("101")).toBeTruthy();
    expect(screen.getByText("2026-01-10 – 2026-01-12")).toBeTruthy();
  });

  it("distinguishes Parent Approval from Mentor/SAP Approval — never conflates the two", () => {
    setupAuthorization();
    renderPanel(make({ status: "father_notified" }));
    expect(screen.getByText("Parent Approval")).toBeTruthy();
    expect(screen.getByText("Father notified")).toBeTruthy();
    expect(screen.getByText("Mentor/SAP Approval")).toBeTruthy();
    expect(screen.getByText("Not available — no SAP integration")).toBeTruthy();
  });

  it("never shows parent/guardian identity or contact details", () => {
    setupAuthorization();
    renderPanel(make());
    expect(screen.queryByText(/father/i, { selector: "dd" })).toBeNull();
    expect(screen.getByText(/not exposed to reception staff/i)).toBeTruthy();
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    setupAuthorization();
    renderPanel(make(), onClose);
    fireEvent.click(screen.getByRole("button", { name: "Close leave request detail" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("closes on Escape from within the panel", () => {
    const onClose = vi.fn();
    setupAuthorization();
    renderPanel(make(), onClose);
    fireEvent.keyDown(screen.getByRole("region"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("hides the 'Open Approval Session' action for a caller without the permission", () => {
    setupAuthorization(() => false);
    renderPanel(make());
    expect(screen.queryByRole("button", { name: "Open Approval Session" })).toBeNull();
  });

  it("navigates to the real Session Workspace when a permitted caller opens it (Prompt 7B — no longer disabled)", () => {
    setupAuthorization((p) => p === "leave:parent_approval:initiate");
    renderPanel(make({ id: "lr-42" }));
    const button = screen.getByRole("button", { name: "Open Approval Session" });
    expect((button as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(button);
    expect(mockNavigate).toHaveBeenCalledWith("/leave/lr-42");
  });
});
