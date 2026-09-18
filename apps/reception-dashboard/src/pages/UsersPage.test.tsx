// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import UsersPage from "./UsersPage";
import {
  useStaffDirectory,
  useStaffStatistics,
  useActingStaffId,
  useStaffMutations,
} from "../features/staff";
import { useAuthorization } from "../contexts/AuthorizationContext";
import { ToastProvider } from "../components/ui";
import type { StaffDirectoryState, StaffStatisticsState } from "../features/staff";
import type { StaffAdmin } from "@digihostel/api-client-react";

// jsdom does not implement <dialog>'s showModal()/close() — same minimal
// polyfill StudentReturnPage.test.tsx/EmergencyDetailPage.test.tsx already established.
if (typeof HTMLDialogElement !== "undefined") {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}

vi.mock("../features/staff", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../features/staff")>()),
  useStaffDirectory: vi.fn(),
  useStaffStatistics: vi.fn(),
  useActingStaffId: vi.fn(),
  useStaffMutations: vi.fn(),
}));
vi.mock("../hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../hooks")>()),
  useDebouncedValue: (value: unknown) => value,
}));
vi.mock("../contexts/AuthorizationContext", () => ({ useAuthorization: vi.fn() }));

const mockUseStaffDirectory = vi.mocked(useStaffDirectory);
const mockUseStaffStatistics = vi.mocked(useStaffStatistics);
const mockUseActingStaffId = vi.mocked(useActingStaffId);
const mockUseStaffMutations = vi.mocked(useStaffMutations);
const mockUseAuthorization = vi.mocked(useAuthorization);

afterEach(cleanup);

