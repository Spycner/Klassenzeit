import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { OnboardingProgress } from "@/hooks/use-onboarding-progress";

vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => (key: string) => `${ns}.${key}`,
  useLocale: () => "en",
}));

import { ChecklistCard } from "@/components/onboarding/checklist-card";

function makeProgress(
  overrides: Partial<OnboardingProgress["steps"]> = {},
): OnboardingProgress {
  const base: OnboardingProgress["steps"] = {
    term: { done: false, count: 0 },
    classes: { done: false, count: 0 },
    subjects: { done: false, count: 0 },
    teachers: { done: false, count: 0 },
    rooms: { done: false, count: 0 },
    timeslots: { done: false, count: 0 },
    curriculum: { done: false, count: 0 },
  };
  const steps = { ...base, ...overrides };
  const allComplete = Object.values(steps).every((s) => s.done);
  const isEmpty = Object.values(steps).every((s) => s.count === 0);
  const ids = [
    "term",
    "classes",
    "subjects",
    "teachers",
    "rooms",
    "timeslots",
    "curriculum",
  ] as const;
  const firstIncomplete =
    (ids.find((id) => !steps[id].done) as (typeof ids)[number] | undefined) ??
    null;
  return {
    loading: false,
    error: null,
    steps,
    allComplete,
    isEmpty,
    firstIncomplete,
    refetch: async () => {},
  };
}

describe("ChecklistCard", () => {
  it("renders all seven step rows when incomplete", () => {
    render(
      <ChecklistCard
        schoolId="s1"
        progress={makeProgress()}
        onResume={() => {}}
      />,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(7);
  });

  it("returns null when allComplete", () => {
    const allDone = makeProgress({
      term: { done: true, count: 1 },
      classes: { done: true, count: 1 },
      subjects: { done: true, count: 1 },
      teachers: { done: true, count: 1 },
      rooms: { done: true, count: 1 },
      timeslots: { done: true, count: 1 },
      curriculum: { done: true, count: 1 },
    });
    const { container } = render(
      <ChecklistCard schoolId="s1" progress={allDone} onResume={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("calls onResume when the resume button is clicked", async () => {
    const onResume = vi.fn();
    render(
      <ChecklistCard
        schoolId="s1"
        progress={makeProgress()}
        onResume={onResume}
      />,
    );
    const resume = screen
      .getAllByRole("button")
      .find((b) => b.textContent?.includes("checklist.resume"));
    if (!resume) throw new Error("resume button not found");
    resume.click();
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it("renders a deep-link per step with locale prefix", () => {
    render(
      <ChecklistCard
        schoolId="school-42"
        progress={makeProgress()}
        onResume={() => {}}
      />,
    );
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(7);
    expect(links[0].getAttribute("href")).toBe(
      "/en/schools/school-42/settings?tab=terms",
    );
    expect(links[6].getAttribute("href")).toBe(
      "/en/schools/school-42/curriculum",
    );
  });
});
