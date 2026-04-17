import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";

describe("ThemeToggle", () => {
  it("toggles the dark class on <html> when clicked", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );

    const button = await screen.findByRole("button", { name: /toggle theme/i });

    const wasDark = document.documentElement.classList.contains("dark");
    await user.click(button);
    expect(document.documentElement.classList.contains("dark")).toBe(!wasDark);

    await user.click(button);
    expect(document.documentElement.classList.contains("dark")).toBe(wasDark);
  });
});
