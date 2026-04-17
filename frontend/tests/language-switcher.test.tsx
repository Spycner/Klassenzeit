import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { LanguageSwitcher } from "@/components/language-switcher";
import i18n from "@/i18n/init";

describe("LanguageSwitcher", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("de");
  });

  it("renders the opposite locale code as the label", () => {
    render(<LanguageSwitcher />);
    expect(screen.getByRole("button", { name: /en/i })).toBeInTheDocument();
  });

  it("flips the active language on click", async () => {
    const user = userEvent.setup();
    render(<LanguageSwitcher />);

    await user.click(screen.getByRole("button", { name: /en/i }));
    expect(i18n.language.startsWith("en")).toBe(true);
    expect(screen.getByRole("button", { name: /de/i })).toBeInTheDocument();

    await act(async () => {
      await i18n.changeLanguage("de");
    });
  });
});
