// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import ConfigurationPage from "./ConfigurationPage";
import {
  useConfigurationList,
  useConfigurationStatistics,
  useConfigurationDomains,
  useConfigurationMutations,
} from "../features/configuration";
import { useAuthorization } from "../contexts/AuthorizationContext";
import { ToastProvider } from "../components/ui";
import type {
  ConfigurationListState,
  ConfigurationStatisticsState,
} from "../features/configuration";
import type { ConfigurationEntry } from "@digihostel/api-client-react";

// jsdom does not implement <dialog>'s showModal()/close() — same minimal
// polyfill UsersPage.test.tsx/StudentReturnPage.test.tsx already established.
if (typeof HTMLDialogElement !== "undefined") {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}

vi.mock("../features/configuration", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../features/configuration")>()),
  useConfigurationList: vi.fn(),
  useConfigurationStatistics: vi.fn(),
  useConfigurationDomains: vi.fn(),
  useConfigurationMutations: vi.fn(),
}));
vi.mock("../hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../hooks")>()),
  useDebouncedValue: (value: unknown) => value,
}));
vi.mock("../contexts/AuthorizationContext", () => ({ useAuthorization: vi.fn() }));

const mockUseConfigurationList = vi.mocked(useConfigurationList);
const mockUseConfigurationStatistics = vi.mocked(useConfigurationStatistics);
const mockUseConfigurationDomains = vi.mocked(useConfigurationDomains);
const mockUseConfigurationMutations = vi.mocked(useConfigurationMutations);
const mockUseAuthorization = vi.mocked(useAuthorization);

afterEach(cleanup);

