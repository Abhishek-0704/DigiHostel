// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SessionResultBanner } from "./SessionResultBanner";

afterEach(cleanup);

describe("SessionResultBanner", () => {
  it("renders nothing for a non-terminal status", () => {
    const { container } = render(<SessionResultBanner status="father_notified" />);
    expect(container.firstChild).toBeNull();
  });

  it("announces approval as an accessible live region, never color-only", () => {
    render(<SessionResultBanner status="approved" />);
    const banner = screen.getByRole("status");
    expect(banner.getAttribute("aria-live")).toBe("polite");
    expect(screen.getByText("Session approved")).toBeTruthy();
  });

  it("announces rejection", () => {
    render(<SessionResultBanner status="rejected" />);
    expect(screen.getByText("Session rejected")).toBeTruthy();
  });

  it("announces expiry", () => {
    render(<SessionResultBanner status="expired" />);
    expect(screen.getByText("Session expired")).toBeTruthy();
  });
});
