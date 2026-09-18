// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { LeaveRequestTable } from "./LeaveRequestTable";
import type { LeaveQueueItem } from "../../features/leave";

afterEach(cleanup);

function make(overrides: Partial<LeaveQueueItem> = {}): LeaveQueueItem {
  return {
    id: "lr1",
    studentId: "s1",
    studentRollNumber: "TEST-001",
    studentFullName: "Jane Doe",
    studentHostelId: "h1",
    studentHostelName: "Kalinga",
    studentRoomId: "r1",
    studentRoomNumber: "101",
    reason: "Family function",
    startDate: "2026-01-10",
    endDate: "2026-01-12",
    status: "pending",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("LeaveRequestTable", () => {
  it("shows a loading skeleton", () => {
    render(
      <LeaveRequestTable items={[]} activeId={null} onOpen={vi.fn()} loading emptyTitle="Empty" />,
    );
    expect(screen.getByLabelText("Loading leave requests")).toBeTruthy();
  });

  it("shows an error state with retry", () => {
    const onRetry = vi.fn();
    render(
      <LeaveRequestTable
        items={[]}
        activeId={null}
        onOpen={vi.fn()}
        error={{ message: "Something went wrong.", onRetry }}
        emptyTitle="Empty"
      />,
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("shows an honest empty state — never a fabricated row", () => {
    render(
      <LeaveRequestTable
        items={[]}
        activeId={null}
        onOpen={vi.fn()}
        emptyTitle="No leave requests"
        emptyDescription="Nothing to show."
      />,
    );
    expect(screen.getByText("No leave requests")).toBeTruthy();
    expect(screen.getByText("Nothing to show.")).toBeTruthy();
  });

  it("renders student, roll number, hostel, room, status, and leave period from real data only", () => {
    render(
      <LeaveRequestTable items={[make()]} activeId={null} onOpen={vi.fn()} emptyTitle="Empty" />,
    );
    expect(screen.getByText("Jane Doe")).toBeTruthy();
    expect(screen.getByText(/TEST-001/)).toBeTruthy();
    expect(screen.getByText(/Kalinga/)).toBeTruthy();
    expect(screen.getByText(/Room 101/)).toBeTruthy();
    expect(screen.getByText("Pending")).toBeTruthy();
    expect(screen.getByText("2026-01-10 – 2026-01-12")).toBeTruthy();
  });

  it("never fabricates hostel/room text when they are null", () => {
    render(
      <LeaveRequestTable
        items={[make({ studentHostelName: null, studentRoomNumber: null })]}
        activeId={null}
        onOpen={vi.fn()}
        emptyTitle="Empty"
      />,
    );
    expect(screen.queryByText(/Room/)).toBeNull();
  });

  it("opening a row calls onOpen with its id", () => {
    const onOpen = vi.fn();
    render(
      <LeaveRequestTable items={[make()]} activeId={null} onOpen={onOpen} emptyTitle="Empty" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "View" }));
    expect(onOpen).toHaveBeenCalledWith("lr1");
  });

  it("marks the active row's data attribute for focus-return", () => {
    const { container } = render(
      <LeaveRequestTable items={[make()]} activeId="lr1" onOpen={vi.fn()} emptyTitle="Empty" />,
    );
    expect(container.querySelector('[data-leave-request-id="lr1"]')).toBeTruthy();
  });
});
