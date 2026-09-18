// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ProfileMenu } from "./ProfileMenu";
import { useSessionContext } from "../../contexts/SessionContext";
import { useAuthContext } from "../../contexts/AuthContext";
import { useAuthorization } from "../../contexts/AuthorizationContext";

vi.mock("../../contexts/SessionContext", () => ({ useSessionContext: vi.fn() }));
vi.mock("../../contexts/AuthContext", () => ({ useAuthContext: vi.fn() }));
vi.mock("../../contexts/AuthorizationContext", () => ({ useAuthorization: vi.fn() }));

const mockUseSessionContext = vi.mocked(useSessionContext);
const mockUseAuthContext = vi.mocked(useAuthContext);
const mockUseAuthorization = vi.mocked(useAuthorization);

afterEach(cleanup);

const signOut = vi.fn();

function setup() {
  mockUseSessionContext.mockReturnValue({
    session: { user: { email: "reception1@example.test" } } as never,
    isLoading: false,
    configError: false,
  });
  mockUseAuthContext.mockReturnValue({
    status: "authenticated",
    signOut,
    refreshAssuranceLevel: vi.fn(),
    lastSignOutReason: null,
    inactivityStatus: "active",
    inactivityRemainingMs: 0,
    resetInactivityTimer: vi.fn(),
  });
  mockUseAuthorization.mockReturnValue({
    role: "reception_warden",
    hostelId: null,
    staffName: "Test Reception Warden",
    permissions: [],
    isAuthorizationLoading: false,
    isAuthorized: true,
    authorizationError: null,
    hasRole: () => false,
    hasPermission: () => false,
    can: () => false,
    canAccessHostel: () => false,
    refreshAuthorization: vi.fn(),
  });
}

function renderMenu() {
  return render(
    <MemoryRouter>
      <ProfileMenu />
    </MemoryRouter>,
  );
}

describe("ProfileMenu", () => {
  it("renders nothing when there is no session", () => {
    mockUseSessionContext.mockReturnValue({ session: null, isLoading: false, configError: false });
    mockUseAuthContext.mockReturnValue({
      status: "unauthenticated",
      signOut,
      refreshAssuranceLevel: vi.fn(),
      lastSignOutReason: null,
      inactivityStatus: "active",
      inactivityRemainingMs: 0,
      resetInactivityTimer: vi.fn(),
    });
    mockUseAuthorization.mockReturnValue({
      role: null,
      hostelId: null,
      staffName: null,
      permissions: [],
      isAuthorizationLoading: false,
      isAuthorized: false,
      authorizationError: null,
      hasRole: () => false,
      hasPermission: () => false,
      can: () => false,
      canAccessHostel: () => false,
      refreshAuthorization: vi.fn(),
    });
    const { container } = renderMenu();
    expect(container.firstChild).toBeNull();
  });

  it("is closed by default and opens on trigger click, moving focus into the panel", () => {
    setup();
    renderMenu();
    expect(screen.queryByText("Settings")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    expect(screen.getByText("Settings")).toBeTruthy();
    expect(document.activeElement?.textContent).toContain("Settings");
  });

  it("shows the real staff identity inside the panel — not a second identity source", () => {
    setup();
    renderMenu();
    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    expect(screen.getByText("Test Reception Warden")).toBeTruthy();
    expect(screen.getByText("Reception Warden")).toBeTruthy();
  });

  it("closes on Escape and returns focus to the trigger button", () => {
    setup();
    renderMenu();
    const trigger = screen.getByRole("button", { name: "Account menu" });
    fireEvent.click(trigger);
    expect(screen.getByText("Settings")).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("Settings")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on an outside click", () => {
    setup();
    renderMenu();
    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    expect(screen.getByText("Settings")).toBeTruthy();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByText("Settings")).toBeNull();
  });

  it("signs out through the existing session lifecycle, not a second mechanism", () => {
    setup();
    renderMenu();
    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
