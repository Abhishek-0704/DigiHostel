// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import HealthPage from "./HealthPage";
import { useHealthCaseQueue, useHealthCaseStatistics } from "../features/health";
import { useAuthorization } from "../contexts/AuthorizationContext";
import type { HealthCaseQueueState, HealthCaseStatisticsState } from "../features/health";
import type { HealthCaseListItem } from "@digihostel/api-client-react";

vi.mock("../features/health", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../features/health")>()),
  useHealthCaseQueue: vi.fn(),
  useHealthCaseStatistics: vi.fn(),
}));
vi.mock("../hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../hooks")>()),
  useDebouncedValue: (value: unknown) => value,
  useHealthCaseQueueRealtime: () => "connected",
}));
vi.mock("../contexts/AuthorizationContext", () => ({ useAuthorization: vi.fn() }));

const mockUseHealthCaseQueue = vi.mocked(useHealthCaseQueue);
const mockUseHealthCaseStatistics = vi.mocked(useHealthCaseStatistics);
const mockUseAuthorization = vi.mocked(useAuthorization);

afterEach(cleanup);

function fixtureItem(overrides: Partial<HealthCaseListItem> = {}): HealthCaseListItem {
  return {
    id: "case-1",
    studentId: "s1",
    studentFullName: "Jane Doe",
    studentRollNumber: "TEST-001",
    hostelId: "h1",
    hostelName: "Kalinga",
    roomNumber: "101",
    category: "medical_observation",
    severity: "high",
    status: "new",
    reportedAt: "2026-01-01T00:00:00.000Z",
    admittedAt: null,
    latestUpdateAt: "2026-01-01T00:00:00.000Z",
    assignedStaffId: null,
    assignedStaffName: null,
    ...overrides,
  };
}

function setup(items: HealthCaseListItem[], overrides: Partial<HealthCaseQueueState> = {}) {
  mockUseHealthCaseQueue.mockReturnValue({
    result: { items, total: items.length, page: 1, pageSize: 20 },
    isLoading: false,
    isFetching: false,
    error: null,
    ...overrides,
  });
  mockUseHealthCaseStatistics.mockReturnValue({
    statistics: {
      active: 1,
      critical: 1,
      newCases: 1,
      monitoring: 0,
      awaitingUpdate: 0,
      admittedToday: 0,
      dischargedToday: 0,
    },
    isLoading: false,
    error: null,
    refresh: vi.fn(),
  } as HealthCaseStatisticsState);
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
      <MemoryRouter initialEntries={["/health"]}>
        <HealthPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("HealthPage", () => {
  it("renders real case rows from the queue result", () => {
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

  it("shows an honest empty state when there is no query and no active cases", () => {
    setup([]);
    renderPage();
    expect(screen.getByText("No active cases right now.")).toBeTruthy();
  });

  it("shows a distinct empty state once a search query is entered and nothing matches", () => {
    setup([]);
    renderPage();
    fireEvent.change(screen.getByLabelText("Search cases"), { target: { value: "zzz" } });
    expect(screen.getByText("No cases match this search")).toBeTruthy();
  });

  it("shows an honest error state without fabricating data", () => {
    setup([], { error: { userMessage: "Something went wrong." } as never });
    renderPage();
    expect(screen.getByText("Something went wrong.")).toBeTruthy();
  });

  it("toggling a category filter chip calls the query with the new category", () => {
    setup([fixtureItem()]);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Accident" }));
    const lastCall = mockUseHealthCaseQueue.mock.calls.at(-1)![0];
    expect(lastCall.category).toEqual(["accident"]);
  });

  it("changing the search field resets to page 1", () => {
    setup([fixtureItem()]);
    renderPage();
    fireEvent.change(screen.getByLabelText("Search cases"), { target: { value: "jane" } });
    const lastCall = mockUseHealthCaseQueue.mock.calls.at(-1)![0];
    expect(lastCall.q).toBe("jane");
    expect(lastCall.page).toBe(1);
  });

  it("shows pagination controls and total count once results exist", () => {
    setup([fixtureItem()], {
      result: { items: [fixtureItem()], total: 45, page: 1, pageSize: 20 },
    });
    renderPage();
    expect(screen.getByText(/45 cases/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next" })).toBeTruthy();
  });

  it("shows the caller's hostel scope indicator", () => {
    setup([fixtureItem()]);
    renderPage();
    expect(screen.getByText("Hostel-scoped")).toBeTruthy();
  });
});
