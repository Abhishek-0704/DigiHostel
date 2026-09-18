// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "../components/ui";
import ReportsPage from "./ReportsPage";
import {
  useReportCatalog,
  useReportPreview,
  useReportTemplates,
  useReportHistory,
} from "../features/reports";
import { useAuthorization } from "../contexts/AuthorizationContext";
import type {
  ReportCatalogState,
  ReportPreviewState,
  ReportTemplatesState,
  ReportHistoryState,
} from "../features/reports";
import type { ReportDefinition } from "../services/reports/ReportService";

vi.mock("../features/reports", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../features/reports")>()),
  useReportCatalog: vi.fn(),
  useReportPreview: vi.fn(),
  useReportTemplates: vi.fn(),
  useReportHistory: vi.fn(),
}));
vi.mock("../contexts/AuthorizationContext", () => ({ useAuthorization: vi.fn() }));

const mockUseReportCatalog = vi.mocked(useReportCatalog);
const mockUseReportPreview = vi.mocked(useReportPreview);
const mockUseReportTemplates = vi.mocked(useReportTemplates);
const mockUseReportHistory = vi.mocked(useReportHistory);
const mockUseAuthorization = vi.mocked(useAuthorization);

afterEach(cleanup);

function fixtureReport(overrides: Partial<ReportDefinition> = {}): ReportDefinition {
  return {
    id: "leave_authorization",
    name: "Leave Authorization Report",
    category: "leave",
    description: "Every leave request within your authorized scope.",
    status: "implemented",
    availableFields: [
      { id: "studentRollNumber", label: "Roll Number" },
      { id: "status", label: "Status" },
    ],
    availableFilters: [
      { id: "dateRange", label: "Date range", type: "date_range" },
      { id: "statuses", label: "Status", type: "multi_select", options: ["pending", "approved"] },
    ],
    sortFields: [{ id: "createdAt", label: "Created" }],
    defaultSortField: "createdAt",
    isPaginated: true,
    ...overrides,
  };
}

function fixtureUnavailableReport(): ReportDefinition {
  return fixtureReport({
    id: "hostel_occupancy",
    name: "Hostel Occupancy Report",
    category: "operations",
    status: "unavailable",
    unavailableReason: "Authoritative capacity data is not currently available.",
    availableFields: [],
    availableFilters: [],
    sortFields: [],
    defaultSortField: "",
    isPaginated: false,
  });
}

function setup(
  overrides: {
    reports?: ReportDefinition[];
    preview?: Partial<ReportPreviewState>;
    role?: "hostel_admin" | "super_admin";
  } = {},
) {
  mockUseReportCatalog.mockReturnValue({
    reports: overrides.reports ?? [fixtureReport(), fixtureUnavailableReport()],
    isLoading: false,
    error: null,
    refresh: vi.fn(),
  } as ReportCatalogState);
  mockUseReportPreview.mockReturnValue({
    result: null,
    isLoading: false,
    error: null,
    generate: vi.fn().mockResolvedValue(undefined),
    reset: vi.fn(),
    ...overrides.preview,
  } as ReportPreviewState);
  mockUseReportTemplates.mockReturnValue({
    templates: [],
    isLoading: false,
    error: null,
    refresh: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  } as ReportTemplatesState);
  mockUseReportHistory.mockReturnValue({
    history: [],
    isLoading: false,
    error: null,
    refresh: vi.fn(),
  } as ReportHistoryState);
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
        <MemoryRouter initialEntries={["/reports"]}>
          <ReportsPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe("ReportsPage", () => {
  it("renders the report catalog, grouped by category", () => {
    setup();
    renderPage();
    expect(screen.getByText("Leave Authorization Report")).toBeTruthy();
    expect(screen.getByText("Hostel Occupancy Report")).toBeTruthy();
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

  it("shows a placeholder until a report is selected", () => {
    setup();
    renderPage();
    expect(
      screen.getByText("Select a report from the catalog to configure and generate a preview."),
    ).toBeTruthy();
  });

  it("selecting a real report shows its filters, field selector, and Generate Preview action", () => {
    setup();
    renderPage();
    fireEvent.click(screen.getByText("Leave Authorization Report"));
    expect(screen.getByText("Generate Preview")).toBeTruthy();
    // "Status" is both a filter label and a field label in this fixture —
    // both a labelled filter chip-group and a labelled field checkbox exist.
    expect(screen.getAllByLabelText("Status").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Roll Number")).toBeTruthy();
  });

  it("selecting an unavailable report shows the honest reason, never filters or a Generate action", () => {
    setup();
    renderPage();
    fireEvent.click(screen.getByText("Hostel Occupancy Report"));
    expect(
      screen.getByText("Authoritative capacity data is not currently available."),
    ).toBeTruthy();
    expect(screen.queryByText("Generate Preview")).toBeNull();
  });

  it("clicking Generate Preview calls generate() with the report id", async () => {
    const generate = vi.fn().mockResolvedValue(undefined);
    setup({ preview: { generate } });
    renderPage();
    fireEvent.click(screen.getByText("Leave Authorization Report"));
    fireEvent.click(screen.getByText("Generate Preview"));
    await waitFor(() => expect(generate).toHaveBeenCalled());
    expect(generate.mock.calls[0]![0]).toBe("leave_authorization");
  });

  it("Save as Template is disabled until a preview result exists", () => {
    setup();
    renderPage();
    fireEvent.click(screen.getByText("Leave Authorization Report"));
    const saveButton = screen.getByText("Save as Template") as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
  });

  it("Save as Template is enabled once a preview result exists", () => {
    setup({
      preview: {
        result: {
          reportId: "leave_authorization",
          generatedAt: "2026-01-01T00:00:00.000Z",
          periodFrom: null,
          periodTo: null,
          columns: [],
          rows: [],
          summary: null,
          total: 0,
          page: 1,
          pageSize: 20,
        },
      },
    });
    renderPage();
    fireEvent.click(screen.getByText("Leave Authorization Report"));
    const saveButton = screen.getByText("Save as Template") as HTMLButtonElement;
    expect(saveButton.disabled).toBe(false);
  });

  it("shows the honest deferred-capabilities note", () => {
    setup();
    renderPage();
    expect(screen.getByText(/Export to PDF\/Excel\/CSV, scheduled report delivery/)).toBeTruthy();
  });
});
