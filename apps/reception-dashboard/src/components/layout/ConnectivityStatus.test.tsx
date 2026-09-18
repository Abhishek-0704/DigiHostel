// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { ConnectivityStatus } from "./ConnectivityStatus";

afterEach(() => {
  cleanup();
  Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
});

describe("ConnectivityStatus", () => {
  it("reflects the real navigator.onLine state on mount", () => {
    Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
    render(<ConnectivityStatus />);
    expect(screen.getByRole("status").getAttribute("aria-label")).toBe("Online");
  });

  it("updates to Offline on a real 'offline' event, not a fabricated status", () => {
    render(<ConnectivityStatus />);
    act(() => {
      Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
      fireEvent(window, new Event("offline"));
    });
    expect(screen.getByRole("status").getAttribute("aria-label")).toContain("Offline");
  });

  it("updates back to Online on a real 'online' event", () => {
    Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
    render(<ConnectivityStatus />);
    act(() => {
      Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
      fireEvent(window, new Event("online"));
    });
    expect(screen.getByRole("status").getAttribute("aria-label")).toBe("Online");
  });
});
