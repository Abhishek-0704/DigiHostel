// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { ToastProvider } from "../ui";
import { DashboardRefreshControl } from "./DashboardRefreshControl";

afterEach(cleanup);

describe("DashboardRefreshControl", () => {
  it("calls the provided refresh callback when clicked", () => {
    const onRefresh = vi.fn();
    render(
      <ToastProvider>
        <DashboardRefreshControl onRefresh={onRefresh} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Refresh/ }));
    expect(onRefresh).toHaveBeenCalled();
  });

  it("confirms the action with a toast rather than a fabricated loading spinner", () => {
    render(
      <ToastProvider>
        <DashboardRefreshControl onRefresh={vi.fn()} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Refresh/ }));
    expect(screen.getByText("Dashboard refreshed.")).toBeTruthy();
  });
});
