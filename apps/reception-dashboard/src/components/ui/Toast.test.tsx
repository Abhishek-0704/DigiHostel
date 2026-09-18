// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { ToastProvider, useToast } from "./Toast";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function TriggerButton({ message = "Saved successfully" }: { message?: string }) {
  const { showToast } = useToast();
  return (
    <button type="button" onClick={() => showToast({ message })}>
      Trigger
    </button>
  );
}

describe("ToastProvider / useToast", () => {
  it("useToast throws outside a ToastProvider (fails loud, not silently)", () => {
    function Bare() {
      useToast();
      return null;
    }
    expect(() => render(<Bare />)).toThrow(/ToastProvider/);
  });

  it("shows a toast in an aria-live region when showToast is called", () => {
    render(
      <ToastProvider>
        <TriggerButton />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Trigger" }));
    expect(screen.getByText("Saved successfully")).toBeTruthy();
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("can show more than one toast at once, each independently dismissible", () => {
    render(
      <ToastProvider>
        <TriggerButton message="First" />
      </ToastProvider>,
    );
    const trigger = screen.getByRole("button", { name: "Trigger" });
    fireEvent.click(trigger);
    fireEvent.click(trigger);
    expect(screen.getAllByText("First")).toHaveLength(2);
  });

  it("dismisses a toast when its own close button is clicked", () => {
    render(
      <ToastProvider>
        <TriggerButton />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Trigger" }));
    expect(screen.getByText("Saved successfully")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
    expect(screen.queryByText("Saved successfully")).toBeNull();
  });

  it("auto-dismisses after its own duration elapses", () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <TriggerButton />
      </ToastProvider>,
    );
    act(() => {
      screen.getByRole("button", { name: "Trigger" }).click();
    });
    expect(screen.getByText("Saved successfully")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(screen.queryByText("Saved successfully")).toBeNull();
  });
});
