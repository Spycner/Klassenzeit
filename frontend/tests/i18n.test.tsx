import { act, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import i18n from "@/i18n/init";

function Probe() {
  // Read a known key under a feature namespace to exercise both de and en resources.
  return <p>{i18n.t("subjects.title")}</p>;
}

describe("i18n", () => {
  beforeAll(async () => {
    // Force a known starting language so detector results don't bleed across tests.
    await i18n.changeLanguage("de");
  });

  it("renders German by default", () => {
    render(<Probe />);
    expect(screen.getByText("Fächer")).toBeInTheDocument();
  });

  it("updates rendered text when the language changes", async () => {
    const { rerender } = render(<Probe />);
    await act(async () => {
      await i18n.changeLanguage("en");
    });
    rerender(<Probe />);
    expect(screen.getByText("Subjects")).toBeInTheDocument();

    await act(async () => {
      await i18n.changeLanguage("de");
    });
    rerender(<Probe />);
    expect(screen.getByText("Fächer")).toBeInTheDocument();
  });
});
