import { LayoutDashboard } from "lucide-react";
import { describe, expect, it } from "vitest";
// Wrap NavItem with TooltipProvider since it uses Tooltip
import { TooltipProvider } from "@/components/ui/tooltip";
import { render, screen } from "@/test/test-utils";
import { NavItem } from "./NavItem";

function renderNavItem(props: {
  to: string;
  label: string;
  collapsed?: boolean;
}) {
  return render(
    <TooltipProvider>
      <NavItem icon={LayoutDashboard} {...props} />
    </TooltipProvider>,
  );
}

describe("NavItem", () => {
  it("renders link with correct href", () => {
    renderNavItem({ to: "/dashboard", label: "Dashboard" });
    expect(screen.getByRole("link")).toHaveAttribute("href", "/dashboard");
  });

  it("renders label when not collapsed", () => {
    renderNavItem({ to: "/dashboard", label: "Dashboard", collapsed: false });
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it("hides label when collapsed", () => {
    renderNavItem({ to: "/dashboard", label: "Dashboard", collapsed: true });
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
  });

  it("shows active state when route matches", () => {
    render(
      <TooltipProvider>
        <NavItem icon={LayoutDashboard} to="/dashboard" label="Dashboard" />
      </TooltipProvider>,
      { initialEntries: ["/dashboard"] },
    );

    const button = screen.getByRole("button");
    expect(button).toHaveClass("bg-secondary");
  });

  it("shows inactive state when route does not match", () => {
    render(
      <TooltipProvider>
        <NavItem icon={LayoutDashboard} to="/dashboard" label="Dashboard" />
      </TooltipProvider>,
      { initialEntries: ["/teachers"] },
    );

    const button = screen.getByRole("button");
    expect(button).not.toHaveClass("bg-secondary");
  });
});
