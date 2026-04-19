import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { LanguageSwitcher } from "@/components/language-switcher";
import i18n from "@/i18n/init";

describe("LanguageSwitcher", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("de");
  });

  it("renders a button per locale", () => {
    render(<LanguageSwitcher />);
    expect(screen.getByRole("button", { name: /en/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /de/i })).toBeInTheDocument();
  });

  it("marks the active locale with aria-pressed", () => {
    render(<LanguageSwitcher />);
    expect(screen.getByRole("button", { name: /de/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /en/i })).toHaveAttribute("aria-pressed", "false");
  });

  it("flips the active language on click", async () => {
    const user = userEvent.setup();
    render(<LanguageSwitcher />);

    await user.click(screen.getByRole("button", { name: /en/i }));
    expect(i18n.language.startsWith("en")).toBe(true);
    expect(screen.getByRole("button", { name: /en/i })).toHaveAttribute("aria-pressed", "true");

    await act(async () => {
      await i18n.changeLanguage("de");
    });
  });
});
