// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { LiveStatusBar } from "./LiveStatusBar";

afterEach(cleanup);

describe("LiveStatusBar", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true, writable: true });
  });

  it("shows Online when the browser reports connectivity", () => {
    render(<LiveStatusBar realtimeState="subscribed" lastUpdatedAt={null} />);
    expect(screen.getByText("Online")).toBeTruthy();
  });

  it("shows Offline when the browser goes offline — reuses the same signal as the header, not a second monitor", () => {
    render(<LiveStatusBar realtimeState="subscribed" lastUpdatedAt={null} />);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByText("Offline")).toBeTruthy();
  });

  it("shows Live for a subscribed realtime probe and Reconnecting for an error one", () => {
    const { rerender } = render(<LiveStatusBar realtimeState="subscribed" lastUpdatedAt={null} />);
    expect(screen.getByText("Live")).toBeTruthy();
    rerender(<LiveStatusBar realtimeState="error" lastUpdatedAt={null} />);
    expect(screen.getByText("Reconnecting")).toBeTruthy();
  });

  it("omits the last-updated line until a refresh has actually happened", () => {
    render(<LiveStatusBar realtimeState="subscribed" lastUpdatedAt={null} />);
    expect(screen.queryByText(/Last updated/)).toBeNull();
  });

  it("shows a real last-updated time once one is provided", () => {
    render(<LiveStatusBar realtimeState="subscribed" lastUpdatedAt={new Date()} />);
    expect(screen.getByText(/Last updated/)).toBeTruthy();
  });
});
