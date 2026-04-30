import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import type { Lesson } from "@/features/lessons/hooks";
import i18n from "@/i18n/init";
import { initialSchoolClasses, server } from "../../../tests/msw-handlers";
import { LessonFormDialog } from "./lessons-dialogs";

const SECOND_CLASS_ID = "88888888-8888-8888-8888-888888888889";
const BASE = "http://localhost:3000";

function wrapLessonDialog(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function seedTwoClasses() {
  server.use(
    http.get(`${BASE}/api/classes`, () =>
      HttpResponse.json([
        ...initialSchoolClasses,
        {
          id: SECOND_CLASS_ID,
          name: "1b",
          grade_level: 1,
          stundentafel_id: "99999999-9999-9999-9999-999999999999",
          week_scheme_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
          created_at: "2026-04-17T00:00:00Z",
          updated_at: "2026-04-17T00:00:00Z",
        },
      ]),
    ),
  );
}

describe("LessonFormDialog multi-class selection", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    seedTwoClasses();
  });

  afterAll(() => {
    server.resetHandlers();
  });

  test("renders a checkbox per available school class", async () => {
    render(
      wrapLessonDialog(<LessonFormDialog open onOpenChange={() => {}} submitLabel="Create" />),
    );
    await screen.findByRole("checkbox", { name: /^1a$/i });
    await screen.findByRole("checkbox", { name: /^1b$/i });
  });

  test("rejects submit when no class selected", async () => {
    const user = userEvent.setup();
    render(
      wrapLessonDialog(<LessonFormDialog open onOpenChange={() => {}} submitLabel="Create" />),
    );
    // Wait for class checkboxes to mount before submitting.
    await screen.findByRole("checkbox", { name: /^1a$/i });
    await user.click(screen.getByRole("button", { name: /^create$/i }));
    expect(await screen.findByText(/at least one class/i)).toBeVisible();
  });

  test("seeds checkbox state from lesson.school_classes", async () => {
    const lesson: Lesson = {
      id: "55555555-5555-5555-5555-555555555555",
      school_classes: [{ id: "88888888-8888-8888-8888-888888888888", name: "1a" }],
      subject: {
        id: "11111111-1111-1111-1111-111111111111",
        name: "Mathematik",
        short_name: "MA",
      },
      teacher: null,
      hours_per_week: 4,
      preferred_block_size: 1,
      lesson_group_id: null,
      created_at: "2026-04-20T00:00:00Z",
      updated_at: "2026-04-20T00:00:00Z",
    };
    render(
      wrapLessonDialog(
        <LessonFormDialog open onOpenChange={() => {}} submitLabel="Save" lesson={lesson} />,
      ),
    );
    const cb = await screen.findByRole("checkbox", { name: /^1a$/i });
    expect(cb).toBeChecked();
    const cbB = await screen.findByRole("checkbox", { name: /^1b$/i });
    expect(cbB).not.toBeChecked();
  });
});
