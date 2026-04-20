import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import "@/i18n/init";
import { ColorPicker } from "./color-picker";

describe("ColorPicker", () => {
  test("renders 12 palette swatches", () => {
    render(<ColorPicker value="chart-1" onChange={vi.fn()} />);
    const swatches = screen.getAllByRole("button", { name: /chart-\d+/ });
    expect(swatches).toHaveLength(12);
  });

  test("clicking a swatch calls onChange with the token", async () => {
    const onChange = vi.fn();
    render(<ColorPicker value="chart-1" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "chart-5" }));
    expect(onChange).toHaveBeenCalledWith("chart-5");
  });

  test("entering a valid hex calls onChange with the hex value", async () => {
    const onChange = vi.fn();
    render(<ColorPicker value="chart-1" onChange={onChange} />);
    const input = screen.getByRole("textbox", { name: /custom hex/i });
    await userEvent.clear(input);
    await userEvent.type(input, "#abcdef");
    expect(onChange).toHaveBeenLastCalledWith("#abcdef");
  });

  test("entering an invalid hex does not call onChange", async () => {
    const onChange = vi.fn();
    render(<ColorPicker value="chart-1" onChange={onChange} />);
    const input = screen.getByRole("textbox", { name: /custom hex/i });
    await userEvent.clear(input);
    await userEvent.type(input, "nope");
    expect(onChange).not.toHaveBeenCalled();
  });

  test("marks the selected swatch with aria-pressed=true", () => {
    render(<ColorPicker value="chart-7" onChange={vi.fn()} />);
    const selected = screen.getByRole("button", { name: "chart-7" });
    expect(selected).toHaveAttribute("aria-pressed", "true");
    const unselected = screen.getByRole("button", { name: "chart-1" });
    expect(unselected).toHaveAttribute("aria-pressed", "false");
  });
});
