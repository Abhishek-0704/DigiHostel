// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PagePlaceholder } from "./PagePlaceholder";

afterEach(cleanup);

describe("PagePlaceholder", () => {
  it("renders the title and the not-yet-implemented description", () => {
    render(
      <MemoryRouter>
        <PagePlaceholder title="Leave Request Queue" description="Coming soon." />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Leave Request Queue" })).toBeTruthy();
    expect(screen.getByText("Coming soon.")).toBeTruthy();
  });

  it("renders no breadcrumb when no navId is given", () => {
    render(
      <MemoryRouter>
        <PagePlaceholder title="Untracked Page" description="Coming soon." />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).toBeNull();
  });

  it("derives a real breadcrumb trail from the centralized navigation model via navId", () => {
    render(
      <MemoryRouter>
        <PagePlaceholder
          navId="leave-queue"
          title="Leave Request Queue"
          description="Coming soon."
        />
      </MemoryRouter>,
    );
    const breadcrumb = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(breadcrumb.textContent).toContain("Dashboard");
    expect(breadcrumb.textContent).toContain("Leave Management");
    expect(breadcrumb.textContent).toContain("Leave Queue");
  });

  it("appends a dynamic label for a parameterized route without fetching business data", () => {
    render(
      <MemoryRouter>
        <PagePlaceholder
          navId="students"
          dynamicLabel="TEST-S001"
          title="Student TEST-S001"
          description="Coming soon."
        />
      </MemoryRouter>,
    );
    const breadcrumb = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(breadcrumb.textContent).toContain("Students");
    expect(breadcrumb.textContent).toContain("TEST-S001");
  });
});