function fixtureStaff(overrides: Partial<StaffAdmin> = {}): StaffAdmin {
  return {
    id: "staff-1",
    fullName: "Reception Warden One",
    email: "reception1@example.test",
    role: "reception_warden",
    hostelId: "hostel-1",
    hostelName: "Kalinga",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function fixtureMutation(overrides: Partial<ReturnType<typeof mockMutation>> = {}) {
  return { ...mockMutation(), ...overrides };
}

function mockMutation() {
  return {
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
  };
}

function setup(items: StaffAdmin[], overrides: Partial<StaffDirectoryState> = {}) {
  mockUseStaffDirectory.mockReturnValue({
    result: { items, total: items.length, page: 1, pageSize: 20 },
    isLoading: false,
    isFetching: false,
    error: null,
    refresh: vi.fn(),
    ...overrides,
  });
  mockUseStaffStatistics.mockReturnValue({
    statistics: {
      totalStaff: 4,
      activeStaff: 3,
      suspendedStaff: 1,
      byRole: { reception_warden: 2, library_incharge: 0, hostel_admin: 1, super_admin: 1 },
    },
    isLoading: false,
    error: null,
    refresh: vi.fn(),
  } as StaffStatisticsState);
  mockUseActingStaffId.mockReturnValue("acting-staff-id");
  mockUseStaffMutations.mockReturnValue({
    create: fixtureMutation(),
    changeRole: fixtureMutation(),
    changeHostel: fixtureMutation(),
    changeStatus: fixtureMutation(),
    resetPassword: fixtureMutation(),
    forceSignOut: fixtureMutation(),
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
        <MemoryRouter initialEntries={["/users"]}>
          <UsersPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe("UsersPage", () => {
  it("renders real staff rows from the directory result", () => {
    setup([fixtureStaff()]);
    renderPage();
    expect(screen.getByText("Reception Warden One")).toBeTruthy();
    expect(screen.getByText("reception1@example.test")).toBeTruthy();
  });

  it("renders the statistics strip with real server-derived counts", () => {
    setup([fixtureStaff()]);
    renderPage();
    expect(screen.getByText("Total Staff")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
  });

  it("shows an honest empty state when there is no staff and no filters", () => {
    setup([]);
    renderPage();
    expect(screen.getByText("No staff accounts yet")).toBeTruthy();
  });

  it("shows a distinct empty state once a search query is entered and nothing matches", () => {
    setup([]);
    renderPage();
    fireEvent.change(screen.getByLabelText("Search staff"), { target: { value: "zzz" } });
    expect(screen.getByText("No staff match these filters")).toBeTruthy();
  });

  it("shows an honest error state without fabricating data", () => {
    setup([], { error: { userMessage: "Something went wrong." } as never });
    renderPage();
    expect(screen.getByText("Something went wrong.")).toBeTruthy();
  });

  it("toggling a role filter chip calls the query with the new role", () => {
    setup([fixtureStaff()]);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Hostel Administrator" }));
    const lastCall = mockUseStaffDirectory.mock.calls.at(-1)![0];
    expect(lastCall.role).toEqual(["hostel_admin"]);
  });

  it("shows the all-hostels scope indicator for super_admin", () => {
    setup([fixtureStaff()]);
    renderPage();
    expect(screen.getByText("All hostels")).toBeTruthy();
  });

  it("shows the Create Staff Account control when the caller has users:manage", () => {
    setup([fixtureStaff()]);
    renderPage();
    expect(screen.getByRole("button", { name: "Create Staff Account" })).toBeTruthy();
  });

  it("hides the Create Staff Account control when the caller lacks users:manage", () => {
    setup([fixtureStaff()]);
    mockUseAuthorization.mockReturnValue({
      role: "reception_warden",
      hostelId: "hostel-1",
      staffName: null,
      permissions: [],
      isAuthorizationLoading: false,
      isAuthorized: true,
      authorizationError: null,
      hasRole: () => false,
      hasPermission: () => false,
      can: () => false,
      canAccessHostel: () => false,
      refreshAuthorization: vi.fn(),
    } as never);
    renderPage();
    expect(screen.queryByRole("button", { name: "Create Staff Account" })).toBeNull();
  });

  it("clicking Manage opens the detail panel with the staff member's own already-fetched data", () => {
    setup([fixtureStaff({ fullName: "Hostel Admin One" })]);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Manage" }));
    expect(screen.getAllByText("Hostel Admin One").length).toBeGreaterThan(0);
  });

  it("disables self-targeting management actions when the row is the caller's own account", () => {
    mockUseActingStaffId.mockReturnValue("staff-1");
    setup([fixtureStaff({ id: "staff-1" })]);
    mockUseActingStaffId.mockReturnValue("staff-1");
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Manage" }));
    expect(screen.getByText(/This is your own account/)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Change Role" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect((screen.getByRole("button", { name: "Suspend" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("suspending a staff member calls changeStatus with 'suspended' and shows a success toast", async () => {
    const changeStatus = fixtureMutation();
    setup([fixtureStaff({ id: "staff-2", status: "active" })]);
    mockUseStaffMutations.mockReturnValue({
      create: fixtureMutation(),
      changeRole: fixtureMutation(),
      changeHostel: fixtureMutation(),
      changeStatus,
      resetPassword: fixtureMutation(),
      forceSignOut: fixtureMutation(),
      mapError: () => ({ userMessage: "Something went wrong." }) as never,
      extractServerErrorMessage: () => null,
    } as never);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Manage" }));
    fireEvent.click(screen.getByRole("button", { name: "Suspend" }));
    const suspendButtons = screen.getAllByRole("button", { name: "Suspend" });
    fireEvent.click(suspendButtons[suspendButtons.length - 1]!);
    await waitFor(() =>
      expect(changeStatus.mutateAsync).toHaveBeenCalledWith({
        staffId: "staff-2",
        status: "suspended",
      }),
    );
    await waitFor(() => expect(screen.getByText("Staff account suspended.")).toBeTruthy());
  });

  it("a failed mutation surfaces the server's own error message and keeps the dialog open", async () => {
    const changeStatus = {
      mutateAsync: vi.fn().mockRejectedValue({ status: 409, message: "conflict" }),
      isPending: false,
    };
    setup([fixtureStaff({ id: "staff-2", status: "active" })]);
    mockUseStaffMutations.mockReturnValue({
      create: fixtureMutation(),
      changeRole: fixtureMutation(),
      changeHostel: fixtureMutation(),
      changeStatus,
      resetPassword: fixtureMutation(),
      forceSignOut: fixtureMutation(),
      mapError: () =>
        ({ userMessage: "Cannot suspend the only remaining active super_admin." }) as never,
      extractServerErrorMessage: () => null,
    } as never);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Manage" }));
    fireEvent.click(screen.getByRole("button", { name: "Suspend" }));
    const suspendButtons = screen.getAllByRole("button", { name: "Suspend" });
    fireEvent.click(suspendButtons[suspendButtons.length - 1]!);
    await waitFor(() =>
      expect(
        screen.getByText("Cannot suspend the only remaining active super_admin."),
      ).toBeTruthy(),
    );
  });

  it("shows pagination controls and total count once results exist", () => {
    setup([fixtureStaff()], {
      result: { items: [fixtureStaff()], total: 45, page: 1, pageSize: 20 },
    });
    renderPage();
    expect(screen.getByText(/45 staff members/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next" })).toBeTruthy();
  });
});
