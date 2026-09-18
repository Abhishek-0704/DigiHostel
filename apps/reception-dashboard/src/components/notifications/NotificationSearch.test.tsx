// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NotificationSearch } from "./NotificationSearch";

afterEach(cleanup);

describe("NotificationSearch", () => {
  it("has a real, non-visually-implicit label", () => {
    render(<NotificationSearch value="" onChange={vi.fn()} />);
    expect(screen.getByLabelText("Search notifications")).toBeTruthy();
  });

  it("reports changes as they're typed", () => {
    const onChange = vi.fn();
    render(<NotificationSearch value="" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Search notifications"), { target: { value: "leave" } });
    expect(onChange).toHaveBeenCalledWith("leave");
  });
});
