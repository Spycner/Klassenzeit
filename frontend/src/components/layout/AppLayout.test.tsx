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
    // German translations: Dashboard, Lehrkräfte, Fächer, Räume, Klassen, Zeitfenster, Stundenplan, Einstellungen
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
    expect(
      screen.getByRole("link", { name: /einstellungen/i }),
    ).toBeInTheDocument();
  });
});
