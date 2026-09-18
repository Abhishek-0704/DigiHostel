// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NotificationProvider, useNotificationCenter } from "./NotificationContext";
import { notificationService } from "../services/notifications/NotificationService";
import type { Notification } from "../features/notifications/types";

vi.mock("../services/notifications/NotificationService", () => ({
  notificationService: { list: vi.fn() },
}));

const mockList = vi.mocked(notificationService.list);

afterEach(() => {
  cleanup();
  mockList.mockClear();
});

function fixture(overrides: Partial<Notification> = {}): Notification {
  return {
    id: "n1",
    title: "Test notification",
    message: "Test message",
    category: "system",
    priority: "medium",
    state: "unread",
    createdAt: "2026-01-01T00:00:00.000Z",
    source: "Test Source",
    ...overrides,
  };
}

function Harness() {
  const ctx = useNotificationCenter();
  return (
    <div>
      <span data-testid="count">{ctx.unreadCount}</span>
      <span data-testid="loading">{String(ctx.isLoading)}</span>
      <span data-testid="notifications">
        {JSON.stringify(ctx.notifications.map((n) => n.state))}
      </span>
      <button onClick={() => ctx.markAsRead(["n1"])}>markAsRead</button>
      <button onClick={() => ctx.acknowledge(["n1"])}>acknowledge</button>
      <button onClick={() => ctx.dismiss(["n1"])}>dismiss</button>
      <button onClick={() => ctx.archive(["n1"])}>archive</button>
      <button onClick={() => ctx.markAllAsRead()}>markAllAsRead</button>
      <button onClick={() => ctx.refresh()}>refresh</button>
    </div>
  );
}

function renderHarness() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <NotificationProvider>
        <Harness />
      </NotificationProvider>
    </QueryClientProvider>,
  );
}

describe("NotificationProvider / useNotificationCenter", () => {
  it("throws outside a NotificationProvider (fails loud, not silently)", () => {
    function Bare() {
      useNotificationCenter();
      return null;
    }
    expect(() => render(<Bare />)).toThrow(/NotificationProvider/);
  });

  it("starts empty and honestly zero when the service resolves no notifications", async () => {
    mockList.mockResolvedValue([]);
    renderHarness();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    expect(screen.getByTestId("count").textContent).toBe("0");
  });

  it("derives unreadCount from the real notification list, counting only 'unread' notifications", async () => {
    mockList.mockResolvedValue([
      fixture({ id: "a", state: "unread" }),
      fixture({ id: "b", state: "read" }),
      fixture({ id: "c", state: "unread" }),
    ]);
    renderHarness();
    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("2"));
  });

  it("markAsRead transitions only an unread notification to read, locally", async () => {
    mockList.mockResolvedValue([fixture({ id: "n1", state: "unread" })]);
    renderHarness();
    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));
    fireEvent.click(screen.getByText("markAsRead"));
    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("0"));
    expect(screen.getByTestId("notifications").textContent).toBe('["read"]');
  });

  it("acknowledge, dismiss, and archive each transition local state without a persistence claim", async () => {
    mockList.mockResolvedValue([fixture({ id: "n1", state: "unread" })]);
    renderHarness();
    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));

    fireEvent.click(screen.getByText("acknowledge"));
    await waitFor(() =>
      expect(screen.getByTestId("notifications").textContent).toBe('["acknowledged"]'),
    );

    fireEvent.click(screen.getByText("dismiss"));
    await waitFor(() =>
      expect(screen.getByTestId("notifications").textContent).toBe('["dismissed"]'),
    );
  });

  it("markAllAsRead transitions every unread notification, leaving others untouched", async () => {
    mockList.mockResolvedValue([
      fixture({ id: "a", state: "unread" }),
      fixture({ id: "b", state: "acknowledged" }),
    ]);
    renderHarness();
    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));
    fireEvent.click(screen.getByText("markAllAsRead"));
    await waitFor(() =>
      expect(screen.getByTestId("notifications").textContent).toBe('["read","acknowledged"]'),
    );
  });

  it("refresh() re-invokes the real list query", async () => {
    mockList.mockResolvedValue([]);
    renderHarness();
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByText("refresh"));
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
  });
});
