import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it } from "vitest";
import i18n from "@/i18n/init";
import { teacherQualsByTeacherId } from "../../../tests/msw-handlers";
import { renderWithProviders } from "../../../tests/render-helpers";
import { teacherDetailQueryKey } from "./hooks";
import { TeacherQualificationsEditor } from "./teacher-qualifications-editor";

const teacherId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

describe("TeacherQualificationsEditor", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("submits selected subjects on Save", async () => {
    teacherQualsByTeacherId[teacherId] = [];
    const user = userEvent.setup();
    renderWithProviders(<TeacherQualificationsEditor teacherId={teacherId} />);
    // Pick the only seeded subject (Mathematik).
    const add = await screen.findByRole("button", { name: /mathematik/i });
    await user.click(add);
    await user.click(screen.getByRole("button", { name: /save qualifications/i }));
    await screen.findByRole("button", { name: /remove mathematik/i });
    expect(teacherQualsByTeacherId[teacherId]).toContain("11111111-1111-1111-1111-111111111111");
  });

  it("preserves added qualifications when the detail query refetches in the background", async () => {
    teacherQualsByTeacherId[teacherId] = [];
    const user = userEvent.setup();
    const { queryClient } = renderWithProviders(
      <TeacherQualificationsEditor teacherId={teacherId} />,
    );

    // Add Mathematik to the local draft without saving.
    const add = await screen.findByRole("button", { name: /mathematik/i });
    await user.click(add);
    await screen.findByRole("button", { name: /remove mathematik/i });

    // Simulate a sibling-tab change: a different qualification set was persisted,
    // then the detail query is invalidated to trigger a background refetch.
    teacherQualsByTeacherId[teacherId] = ["22222222-2222-2222-2222-222222222222"];
    await queryClient.invalidateQueries({ queryKey: teacherDetailQueryKey(teacherId) });

    // Wait for the refetch to settle; the user's draft must still show Mathematik.
    await screen.findByRole("button", { name: /remove mathematik/i });
    expect(screen.getByRole("button", { name: /remove mathematik/i })).toBeInTheDocument();
  });
});
