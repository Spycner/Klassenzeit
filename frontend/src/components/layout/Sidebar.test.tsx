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
    // German translations: Dashboard, Lehrkräfte, Fächer, Räume, Klassen, Zeitfenster, Stundenplan
    expect(
      screen.getByRole("link", { name: /dashboard/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /lehrkräfte/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /fächer/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /räume/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /klassen/i })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /zeitfenster/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /stundenplan/i }),
    ).toBeInTheDocument();
  });

  it("renders settings navigation item", () => {
    render(<Sidebar collapsed={false} onToggle={vi.fn()} />);
    // German: Einstellungen
    expect(
      screen.getByRole("link", { name: /einstellungen/i }),
    ).toBeInTheDocument();
  });

  it("calls onToggle when collapse button is clicked", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<Sidebar collapsed={false} onToggle={onToggle} />);

    const toggleButton = screen.getByRole("button", {
      name: /seitenleiste einklappen/i,
    });
    await user.click(toggleButton);

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("has accessible label for collapse button when expanded", () => {
    render(<Sidebar collapsed={false} onToggle={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /seitenleiste einklappen/i }),
    ).toBeInTheDocument();
  });

  it("has accessible label for expand button when collapsed", () => {
    render(<Sidebar collapsed={true} onToggle={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /seitenleiste ausklappen/i }),
    ).toBeInTheDocument();
  });

  it("renders correct navigation links", () => {
    render(<Sidebar collapsed={false} onToggle={vi.fn()} />);

    // Links now have language prefix /de/
    expect(screen.getByRole("link", { name: /dashboard/i })).toHaveAttribute(
      "href",
      "/de/dashboard",
    );
    expect(screen.getByRole("link", { name: /lehrkräfte/i })).toHaveAttribute(
      "href",
      "/de/teachers",
    );
    expect(
      screen.getByRole("link", { name: /einstellungen/i }),
    ).toHaveAttribute("href", "/de/settings");
  });
});
