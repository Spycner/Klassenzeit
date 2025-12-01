import { describe, expect, it } from "vitest";
import { render, screen } from "@/test/test-utils";

import { Home } from "./Home";

describe("Home", () => {
  it("renders the main heading", () => {
    render(<Home />);
    expect(
      screen.getByRole("heading", { name: /klassenzeit/i }),
    ).toBeInTheDocument();
  });

  it("renders the tagline", () => {
    render(<Home />);
    // German: "Stundenplaner für Schulen"
    expect(screen.getByText(/stundenplaner für schulen/i)).toBeInTheDocument();
  });

  it("renders the get started button", () => {
    render(<Home />);
    // German: "Loslegen"
    expect(screen.getByRole("link", { name: /loslegen/i })).toBeInTheDocument();
  });
});
