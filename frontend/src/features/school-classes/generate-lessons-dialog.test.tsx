import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n/init";
import { renderWithProviders } from "../../../tests/render-helpers";
import { GenerateLessonsConfirmDialog } from "./generate-lessons-dialog";

describe("GenerateLessonsConfirmDialog", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("calls onDone with the created lesson count on confirm", async () => {
    const onDone = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <GenerateLessonsConfirmDialog
        schoolClass={{
          id: "88888888-8888-8888-8888-888888888888",
          name: "1a",
          grade_level: 1,
          stundentafel_id: "99999999-9999-9999-9999-999999999999",
          week_scheme_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
          created_at: "2026-04-17T00:00:00Z",
          updated_at: "2026-04-17T00:00:00Z",
        }}
        onDone={onDone}
      />,
    );
    await user.click(await screen.findByRole("button", { name: /^generate$/i }));
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledWith(1));
  });
});
