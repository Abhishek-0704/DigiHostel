// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ContentLayout } from "./ContentLayout";

afterEach(cleanup);

describe("ContentLayout — the shell's page-template primitive", () => {
  it("renders title, description, and children together", () => {
    render(
      <ContentLayout title="Leave Queue" description="Pending decisions across your hostel.">
        <div>Real Content</div>
      </ContentLayout>,
    );
    expect(screen.getByRole("heading", { name: "Leave Queue" })).toBeTruthy();
    expect(screen.getByText("Pending decisions across your hostel.")).toBeTruthy();
    expect(screen.getByText("Real Content")).toBeTruthy();
  });

  it("renders a breadcrumb trail when given segments", () => {
    render(
      <MemoryRouter>
        <ContentLayout
          title="Leave Queue"
          breadcrumb={[{ label: "Dashboard", to: "/dashboard" }, { label: "Leave Queue" }]}
        >
          <div>Content</div>
        </ContentLayout>
      </MemoryRouter>,
    );
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeTruthy();
  });

  it("renders the actions region when provided", () => {
    render(
      <ContentLayout title="Leave Queue" actions={<button type="button">New Request</button>}>
        <div>Content</div>
      </ContentLayout>,
    );
    expect(screen.getByRole("button", { name: "New Request" })).toBeTruthy();
  });

  it("shows a loading indicator instead of children when loading — page identity stays visible", () => {
    render(
      <ContentLayout title="Leave Queue" loading loadingLabel="Loading requests…">
        <div>Real Content</div>
      </ContentLayout>,
    );
    expect(screen.getByRole("heading", { name: "Leave Queue" })).toBeTruthy();
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.queryByText("Real Content")).toBeNull();
  });

  it("shows an error state with retry instead of children when an error is given", () => {
    const onRetry = vi.fn();
    render(
      <ContentLayout title="Leave Queue" error={{ message: "Could not load requests.", onRetry }}>
        <div>Real Content</div>
      </ContentLayout>,
    );
    expect(screen.getByRole("alert").textContent).toContain("Could not load requests.");
    expect(screen.queryByText("Real Content")).toBeNull();
  });
});
