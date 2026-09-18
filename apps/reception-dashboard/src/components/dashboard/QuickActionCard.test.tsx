// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { QuickActionCard } from "./QuickActionCard";
import { QUICK_ACTIONS } from "../../features/dashboard";

vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useNavigate: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mocked(useNavigate).mockReturnValue(mockNavigate);

afterEach(cleanup);

describe("QuickActionCard", () => {
  it("navigates to the action's route when clicked", () => {
    const action = QUICK_ACTIONS[0];
    render(
      <MemoryRouter>
        <QuickActionCard action={action} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(mockNavigate).toHaveBeenCalledWith(action.route);
  });

  it("has an accessible name combining the label and description", () => {
    const action = QUICK_ACTIONS[0];
    render(
      <MemoryRouter>
        <QuickActionCard action={action} />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("button", { name: `${action.label}: ${action.description}` }),
    ).toBeTruthy();
  });
});
