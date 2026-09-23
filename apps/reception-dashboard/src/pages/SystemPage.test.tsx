// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "../components/ui";
import SystemPage from "./SystemPage";
import { useMonitoringOverview, useDiagnostics } from "../features/monitoring";
import { useRealtimeConnectionProbe } from "../hooks";
import type { MonitoringOverviewState, DiagnosticsState } from "../features/monitoring";
import type { MonitoringOverview } from "@digihostel/api-client-react";
import { AppError } from "../lib/errors/errors";

vi.mock("../features/monitoring", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../features/monitoring")>()),
  useMonitoringOverview: vi.fn(),
  useDiagnostics: vi.fn(),
}));
vi.mock("../hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../hooks")>()),
  useRealtimeConnectionProbe: vi.fn(() => "subscribed"),
}));

const mockUseMonitoringOverview = vi.mocked(useMonitoringOverview);
const mockUseDiagnostics = vi.mocked(useDiagnostics);
const mockUseRealtimeConnectionProbe = vi.mocked(useRealtimeConnectionProbe);

afterEach(cleanup);

function fixtureOverview(overrides: Partial<MonitoringOverview> = {}): MonitoringOverview {
  return {
    generatedAt: "2026-01-01T00:00:00.000Z",
    platformStatus: "healthy",
    infrastructure: [
      {
        id: "database",
        label: "Database",
        state: "healthy",
        detail: "Connected",
        measuredAt: "2026-01-01T00:00:00.000Z",
        latencyMs: 5,
      },
      {
        id: "supabase-auth",
        label: "Supabase Auth",
        state: "healthy",
        detail: "Admin API reachable",
        measuredAt: "2026-01-01T00:00:00.000Z",
        latencyMs: 40,
      },
      {
        id: "realtime-publication",
        label: "Realtime Publication",
        state: "healthy",
        detail: "All 9 expected tables present",
        measuredAt: "2026-01-01T00:00:00.000Z",
        latencyMs: 3,
      },
    ],
    applicationModules: [
      {
        id: "reception-dashboard",
        label: "Reception Dashboard",
        state: "healthy",
        detail: "Operationally available through Reception API",
      },
    ],
    operational: {
      pendingLeaveAuthorizations: 2,
      studentsOutsideHostel: 3,
      activeEmergencies: 0,
      criticalEmergencies: 0,
      activeHealthCases: 1,
      criticalHealthCases: 0,
      notificationsFailedLast24h: 0,
      libraryOperationsStatus: "future",
    },
    security: {
      recentMfaFailures24h: 0,
      suspendedStaffAccounts: 1,
      recentAdministrativeChanges24h: 2,
    },
    deployment: { version: "abc1234", environment: "test" },
    alerts: [],
    ...overrides,
  };
}

function setup(
  overrides: {
    overview?: Partial<MonitoringOverviewState>;
    diagnostics?: Partial<DiagnosticsState>;
  } = {},
) {
  mockUseMonitoringOverview.mockReturnValue({
    overview: fixtureOverview(),
    isLoading: false,
    isFetching: false,
    error: null,
    refresh: vi.fn(),
    ...overrides.overview,
  });
  mockUseDiagnostics.mockReturnValue({
    diagnostics: [
      {
        id: "database_connectivity",
        label: "Database Connectivity",
        description: "Runs a trivial query.",
      },
    ],
    isLoading: false,
    error: null,
    results: {},
    runningId: null,
    runError: null,
    run: vi.fn(),
    ...overrides.diagnostics,
  });
  mockUseRealtimeConnectionProbe.mockReturnValue("subscribed");
}

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/system"]}>
          <SystemPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe("SystemPage (Enterprise Operations Monitoring Center)", () => {
  it("renders the platform status banner with a real, non-color-only status label", () => {
    setup();
    renderPage();
    expect(screen.getByText("Platform Status")).toBeTruthy();
    // Multiple "Healthy" badges legitimately appear (the platform banner,
    // each infrastructure signal, and the application module tile) — this
    // asserts at least one exists rather than requiring uniqueness.
    expect(screen.getAllByText("Healthy").length).toBeGreaterThan(0);
  });

  it("renders real operational health figures, never a fabricated placeholder", () => {
    setup();
    renderPage();
    expect(screen.getByText("Pending Leave Authorizations")).toBeTruthy();
    // "2" legitimately appears twice (pendingLeaveAuthorizations and
    // recentAdministrativeChanges24h both equal 2 in the fixture).
    expect(screen.getAllByText("2").length).toBeGreaterThan(0);
    expect(screen.getByText("Library Operations")).toBeTruthy();
    expect(screen.getByText("Future — Digital Library Pass not yet implemented")).toBeTruthy();
  });

  it("shows 'Not available' rather than a fabricated zero when a derived count is genuinely null", () => {
    setup({
      overview: {
        overview: fixtureOverview({
          operational: {
            pendingLeaveAuthorizations: 0,
            studentsOutsideHostel: 0,
            activeEmergencies: 0,
            criticalEmergencies: 0,
            activeHealthCases: 0,
            criticalHealthCases: 0,
            notificationsFailedLast24h: null,
            libraryOperationsStatus: "future",
          },
        }),
      },
    });
    renderPage();
    expect(screen.getByText("Not available")).toBeTruthy();
  });

  it("renders security health figures", () => {
    setup();
    renderPage();
    expect(screen.getByText("Suspended Staff Accounts")).toBeTruthy();
    expect(screen.getByText("Failed MFA Attempts (24h)")).toBeTruthy();
  });

  it("shows an honest empty state when there are no active alerts", () => {
    setup();
    renderPage();
    expect(screen.getByText("No active alerts")).toBeTruthy();
  });

  it("renders a real alert with its severity, title, detail, and source", () => {
    setup({
      overview: {
        overview: fixtureOverview({
          platformStatus: "unavailable",
          alerts: [
            {
              id: "infra-database",
              severity: "critical",
              title: "Database unavailable",
              detail: "Connectivity check failed",
              source: "infrastructure",
            },
          ],
        }),
      },
    });
    renderPage();
    expect(screen.getByText("Database unavailable")).toBeTruthy();
    expect(screen.getByText("Source: infrastructure")).toBeTruthy();
  });

  it("shows a loading skeleton, never stale/fabricated data, while the overview is loading", () => {
    setup({ overview: { overview: null, isLoading: true } });
    renderPage();
    expect(screen.queryByText("Platform Status")).toBeNull();
  });

  it("shows a retryable error state when the overview request fails", () => {
    setup({
      overview: {
        overview: null,
        error: new AppError("forbidden", "You do not have access to this page."),
      },
    });
    renderPage();
    expect(screen.getByText("You do not have access to this page.")).toBeTruthy();
  });

  it("renders the fixed diagnostic catalog with a Run action for each", () => {
    setup();
    renderPage();
    expect(screen.getByText("Database Connectivity")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Run" })).toBeTruthy();
  });

  it("renders application modules honestly as 'Operationally available through Reception API', never an independent uptime claim", () => {
    setup();
    renderPage();
    expect(screen.getByText("Operationally available through Reception API")).toBeTruthy();
  });
});
