// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import EmergencyPage from "./EmergencyPage";
import { useEmergencyQueue, useEmergencyStatistics } from "../features/emergency";
import { useAuthorization } from "../contexts/AuthorizationContext";
import type { EmergencyQueueState, EmergencyStatisticsState } from "../features/emergency";
import type { EmergencyListItem } from "@digihostel/api-client-react";

vi.mock("../features/emergency", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../features/emergency")>()),
  useEmergencyQueue: vi.fn(),
  useEmergencyStatistics: vi.fn(),
}));
vi.mock("../hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../hooks")>()),
  useDebouncedValue: (value: unknown) => value,
  useEmergencyQueueRealtime: () => "connected",
}));
vi.mock("../contexts/AuthorizationContext", () => ({ useAuthorization: vi.fn() }));

const mockUseEmergencyQueue = vi.mocked(useEmergencyQueue);
const mockUseEmergencyStatistics = vi.mocked(useEmergencyStatistics);
const mockUseAuthorization = vi.mocked(useAuthorization);

afterEach(cleanup);

function fixtureItem(overrides: Partial<EmergencyListItem> = {}): EmergencyListItem {
  return {
    id: "incident-1",
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
    ...overrides,
  };
}

function setup(items: EmergencyListItem[], overrides: Partial<EmergencyQueueState> = {}) {
  mockUseEmergencyQueue.mockReturnValue({
    result: { items, total: items.length, page: 1, pageSize: 20 },
    isLoading: false,
    isFetching: false,
    error: null,
    ...overrides,
  });
  mockUseEmergencyStatistics.mockReturnValue({
    statistics: {
      active: 1,
      critical: 1,
      open: 1,
      acknowledged: 0,
      inProgress: 0,
      resolvedToday: 0,
    },
    isLoading: false,
    error: null,
    refresh: vi.fn(),
  } as EmergencyStatisticsState);
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
      <MemoryRouter initialEntries={["/emergency"]}>
        <EmergencyPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("EmergencyPage", () => {
  it("renders real incident rows from the queue result", () => {
    setup([fixtureItem()]);
    renderPage();
    expect(screen.getByText("Jane Doe")).toBeTruthy();
    expect(screen.getByText("TEST-001")).toBeTruthy();
  });

  it("renders the statistics strip with real server-derived counts", () => {
    setup([fixtureItem()]);
    renderPage();
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getAllByText("Critical").length).toBeGreaterThan(0);
  });

  it("shows an honest empty state when there is no query and no active incidents", () => {
    setup([]);
    renderPage();
    expect(screen.getByText("No active incidents right now.")).toBeTruthy();
  });

  it("shows a distinct empty state once a search query is entered and nothing matches", () => {
    setup([]);
    renderPage();
    fireEvent.change(screen.getByLabelText("Search incidents"), { target: { value: "zzz" } });
    expect(screen.getByText("No incidents match this search")).toBeTruthy();
  });

  it("shows an honest error state without fabricating data", () => {
    setup([], { error: { userMessage: "Something went wrong." } as never });
    renderPage();
    expect(screen.getByText("Something went wrong.")).toBeTruthy();
  });

  it("toggling a category filter chip calls the query with the new category", () => {
    setup([fixtureItem()]);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Fire" }));
    const lastCall = mockUseEmergencyQueue.mock.calls.at(-1)![0];
    expect(lastCall.category).toEqual(["fire"]);
  });

  it("changing the search field resets to page 1", () => {
    setup([fixtureItem()]);
    renderPage();
    fireEvent.change(screen.getByLabelText("Search incidents"), { target: { value: "jane" } });
    const lastCall = mockUseEmergencyQueue.mock.calls.at(-1)![0];
    expect(lastCall.q).toBe("jane");
    expect(lastCall.page).toBe(1);
  });

  it("shows pagination controls and total count once results exist", () => {
    setup([fixtureItem()], {
      result: { items: [fixtureItem()], total: 45, page: 1, pageSize: 20 },
    });
    renderPage();
    expect(screen.getByText(/45 incidents/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next" })).toBeTruthy();
  });

  it("shows the caller's hostel scope indicator", () => {
    setup([fixtureItem()]);
    renderPage();
    expect(screen.getByText("Hostel-scoped")).toBeTruthy();
  });
});
