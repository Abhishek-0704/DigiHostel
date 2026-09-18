// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SessionTimer } from "./SessionTimer";

afterEach(cleanup);

describe("SessionTimer", () => {
  it("shows elapsed time since the real updatedAt timestamp", () => {
    const updatedAt = new Date(Date.now() - 5_000).toISOString();
    render(<SessionTimer updatedAt={updatedAt} status="father_notified" />);
    expect(screen.getByText("Time since last update")).toBeTruthy();
  });

  it("shows an explicitly-labeled ESTIMATE for the next automated check on a non-terminal, actively-escalating session", () => {
    const updatedAt = new Date().toISOString();
    render(<SessionTimer updatedAt={updatedAt} status="father_notified" />);
    expect(screen.getByText("Next automated check (estimated)")).toBeTruthy();
    expect(screen.getByText(/Estimate only/)).toBeTruthy();
  });

  it("never shows a next-check estimate for a terminal session", () => {
    const updatedAt = new Date().toISOString();
    render(<SessionTimer updatedAt={updatedAt} status="approved" />);
    expect(screen.queryByText("Next automated check (estimated)")).toBeNull();
  });

  // Reception-Initiated Parent Approval correction: a `pending` request has
  // no escalation job scheduled (LeaveRepository.create() no longer enqueues
  // one) — there is genuinely nothing to estimate, exactly like a terminal
  // session.
  it("never shows a next-check estimate for a pending session — no escalation job is scheduled until Reception starts parent approval", () => {
    const updatedAt = new Date().toISOString();
    render(<SessionTimer updatedAt={updatedAt} status="pending" />);
    expect(screen.queryByText("Next automated check (estimated)")).toBeNull();
  });
});
