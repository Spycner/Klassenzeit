import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { EntityPageHead } from "@/components/entity-page-head";
import i18n from "@/i18n/init";

describe("EntityPageHead", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("renders title as <h1> and subtitle as a paragraph", () => {
    render(
      <EntityPageHead
        title="Subjects"
        subtitle="Things you teach"
        onCreate={() => {}}
        createLabel="New subject"
      />,
    );
    expect(screen.getByRole("heading", { level: 1, name: /subjects/i })).toBeInTheDocument();
    expect(screen.getByText(/things you teach/i)).toBeInTheDocument();
  });

  it("renders the disabled Import button", () => {
    render(<EntityPageHead title="Subjects" subtitle="" onCreate={() => {}} createLabel="New" />);
    const importBtn = screen.getByRole("button", { name: /import/i });
    expect(importBtn).toBeDisabled();
  });

  it("calls onCreate when the create button is clicked", async () => {
    const onCreate = vi.fn();
    render(
      <EntityPageHead title="Subjects" subtitle="" onCreate={onCreate} createLabel="New subject" />,
    );
    await userEvent.click(screen.getByRole("button", { name: /new subject/i }));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });
});
