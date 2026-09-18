// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { ReportFieldSelector } from "./ReportFieldSelector";

afterEach(cleanup);

const FIELDS = [
  { id: "a", label: "Field A" },
  { id: "b", label: "Field B" },
];

describe("ReportFieldSelector", () => {
  it("renders nothing when the report has no selectable fields", () => {
    const { container } = render(
      <ReportFieldSelector availableFields={[]} selectedFields={[]} onChange={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("an empty selection shows every field as checked (the server's own default)", () => {
    render(
      <ReportFieldSelector availableFields={FIELDS} selectedFields={[]} onChange={() => {}} />,
    );
    expect((screen.getByLabelText("Field A") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Field B") as HTMLInputElement).checked).toBe(true);
  });

  it("unchecking one field while the selection is implicitly 'all' materializes the remaining field, not an empty list", () => {
    const onChange = vi.fn();
    render(
      <ReportFieldSelector availableFields={FIELDS} selectedFields={[]} onChange={onChange} />,
    );
    fireEvent.click(screen.getByLabelText("Field A"));
    expect(onChange).toHaveBeenCalledWith(["b"]);
  });

  it("checking a field back on, from an explicit partial selection, adds it", () => {
    const onChange = vi.fn();
    render(
      <ReportFieldSelector availableFields={FIELDS} selectedFields={["b"]} onChange={onChange} />,
    );
    fireEvent.click(screen.getByLabelText("Field A"));
    expect(onChange).toHaveBeenCalledWith(["b", "a"]);
  });
});
