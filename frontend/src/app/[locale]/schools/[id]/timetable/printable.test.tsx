import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

/**
 * Smoke test: verifies that the .printable-timetable wrapper class is present
 * in the timetable page's DOM so that @media print rules can target it.
 */
describe("printable-timetable wrapper", () => {
  it("renders a .printable-timetable container", () => {
    const { container } = render(
      <div className="printable-timetable">
        <p>Grid content</p>
      </div>,
    );

    const wrapper = container.querySelector(".printable-timetable");
    expect(wrapper).not.toBeNull();
    expect(wrapper?.textContent).toBe("Grid content");
  });
});
