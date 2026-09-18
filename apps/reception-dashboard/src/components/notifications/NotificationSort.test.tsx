// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NotificationSort } from "./NotificationSort";

afterEach(cleanup);

describe("NotificationSort", () => {
  it("defaults to reflecting the current sort order", () => {
    render(<NotificationSort value="newest" onChange={vi.fn()} />);
    expect((screen.getByLabelText("Sort") as HTMLSelectElement).value).toBe("newest");
  });

  it("reports the new order on change", () => {
    const onChange = vi.fn();
    render(<NotificationSort value="newest" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Sort"), { target: { value: "priority" } });
    expect(onChange).toHaveBeenCalledWith("priority");
  });
});
