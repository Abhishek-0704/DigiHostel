// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import NotFoundPage from "./NotFoundPage";

afterEach(cleanup);

function renderAtUnknownRoute() {
  return render(
    <MemoryRouter initialEntries={["/this-route-does-not-exist"]}>
      <Routes>
        <Route path="/dashboard" element={<div>Dashboard Home</div>} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("NotFoundPage", () => {
  it("renders a clear, non-technical not-found message", () => {
    renderAtUnknownRoute();
    expect(screen.getByText("We couldn't find that page")).toBeTruthy();
  });

  it("never reveals whether a resource with this identifier might exist elsewhere", () => {
    renderAtUnknownRoute();
    const bodyText = document.body.textContent ?? "";
    expect(bodyText).not.toMatch(/this-route-does-not-exist/);
  });

  it("offers a real 'Return to Dashboard' action that navigates there", () => {
    renderAtUnknownRoute();
    fireEvent.click(screen.getByRole("button", { name: "Return to Dashboard" }));
    expect(screen.getByText("Dashboard Home")).toBeTruthy();
  });
});
