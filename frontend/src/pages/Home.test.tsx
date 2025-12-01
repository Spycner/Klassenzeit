import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
    expect(screen.getByText(/timetabler for schools/i)).toBeInTheDocument();
  });

  it("renders the get started button", () => {
    render(<Home />);
    expect(
      screen.getByRole("button", { name: /get started/i }),
    ).toBeInTheDocument();
  });
});
