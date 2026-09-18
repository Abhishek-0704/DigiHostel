// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AccessDeniedMessage } from "./AccessDeniedMessage";

// See RequireAuth.test.tsx's identical comment — no `globals` in this
// workspace's vitest config, so Testing Library's auto-cleanup never
// self-registers.
afterEach(cleanup);

function renderDenied(message?: string) {
  return render(
    <MemoryRouter initialEntries={["/forbidden-page"]}>
      <Routes>
        <Route path="/forbidden-page" element={<AccessDeniedMessage message={message} />} />
        <Route path="/dashboard" element={<div>Dashboard Home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AccessDeniedMessage", () => {
  it("renders a semantic alert with a default, non-technical message", () => {
    renderDenied();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("You don't have permission");
  });

  it("accepts a custom message", () => {
    renderDenied("This module requires the Hostel Administrator role.");
    expect(screen.getByRole("alert").textContent).toContain("Hostel Administrator role");
  });

  it("offers a 'Return to Dashboard' recovery action that actually navigates there", () => {
    renderDenied();
    fireEvent.click(screen.getByRole("button", { name: "Return to Dashboard" }));
    expect(screen.getByText("Dashboard Home")).toBeTruthy();
  });
});
