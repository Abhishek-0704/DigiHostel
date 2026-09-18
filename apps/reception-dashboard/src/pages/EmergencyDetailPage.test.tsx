// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import EmergencyDetailPage from "./EmergencyDetailPage";
import {
  useEmergencyDetail,
  useEmergencyTransition,
  useAddEmergencyNote,
} from "../features/emergency";
import { useEmergencyDetailRealtime } from "../hooks";
import { useAuthorization } from "../contexts/AuthorizationContext";
import type {
  EmergencyDetailState,
  EmergencyTransitionState,
  AddEmergencyNoteState,
} from "../features/emergency";
import type { EmergencyDetail } from "@digihostel/api-client-react";

// jsdom does not implement <dialog>'s showModal()/close() — same minimal
// polyfill StudentReturnPage.test.tsx already established.
if (typeof HTMLDialogElement !== "undefined") {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}

vi.mock("../features/emergency", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../features/emergency")>()),
  useEmergencyDetail: vi.fn(),
  useEmergencyTransition: vi.fn(),
  useAddEmergencyNote: vi.fn(),
}));
vi.mock("../hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../hooks")>()),
  useEmergencyDetailRealtime: vi.fn(() => "connected"),
}));
vi.mock("../contexts/AuthorizationContext", () => ({ useAuthorization: vi.fn() }));

const mockUseEmergencyDetail = vi.mocked(useEmergencyDetail);
const mockUseEmergencyTransition = vi.mocked(useEmergencyTransition);
const mockUseAddEmergencyNote = vi.mocked(useAddEmergencyNote);
const mockUseEmergencyDetailRealtime = vi.mocked(useEmergencyDetailRealtime);
const mockUseAuthorization = vi.mocked(useAuthorization);

afterEach(cleanup);

const INCIDENT_ID = "incident-1";

function fixtureIncident(overrides: Partial<EmergencyDetail> = {}): EmergencyDetail {
  return {
    id: INCIDENT_ID,
    studentId: "s1",
    studentFullName: "Jane Doe",
    studentRollNumber: "TEST-001",
    hostelId: "h1",
    hostelName: "Kalinga",
    roomNumber: "101",
    category: "medical",
    severity: "critical",
    status: "open",
    reportedAt: "2026-01-01T00:00:00.000Z",
    assignedStaffId: null,
    assignedStaffName: null,
    description: "Collapsed in common room",
    resolvedAt: null,
    closedAt: null,
    timeline: [
      {
        id: "e1",
        eventType: "created",
        note: null,
        actorStaffName: null,
        occurredAt: "2026-01-01T00:00:00.000Z",
      },
    ],
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

function setupDetail(overrides: Partial<EmergencyDetailState> = {}) {
  mockUseEmergencyDetail.mockReturnValue({
    incident: fixtureIncident(),
    isLoading: false,
    error: null,
    refresh: vi.fn(),
    ...overrides,
  });
}

function setupTransition(overrides: Partial<EmergencyTransitionState> = {}) {
  mockUseEmergencyTransition.mockReturnValue({
    transition: vi.fn(),
    isPending: false,
    error: null,
    data: null,
    reset: vi.fn(),
    ...overrides,
  });
}

function setupAddNote(overrides: Partial<AddEmergencyNoteState> = {}) {
  mockUseAddEmergencyNote.mockReturnValue({
    addNote: vi.fn(),
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
      <MemoryRouter initialEntries={[`/emergency/${INCIDENT_ID}`]}>
        <Routes>
          <Route path="/emergency/:incidentId" element={<EmergencyDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("EmergencyDetailPage", () => {
  it("renders incident and student details", () => {
    setupAuthorization();
    setupDetail();
    setupTransition();
    setupAddNote();
    mockUseEmergencyDetailRealtime.mockReturnValue("connected");
    renderPage();
    expect(screen.getByText("Jane Doe")).toBeTruthy();
    expect(screen.getAllByText("TEST-001").length).toBeGreaterThan(0);
    expect(screen.getByText("Collapsed in common room")).toBeTruthy();
  });

  it("shows Acknowledge as the next action when status is open", () => {
    setupAuthorization();
    setupDetail({ incident: fixtureIncident({ status: "open" }) });
    setupTransition();
    setupAddNote();
    renderPage();
    expect(screen.getByRole("button", { name: "Acknowledge" })).toBeTruthy();
  });

  it("shows Start Response as the next action when status is acknowledged", () => {
    setupAuthorization();
    setupDetail({
      incident: fixtureIncident({ status: "acknowledged", assignedStaffName: "Reception A" }),
    });
    setupTransition();
    setupAddNote();
    renderPage();
    expect(screen.getByRole("button", { name: "Start Response" })).toBeTruthy();
    expect(screen.getByText("Reception A")).toBeTruthy();
  });

  it("shows no next-action button when the incident is closed", () => {
    setupAuthorization();
    setupDetail({
      incident: fixtureIncident({
        status: "closed",
        resolvedAt: "2026-01-01T01:00:00.000Z",
        closedAt: "2026-01-01T02:00:00.000Z",
      }),
    });
    setupTransition();
    setupAddNote();
    renderPage();
    expect(screen.queryByRole("button", { name: "Close Incident" })).toBeNull();
    expect(
      screen.getByText("This incident is closed — no further notes can be added."),
    ).toBeTruthy();
  });

  it("clicking the action button opens a confirmation dialog before transitioning", () => {
    const transitionFn = vi.fn();
    setupAuthorization();
    setupDetail({ incident: fixtureIncident({ status: "open" }) });
    setupTransition({ transition: transitionFn });
    setupAddNote();
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Acknowledge" }));
    expect(screen.getByText("Confirm: Acknowledge")).toBeTruthy();
    expect(transitionFn).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole("button", { name: "Acknowledge" })[1]);
    expect(transitionFn).toHaveBeenCalledWith(INCIDENT_ID);
  });

  it("submitting a note calls addNote with the incident id and trimmed text", () => {
    const addNoteFn = vi.fn();
    setupAuthorization();
    setupDetail({ incident: fixtureIncident({ status: "acknowledged" }) });
    setupTransition();
    setupAddNote({ addNote: addNoteFn });
    renderPage();

    fireEvent.change(screen.getByLabelText("Operational note"), {
      target: { value: "  Called ambulance.  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Note" }));
    expect(addNoteFn).toHaveBeenCalledWith({ incidentId: INCIDENT_ID, note: "Called ambulance." });
  });

  it("hides action/note controls without the emergency:manage permission", () => {
    setupAuthorization(() => false);
    setupDetail({ incident: fixtureIncident({ status: "open" }) });
    setupTransition();
    setupAddNote();
    renderPage();
    expect(screen.queryByRole("button", { name: "Acknowledge" })).toBeNull();
    expect(screen.queryByLabelText("Operational note")).toBeNull();
  });

  it("shows an honest error state for a nonexistent/inaccessible incident", () => {
    setupAuthorization();
    setupDetail({
      incident: null,
      error: { userMessage: "We couldn't find what you were looking for." } as never,
    });
    setupTransition();
    setupAddNote();
    renderPage();
    expect(screen.getByText("We couldn't find what you were looking for.")).toBeTruthy();
  });
});
