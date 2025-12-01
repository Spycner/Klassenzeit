import { describe, expect, it } from "vitest";
import { render, screen } from "@/test/test-utils";

import { AppLayout } from "./AppLayout";

describe("AppLayout", () => {
  it("renders sidebar on desktop", () => {
    render(<AppLayout />);
    // App name appears in both sidebar and mobile header
    const appNames = screen.getAllByText("Klassenzeit");
    expect(appNames.length).toBeGreaterThanOrEqual(1);
  });

  it("renders main content area with outlet", () => {
    render(<AppLayout />);
    // Main element exists
    expect(screen.getByRole("main")).toBeInTheDocument();
  });

  it("renders navigation items", () => {
    render(<AppLayout />);
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
    expect(screen.getByRole("link", { name: /settings/i })).toBeInTheDocument();
  });
});
