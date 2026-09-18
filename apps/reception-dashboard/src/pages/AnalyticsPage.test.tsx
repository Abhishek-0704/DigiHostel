// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "../components/ui";
import AnalyticsPage from "./AnalyticsPage";
import { useAnalyticsOverview, useLeaveTrend, useMovementTrend } from "../features/analytics";
import { useAuthorization } from "../contexts/AuthorizationContext";
import type {
  AnalyticsOverviewState,
  LeaveTrendState,
  MovementTrendState,
} from "../features/analytics";
import type { AnalyticsOverview } from "@digihostel/api-client-react";
import { AppError } from "../lib/errors/errors";

vi.mock("../features/analytics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../features/analytics")>()),
  useAnalyticsOverview: vi.fn(),
  useLeaveTrend: vi.fn(),
  useMovementTrend: vi.fn(),
}));
vi.mock("../contexts/AuthorizationContext", () => ({ useAuthorization: vi.fn() }));

const mockUseAnalyticsOverview = vi.mocked(useAnalyticsOverview);
const mockUseLeaveTrend = vi.mocked(useLeaveTrend);
const mockUseMovementTrend = vi.mocked(useMovementTrend);
const mockUseAuthorization = vi.mocked(useAuthorization);

afterEach(cleanup);

function fixtureOverview(overrides: Partial<AnalyticsOverview> = {}): AnalyticsOverview {
  return {
    periodFrom: "2026-01-01T00:00:00.000Z",
    periodTo: "2026-01-08T00:00:00.000Z",
    presence: { totalStudents: 10, studentsInside: 7, studentsOutside: 3 },
    leave: {
      pendingNow: 2,
      createdInPeriod: 5,
      approvedInPeriod: 3,
      rejectedInPeriod: 1,
      expiredInPeriod: 0,
      approvalRate: 0.75,
      avgResponseMinutes: 42,
    },
    movement: { returnsInPeriod: 4, avgDurationMinutes: 120 },
    notifications: { generatedInPeriod: 8, deliveredInPeriod: 6, failedInPeriod: 1 },
    ...overrides,
  };
}

