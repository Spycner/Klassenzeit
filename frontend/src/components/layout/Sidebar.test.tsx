import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test/test-utils";

import { Sidebar } from "./Sidebar";

describe("Sidebar", () => {
  it("renders app name when expanded", () => {
    render(<Sidebar collapsed={false} onToggle={vi.fn()} />);
    expect(screen.getByText("Klassenzeit")).toBeInTheDocument();
  });

  it("hides app name when collapsed", () => {
    render(<Sidebar collapsed={true} onToggle={vi.fn()} />);
    expect(screen.queryByText("Klassenzeit")).not.toBeInTheDocument();
  });

  it("renders all main navigation items", () => {
    render(<Sidebar collapsed={false} onToggle={vi.fn()} />);
    expect(
      screen.getByRole("link", { name: /dashboard/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /teachers/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /subjects/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /rooms/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /classes/i })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /time slots/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /timetable/i }),
    ).toBeInTheDocument();
  });

  it("renders settings navigation item", () => {
    render(<Sidebar collapsed={false} onToggle={vi.fn()} />);
    expect(screen.getByRole("link", { name: /settings/i })).toBeInTheDocument();
  });

  it("calls onToggle when collapse button is clicked", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<Sidebar collapsed={false} onToggle={onToggle} />);

    // The collapse button is the first button (not inside a link)
    const buttons = screen.getAllByRole("button");
    // Filter to find the toggle button - it's the one not inside a nav link
    const toggleButton = buttons.find(
      (btn) => !btn.closest("a") && btn.closest(".border-b"),
    );
    expect(toggleButton).toBeDefined();
    await user.click(toggleButton!);

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("renders correct navigation links", () => {
    render(<Sidebar collapsed={false} onToggle={vi.fn()} />);

    expect(screen.getByRole("link", { name: /dashboard/i })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    expect(screen.getByRole("link", { name: /teachers/i })).toHaveAttribute(
      "href",
      "/teachers",
    );
    expect(screen.getByRole("link", { name: /settings/i })).toHaveAttribute(
      "href",
      "/settings",
    );
  });
});
