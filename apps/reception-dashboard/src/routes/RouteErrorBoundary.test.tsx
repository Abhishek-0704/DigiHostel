// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { RouteErrorBoundary } from "./RouteErrorBoundary";
import { ROUTES } from "../constants/routes";

// `useNavigate()`'s actual client-side navigation goes through
// @remix-run/router's data-router machinery, which constructs a `Request`/
// `AbortSignal` internally — in this Vitest/Node environment that hits an
// unrelated undici incompatibility unconnected to this component's own
// logic. Mocking only `useNavigate` (keeping `useRouteError`,
// `createMemoryRouter`, `RouterProvider`, `isRouteErrorResponse` all real)
// lets this test prove the CORRECT call is made without depending on that
// environment gap.
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

afterEach(cleanup);

function ThrowingPage(): never {
  throw new Error("Sensitive internal detail: connection string leaked here");
}

function renderWithThrowingRoute() {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        errorElement: <RouteErrorBoundary />,
        children: [{ index: true, element: <ThrowingPage /> }],
      },
    ],
    { initialEntries: ["/"] },
  );
  return render(<RouterProvider router={router} />);
}

describe("RouteErrorBoundary", () => {
  it("catches a route-level render error and shows a safe, generic message", () => {
    renderWithThrowingRoute();
    expect(screen.getByRole("alert").textContent).toContain("Something went wrong");
  });

  it("never renders the raw error's own message", () => {
    renderWithThrowingRoute();
    const bodyText = document.body.textContent ?? "";
    expect(bodyText).not.toContain("Sensitive internal detail");
    expect(bodyText).not.toContain("connection string");
  });

  it("offers a 'Return to Dashboard' action that navigates to the real dashboard route", () => {
    renderWithThrowingRoute();
    fireEvent.click(screen.getByRole("button", { name: "Return to Dashboard" }));
    expect(mockNavigate).toHaveBeenCalledWith(ROUTES.dashboard);
  });
});
