// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { NavItem } from "./NavItem";
import { DashboardIcon } from "../icons";

afterEach(cleanup);

function renderAt(path: string, to: string, collapsed = false) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/a"
          element={<NavItem to={to} label="Dashboard" icon={DashboardIcon} collapsed={collapsed} />}
        />
        <Route
          path="/b"
          element={<NavItem to={to} label="Dashboard" icon={DashboardIcon} collapsed={collapsed} />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("NavItem", () => {
  it("has a real, non-empty accessible name when expanded", () => {
    renderAt("/a", "/a");
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeTruthy();
  });

  it("still has a real, non-empty accessible name when collapsed (the fixed defect)", () => {
    renderAt("/a", "/a", true);
    // The label survives as visually-hidden text, so the accessible name
    // is still "Dashboard" — not blank, not icon-only.
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeTruthy();
  });

  it("exposes a title attribute (hover tooltip) only when collapsed", () => {
    const { rerender } = render(
      <MemoryRouter initialEntries={["/a"]}>
        <NavItem to="/a" label="Dashboard" icon={DashboardIcon} collapsed={false} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link").getAttribute("title")).toBeNull();

    rerender(
      <MemoryRouter initialEntries={["/a"]}>
        <NavItem to="/a" label="Dashboard" icon={DashboardIcon} collapsed={true} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link").getAttribute("title")).toBe("Dashboard");
  });

  it("marks the active route with aria-current=page, not merely a CSS class", () => {
    renderAt("/a", "/a");
    expect(screen.getByRole("link").getAttribute("aria-current")).toBe("page");
  });

  it("does not mark an inactive route as current", () => {
    renderAt("/b", "/a");
    expect(screen.getByRole("link").getAttribute("aria-current")).toBeNull();
  });
});
