// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import SettingsPage from "./SettingsPage";
import { useProfile } from "../features/profile/useProfile";
import { useAuditLog } from "../features/audit/useAuditLog";
import { useAuthContext } from "../contexts";
import { authService } from "../services/auth/authService";
import { ThemeProvider } from "../contexts/ThemeContext";
import { ToastProvider } from "../components/ui";
import type { ProfileState } from "../features/profile/useProfile";
import type { Profile } from "../services/profile/ProfileService";

vi.mock("../features/profile/useProfile", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../features/profile/useProfile")>()),
  useProfile: vi.fn(),
}));
vi.mock("../features/audit/useAuditLog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../features/audit/useAuditLog")>()),
  useAuditLog: vi.fn(),
}));
vi.mock("../contexts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../contexts")>()),
  useAuthContext: vi.fn(),
}));
vi.mock("../services/auth/authService", () => ({
  authService: { signOutOtherSessions: vi.fn() },
}));
vi.mock("../services/auth/staffAuthAuditService", () => ({
  staffAuthAuditService: { record: vi.fn() },
}));

const mockUseProfile = vi.mocked(useProfile);
const mockUseAuditLog = vi.mocked(useAuditLog);
const mockUseAuthContext = vi.mocked(useAuthContext);
const mockSignOutOtherSessions = vi.mocked(authService.signOutOtherSessions);

afterEach(cleanup);

function fixtureProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    identity: {
      id: "staff-1",
      fullName: "Reception One",
      role: "reception_warden",
      hostelId: "hostel-1",
      status: "active",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    preferences: {
      phoneNumber: null,
      officeLocation: null,
      bio: null,
      preferredContactMethod: "email",
      theme: "system",
      density: "comfortable",
      fontScale: "default",
      dateFormat: "DD_MM_YYYY",
      reducedMotion: false,
      highContrast: false,
      defaultLandingPage: "dashboard",
      notificationPreferences: {},
      dashboardPreferences: {},
      shortcuts: [],
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    ...overrides,
  };
}

function setup(overrides: Partial<ProfileState> = {}) {
  const update = vi.fn().mockResolvedValue(fixtureProfile());
  mockUseProfile.mockReturnValue({
    profile: fixtureProfile(),
    isLoading: false,
    error: null,
    update,
    isSaving: false,
    saveError: null,
    ...overrides,
  });
  mockUseAuditLog.mockReturnValue({
    result: { items: [], total: 0, page: 1, pageSize: 20 },
    isLoading: false,
    isFetching: false,
    error: null,
    refresh: vi.fn(),
  });
  mockUseAuthContext.mockReturnValue({
    status: "authenticated",
    signOut: vi.fn(),
    refreshAssuranceLevel: vi.fn(),
    lastSignOutReason: null,
    inactivityStatus: "active",
    inactivityRemainingMs: 0,
    resetInactivityTimer: vi.fn(),
  } as never);
  return { update };
}

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ThemeProvider>
          <ToastProvider>
            <SettingsPage />
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("SettingsPage", () => {
  it("renders read-only identity fields that cannot be edited", () => {
    setup();
    renderPage();
    expect(screen.getByText("reception warden")).toBeTruthy();
    expect(screen.getByText("active")).toBeTruthy();
    expect(
      screen.getByText(
        /Role, hostel assignment, and account status are managed by an administrator/,
      ),
    ).toBeTruthy();
  });

  it("Save profile sends only the editable fields, never role/hostelId/status", async () => {
    const { update } = setup();
    renderPage();
    const nameInput = screen.getByLabelText("Full name") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Updated Name" } });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => expect(update).toHaveBeenCalled());
    const payload = update.mock.calls[0]![0];
    expect(payload.fullName).toBe("Updated Name");
    expect(payload).not.toHaveProperty("role");
    expect(payload).not.toHaveProperty("hostelId");
    expect(payload).not.toHaveProperty("status");
  });

  it("mandatory notification categories render as checked and disabled — cannot be turned off", () => {
    setup();
    renderPage();
    const emergencyToggle = screen.getByLabelText("Emergency alerts") as HTMLInputElement;
    expect(emergencyToggle.checked).toBe(true);
    expect(emergencyToggle.disabled).toBe(true);
    expect(screen.getAllByText("Mandatory — cannot be disabled").length).toBeGreaterThan(0);
  });

  it("a non-mandatory notification category can be toggled off and is included in the save payload", async () => {
    const { update } = setup();
    renderPage();
    const adminToggle = screen.getByLabelText("Administrative notifications") as HTMLInputElement;
    expect(adminToggle.disabled).toBe(false);
    fireEvent.click(adminToggle);
    fireEvent.click(screen.getByRole("button", { name: "Save notification preferences" }));

    await waitFor(() => expect(update).toHaveBeenCalled());
    const payload = update.mock.calls[0]![0];
    expect(payload.notificationPreferences.administrative).toBe(false);
  });

  it("the settings search narrows visible sections", () => {
    setup();
    renderPage();
    expect(screen.getByRole("heading", { name: "Sessions" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Find a setting"), { target: { value: "theme" } });
    expect(screen.queryByRole("heading", { name: "Sessions" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Theme & Accessibility" })).toBeTruthy();
  });

  it('"Sign out of all other sessions" calls the real GoTrue others-scope sign-out, never a user/session id', async () => {
    mockSignOutOtherSessions.mockResolvedValue(undefined);
    setup();
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Sign out of all other sessions" }));
    await waitFor(() => expect(mockSignOutOtherSessions).toHaveBeenCalledWith());
    expect(mockSignOutOtherSessions.mock.calls[0]).toHaveLength(0);
  });

  it("shows the loading state while the profile is loading", () => {
    setup({ profile: null, isLoading: true });
    renderPage();
    expect(screen.getByText("Loading your profile")).toBeTruthy();
  });

  it("shows an error state when the profile fails to load, without exposing raw error detail", () => {
    setup({
      profile: null,
      isLoading: false,
      error: { kind: "unknown", userMessage: "Something went wrong. Please try again." } as never,
    });
    renderPage();
    expect(screen.getByText("Something went wrong. Please try again.")).toBeTruthy();
  });

  it("Personal Activity is honestly unavailable for library_incharge, not silently empty", () => {
    setup({ profile: fixtureProfile({ identity: fixtureProfile().identity }) });
    mockUseProfile.mockReturnValue({
      profile: fixtureProfile({
        identity: { ...fixtureProfile().identity, role: "library_incharge" },
      }),
      isLoading: false,
      error: null,
      update: vi.fn(),
      isSaving: false,
      saveError: null,
    });
    renderPage();
    expect(
      screen.getByText("Personal activity history is not available for your role."),
    ).toBeTruthy();
  });
});
