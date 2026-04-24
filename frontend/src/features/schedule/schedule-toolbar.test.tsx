import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n/init";
import { ScheduleToolbar } from "./schedule-toolbar";

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

const CLASSES = [
  {
    id: "c1",
    name: "1a",
    grade_level: 1,
    stundentafel_id: "st1",
    week_scheme_id: "ws1",
    created_at: "2026-04-17T00:00:00Z",
    updated_at: "2026-04-17T00:00:00Z",
  },
  {
    id: "c2",
    name: "2b",
    grade_level: 2,
    stundentafel_id: "st1",
    week_scheme_id: "ws1",
    created_at: "2026-04-17T00:00:00Z",
    updated_at: "2026-04-17T00:00:00Z",
  },
];

describe("ScheduleToolbar", () => {
  it("renders the Generate button and calls onGenerate when clicked with no placements", () => {
    const onGenerate = vi.fn();
    render(
      <ScheduleToolbar
        classes={CLASSES}
        classId="c1"
        onClassChange={vi.fn()}
        onGenerate={onGenerate}
        onCancelConfirm={vi.fn()}
        placementsCount={0}
        confirming={false}
        pending={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /generate schedule/i }));
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it("renders the replace banner when confirming is true", () => {
    render(
      <ScheduleToolbar
        classes={CLASSES}
        classId="c1"
        onClassChange={vi.fn()}
        onGenerate={vi.fn()}
        onCancelConfirm={vi.fn()}
        placementsCount={18}
        confirming={true}
        pending={false}
      />,
    );
    expect(screen.getByText(/will replace 18 placements/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generate anyway/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^cancel$/i })).toBeInTheDocument();
  });

  it("disables the Generate button while pending and shows the saving label", () => {
    render(
      <ScheduleToolbar
        classes={CLASSES}
        classId="c1"
        onClassChange={vi.fn()}
        onGenerate={vi.fn()}
        onCancelConfirm={vi.fn()}
        placementsCount={0}
        confirming={false}
        pending={true}
      />,
    );
    const button = screen.getByRole("button", { name: /saving/i });
    expect(button).toBeDisabled();
  });
});
