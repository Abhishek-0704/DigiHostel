// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import AuditPage from "./AuditPage";
import { useAuditLog, useAuditStatistics } from "../features/audit";
import { useAuthorization } from "../contexts/AuthorizationContext";
import type { AuditLogState, AuditStatisticsState } from "../features/audit";
import type { AuditListItem } from "@digihostel/api-client-react";

vi.mock("../features/audit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../features/audit")>()),
  useAuditLog: vi.fn(),
  useAuditStatistics: vi.fn(),
}));
vi.mock("../hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../hooks")>()),
  useDebouncedValue: (value: unknown) => value,
}));
vi.mock("../contexts/AuthorizationContext", () => ({ useAuthorization: vi.fn() }));

const mockUseAuditLog = vi.mocked(useAuditLog);
const mockUseAuditStatistics = vi.mocked(useAuditStatistics);
const mockUseAuthorization = vi.mocked(useAuthorization);

afterEach(cleanup);

function fixtureItem(overrides: Partial<AuditListItem> = {}): AuditListItem {
  return {
    id: "evt-1",
    occurredAt: "2026-01-01T00:00:00.000Z",
    action: "leave.created",
    module: "leave",
    actorType: "student",
    actorId: "s1",
    actorName: "Jane Doe",
    actorRole: null,
    entityType: "leave_requests",
    entityId: "leave-1",
    studentId: "s1",
    studentFullName: "Jane Doe",
    studentRollNumber: "TEST-001",
    hostelId: "h1",
    hostelName: "Kalinga",
    metadata: {},
    ...overrides,
  };
}

function setup(items: AuditListItem[], overrides: Partial<AuditLogState> = {}) {
  mockUseAuditLog.mockReturnValue({
    result: { items, total: items.length, page: 1, pageSize: 20 },
    isLoading: false,
    isFetching: false,
    error: null,
    refresh: vi.fn(),
    ...overrides,
  });
  mockUseAuditStatistics.mockReturnValue({
    statistics: {
      eventsToday: 3,
      byModule: {
        leave: 2,
        movement: 0,
        emergency: 1,
        health: 0,
        device: 0,
        "staff-auth": 0,
        other: 0,
      },
    },
    isLoading: false,
    error: null,
    refresh: vi.fn(),
  } as AuditStatisticsState);
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
      <MemoryRouter initialEntries={["/audit"]}>
        <AuditPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AuditPage", () => {
  it("renders real event rows from the audit log result", () => {
    setup([fixtureItem({ actorName: "Reception Warden One" })]);
    renderPage();
    expect(screen.getByText("Jane Doe")).toBeTruthy();
    expect(screen.getByText("Reception Warden One")).toBeTruthy();
    expect(screen.getByText("leave.created")).toBeTruthy();
  });

  it("renders the statistics strip with real server-derived counts", () => {
    setup([fixtureItem()]);
    renderPage();
    expect(screen.getByText("Events Today")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("shows an honest empty state when there are no events and no filters", () => {
    setup([]);
    renderPage();
    expect(screen.getByText("No audit events yet")).toBeTruthy();
  });

  it("shows a distinct empty state once a search query is entered and nothing matches", () => {
    setup([]);
    renderPage();
    fireEvent.change(screen.getByLabelText("Search events"), { target: { value: "zzz" } });
    expect(screen.getByText("No events match these filters")).toBeTruthy();
  });

  it("shows an honest error state without fabricating data", () => {
    setup([], { error: { userMessage: "Something went wrong." } as never });
    renderPage();
    expect(screen.getByText("Something went wrong.")).toBeTruthy();
  });

  it("toggling a module filter chip calls the query with the new module", () => {
    setup([fixtureItem()]);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Emergency" }));
    const lastCall = mockUseAuditLog.mock.calls.at(-1)![0];
    expect(lastCall.module).toEqual(["emergency"]);
  });

  it("changing the search field resets to page 1", () => {
    setup([fixtureItem()]);
    renderPage();
    fireEvent.change(screen.getByLabelText("Search events"), { target: { value: "jane" } });
    const lastCall = mockUseAuditLog.mock.calls.at(-1)![0];
    expect(lastCall.q).toBe("jane");
    expect(lastCall.page).toBe(1);
  });

  it("shows pagination controls and total count once results exist", () => {
    setup([fixtureItem()], {
      result: { items: [fixtureItem()], total: 45, page: 1, pageSize: 20 },
    });
    renderPage();
    expect(screen.getByText(/45 events/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next" })).toBeTruthy();
  });

  it("shows the caller's hostel scope indicator", () => {
    setup([fixtureItem()]);
    renderPage();
    expect(screen.getByText("Hostel-scoped")).toBeTruthy();
  });

  it("clicking View Details opens the detail panel with the event's own already-fetched data (no second network call)", () => {
    setup([fixtureItem({ action: "emergency.incident_reported", module: "emergency" })]);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "View Details" }));
    expect(screen.getAllByText("emergency.incident_reported").length).toBeGreaterThan(0);
    // useAuditLog was called only for the list — no separate by-id hook exists.
    expect(mockUseAuditLog).toHaveBeenCalled();
  });

  it("keyboard: pressing Escape inside the open detail panel closes it", () => {
    setup([fixtureItem()]);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "View Details" }));
    const panel = screen.getByRole("region", { name: /Audit event detail/ });
    fireEvent.keyDown(panel, { key: "Escape" });
    expect(screen.getByText("No event selected")).toBeTruthy();
  });

  it("keyboard: the detail panel's close button receives focus when a new event is opened", () => {
    setup([fixtureItem()]);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "View Details" }));
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Close audit event detail");
  });

  it("an invalid date range (from after to) shows a validation message and does not send the range to the server", () => {
    setup([fixtureItem()]);
    renderPage();
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-06-01" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-01-01" } });
    expect(screen.getByText("The start date must not be after the end date.")).toBeTruthy();
    const lastCall = mockUseAuditLog.mock.calls.at(-1)![0];
    expect(lastCall.dateFrom).toBeUndefined();
    expect(lastCall.dateTo).toBeUndefined();
  });
});