function setup(
  overrides: {
    overview?: Partial<AnalyticsOverviewState>;
    leaveTrend?: Partial<LeaveTrendState>;
    movementTrend?: Partial<MovementTrendState>;
    role?: "hostel_admin" | "super_admin";
  } = {},
) {
  mockUseAnalyticsOverview.mockReturnValue({
    overview: fixtureOverview(),
    isLoading: false,
    error: null,
    refresh: vi.fn(),
    ...overrides.overview,
  });
  mockUseLeaveTrend.mockReturnValue({
    trend: {
      periodFrom: "2026-01-01T00:00:00.000Z",
      periodTo: "2026-01-08T00:00:00.000Z",
      createdByDay: [{ date: "2026-01-01", count: 5 }],
      approvedByDay: [{ date: "2026-01-01", count: 3 }],
      rejectedByDay: [{ date: "2026-01-01", count: 1 }],
    },
    isLoading: false,
    error: null,
    refresh: vi.fn(),
    ...overrides.leaveTrend,
  });
  mockUseMovementTrend.mockReturnValue({
    trend: {
      periodFrom: "2026-01-01T00:00:00.000Z",
      periodTo: "2026-01-08T00:00:00.000Z",
      returnsByDay: [{ date: "2026-01-01", count: 4 }],
      returnsByHour: [{ hour: 6, count: 4 }],
    },
    isLoading: false,
    error: null,
    refresh: vi.fn(),
    ...overrides.movementTrend,
  });
  mockUseAuthorization.mockReturnValue({
    role: overrides.role ?? "hostel_admin",
    hostelId: overrides.role === "super_admin" ? null : "h1",
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
      <ToastProvider>
        <MemoryRouter initialEntries={["/analytics"]}>
          <AnalyticsPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe("AnalyticsPage", () => {
  it("renders real KPI values from the overview result", () => {
    setup();
    renderPage();
    expect(screen.getByText("10")).toBeTruthy(); // Total Students
    expect(screen.getByText("7")).toBeTruthy(); // Currently Inside
    expect(screen.getByText("5")).toBeTruthy(); // Created in Period
    expect(screen.getByText("75%")).toBeTruthy(); // Approval Rate formatted
  });

  it("shows the hostel-scoped indicator for hostel_admin and all-hostels for super_admin", () => {
    setup({ role: "hostel_admin" });
    renderPage();
    expect(screen.getByText("Hostel-scoped")).toBeTruthy();
    cleanup();

    setup({ role: "super_admin" });
    renderPage();
    expect(screen.getByText("All hostels")).toBeTruthy();
  });

  it("shows loading skeletons on every KPI tile while the overview is loading", () => {
    setup({ overview: { overview: null, isLoading: true } });
    renderPage();
    // Total Students tile is not yet rendered as a number; the loading state
    // is represented by aria-busy tiles rather than the numeric text.
    expect(screen.queryByText("10")).toBeNull();
  });

  it("shows an honest unavailable reason (not a fabricated zero) when the approval rate is null", () => {
    setup({
      overview: {
        overview: fixtureOverview({
          leave: {
            pendingNow: 0,
            createdInPeriod: 0,
            approvedInPeriod: 0,
            rejectedInPeriod: 0,
            expiredInPeriod: 0,
            approvalRate: null,
            avgResponseMinutes: null,
          },
        }),
      },
    });
    renderPage();
    expect(screen.getByText("No decided requests in this period")).toBeTruthy();
    expect(screen.getByText("No decisions with both timestamps in this period")).toBeTruthy();
  });

  it("shows an honest error banner without fabricating overview data", () => {
    setup({
      overview: {
        overview: null,
        error: new AppError("network", "Could not reach the analytics service.", undefined),
      },
    });
    renderPage();
    expect(screen.getByText("Could not reach the analytics service.")).toBeTruthy();
  });

  it("clicking a date-range preset re-derives the range passed to every hook", () => {
    setup();
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Last 30 days" }));
    const overviewCall = mockUseAnalyticsOverview.mock.calls.at(-1)![0];
    const leaveTrendCall = mockUseLeaveTrend.mock.calls.at(-1)![0];
    const movementTrendCall = mockUseMovementTrend.mock.calls.at(-1)![0];
    expect(overviewCall.presetId).toBe("30d");
    expect(leaveTrendCall.presetId).toBe("30d");
    expect(movementTrendCall.presetId).toBe("30d");
    // All three hooks must share the exact same computed range.
    expect(overviewCall.dateFrom).toBe(leaveTrendCall.dateFrom);
    expect(overviewCall.dateFrom).toBe(movementTrendCall.dateFrom);
  });

  it("clicking Refresh calls refresh on all three data sources and shows a confirmation toast", async () => {
    const refreshOverview = vi.fn().mockResolvedValue(undefined);
    const refreshLeaveTrend = vi.fn().mockResolvedValue(undefined);
    const refreshMovementTrend = vi.fn().mockResolvedValue(undefined);
    setup({
      overview: { refresh: refreshOverview },
      leaveTrend: { refresh: refreshLeaveTrend },
      movementTrend: { refresh: refreshMovementTrend },
    });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await vi.waitFor(() => {
      expect(refreshOverview).toHaveBeenCalled();
      expect(refreshLeaveTrend).toHaveBeenCalled();
      expect(refreshMovementTrend).toHaveBeenCalled();
    });
    await screen.findByText("Analytics refreshed.");
  });

  it("renders both trend charts with their accessible textual summaries", () => {
    setup();
    renderPage();
    expect(screen.getByText("Leave Requests Over Time")).toBeTruthy();
    expect(screen.getByText("Hostel Returns Over Time")).toBeTruthy();
    expect(
      screen.getByText(/5 leave requests were created, 3 were approved, and 1 were rejected/),
    ).toBeTruthy();
  });

  it("shows the honest deferred-metrics note for hostel occupancy, Library Pass, and session analytics", () => {
    setup();
    renderPage();
    expect(screen.getByText(/Hostel occupancy .* Digital Library Pass activity/)).toBeTruthy();
  });
});