function fixtureEntry(overrides: Partial<ConfigurationEntry> = {}): ConfigurationEntry {
  return {
    id: "entry-1",
    domain: "system",
    key: "maintenance_banner_text",
    value: "Scheduled maintenance tonight.",
    valueType: "string",
    description: "Shown on the dashboard when active.",
    scope: "global",
    hostelId: null,
    hostelName: null,
    isActive: true,
    version: 1,
    createdBy: "staff-1",
    createdByName: "Super Admin",
    updatedBy: "staff-1",
    updatedByName: "Super Admin",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function fixtureMutation() {
  return { mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false };
}

function setup(items: ConfigurationEntry[], overrides: Partial<ConfigurationListState> = {}) {
  mockUseConfigurationList.mockReturnValue({
    result: { items, total: items.length, page: 1, pageSize: 20 },
    isLoading: false,
    isFetching: false,
    error: null,
    refresh: vi.fn(),
    ...overrides,
  });
  mockUseConfigurationStatistics.mockReturnValue({
    statistics: {
      totalEntries: 3,
      activeEntries: 2,
      inactiveEntries: 1,
      byDomain: {
        hostel: 1,
        approval: 0,
        movement: 0,
        emergency: 0,
        health: 0,
        notification: 0,
        system: 2,
        feature_flags: 0,
      },
    },
    isLoading: false,
    error: null,
    refresh: vi.fn(),
  } as ConfigurationStatisticsState);
  mockUseConfigurationDomains.mockReturnValue({
    domains: [
      "hostel",
      "approval",
      "movement",
      "emergency",
      "health",
      "notification",
      "system",
      "feature_flags",
    ],
    isLoading: false,
  });
  mockUseConfigurationMutations.mockReturnValue({
    create: fixtureMutation(),
    update: fixtureMutation(),
    validate: fixtureMutation(),
    mapError: () => ({ userMessage: "Something went wrong." }) as never,
    extractServerErrorMessage: () => null,
  } as never);
  mockUseAuthorization.mockReturnValue({
    role: "super_admin",
    hostelId: null,
    staffName: null,
    permissions: [],
    isAuthorizationLoading: false,
    isAuthorized: true,
    authorizationError: null,
    hasRole: () => false,
    hasPermission: () => true,
    can: () => true,
    canAccessHostel: () => true,
    refreshAuthorization: vi.fn(),
  } as never);
}

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/configuration"]}>
          <ConfigurationPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe("ConfigurationPage", () => {
  it("renders real configuration rows from the list result", () => {
    setup([fixtureEntry()]);
    renderPage();
    expect(screen.getByText("maintenance_banner_text")).toBeTruthy();
  });

  it("renders the statistics strip with real server-derived counts", () => {
    setup([fixtureEntry()]);
    renderPage();
    expect(screen.getByText("Total Entries")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("shows an honest empty state when there is no configuration and no filters", () => {
    setup([]);
    renderPage();
    expect(screen.getByText("No configuration entries yet")).toBeTruthy();
  });

  it("shows a distinct empty state once a search query is entered and nothing matches", () => {
    setup([]);
    renderPage();
    fireEvent.change(screen.getByLabelText("Search configuration"), { target: { value: "zzz" } });
    expect(screen.getByText("No configuration entries match these filters")).toBeTruthy();
  });

  it("toggling a domain filter chip calls the query with the new domain", () => {
    setup([fixtureEntry()]);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Hostel" }));
    const lastCall = mockUseConfigurationList.mock.calls.at(-1)![0];
    expect(lastCall.domain).toEqual(["hostel"]);
  });

  it("shows the all-hostels scope indicator for super_admin", () => {
    setup([fixtureEntry()]);
    renderPage();
    expect(screen.getByText("All hostels")).toBeTruthy();
  });

  it("clicking Manage opens the detail panel with the entry's own already-fetched data", () => {
    setup([fixtureEntry({ key: "distinctive_key_name" })]);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Manage" }));
    expect(screen.getAllByText("distinctive_key_name").length).toBeGreaterThan(0);
  });

  it("hostel_admin cannot Edit/Deactivate a GLOBAL entry — the button is disabled", () => {
    setup([fixtureEntry({ scope: "global" })]);
    mockUseAuthorization.mockReturnValue({
      role: "hostel_admin",
      hostelId: "hostel-a",
      staffName: null,
      permissions: [],
      isAuthorizationLoading: false,
      isAuthorized: true,
      authorizationError: null,
      hasRole: () => false,
      hasPermission: () => true,
      can: () => true,
      canAccessHostel: () => false,
      refreshAuthorization: vi.fn(),
    } as never);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Manage" }));
    expect((screen.getByRole("button", { name: "Edit Value" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("hostel_admin CAN edit their own hostel's entry — the button is enabled", () => {
    setup([fixtureEntry({ scope: "hostel", hostelId: "hostel-a", hostelName: "Hostel A" })]);
    mockUseAuthorization.mockReturnValue({
      role: "hostel_admin",
      hostelId: "hostel-a",
      staffName: null,
      permissions: [],
      isAuthorizationLoading: false,
      isAuthorized: true,
      authorizationError: null,
      hasRole: () => false,
      hasPermission: () => true,
      can: () => true,
      canAccessHostel: () => true,
      refreshAuthorization: vi.fn(),
    } as never);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Manage" }));
    expect((screen.getByRole("button", { name: "Edit Value" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("deactivating an entry calls update with isActive:false and shows a success toast", async () => {
    const update = fixtureMutation();
    setup([fixtureEntry({ id: "entry-2", isActive: true })]);
    mockUseConfigurationMutations.mockReturnValue({
      create: fixtureMutation(),
      update,
      validate: fixtureMutation(),
      mapError: () => ({ userMessage: "Something went wrong." }) as never,
      extractServerErrorMessage: () => null,
    } as never);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Manage" }));
    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
    const confirmButtons = screen.getAllByRole("button", { name: "Deactivate" });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]!);
    await waitFor(() =>
      expect(update.mutateAsync).toHaveBeenCalledWith({
        entryId: "entry-2",
        params: { expectedVersion: 1, isActive: false },
      }),
    );
    await waitFor(() => expect(screen.getByText("Status updated.")).toBeTruthy());
  });

  it("a failed update surfaces the server's own error message", async () => {
    const update = {
      mutateAsync: vi.fn().mockRejectedValue({ status: 409, message: "conflict" }),
      isPending: false,
    };
    setup([fixtureEntry({ id: "entry-3" })]);
    mockUseConfigurationMutations.mockReturnValue({
      create: fixtureMutation(),
      update,
      validate: fixtureMutation(),
      mapError: () =>
        ({
          userMessage: "This configuration entry was changed by someone else since you loaded it.",
        }) as never,
      extractServerErrorMessage: () => null,
    } as never);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Manage" }));
    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
    const confirmButtons = screen.getAllByRole("button", { name: "Deactivate" });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]!);
    await waitFor(() =>
      expect(
        screen.getByText(
          "This configuration entry was changed by someone else since you loaded it.",
        ),
      ).toBeTruthy(),
    );
  });

  it("shows pagination controls and total count once results exist", () => {
    setup([fixtureEntry()], {
      result: { items: [fixtureEntry()], total: 45, page: 1, pageSize: 20 },
    });
    renderPage();
    expect(screen.getByText(/45 entries/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next" })).toBeTruthy();
  });
});
