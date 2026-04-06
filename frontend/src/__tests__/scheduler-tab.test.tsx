import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONSTRAINT_WEIGHTS } from "@/lib/types";

const mockApiClient = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "school-1", locale: "en" }),
}));

// Cache per namespace to avoid infinite re-render (useCallback depends on translation fn)
const _tCache = new Map<string, (key: string) => string>();
vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => {
    let fn = _tCache.get(ns);
    if (!fn) {
      fn = (k: string) => `${ns}.${k}`;
      _tCache.set(ns, fn);
    }
    return fn;
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/hooks/use-api-client", () => ({
  useApiClient: () => mockApiClient,
}));

import { SchedulerTab } from "@/app/[locale]/schools/[id]/settings/components/scheduler-tab";

describe("SchedulerTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _tCache.clear();
    mockApiClient.get.mockResolvedValue({
      weights: DEFAULT_CONSTRAINT_WEIGHTS,
    });
    mockApiClient.put.mockResolvedValue({
      weights: DEFAULT_CONSTRAINT_WEIGHTS,
    });
  });

  it("renders defaults on load", async () => {
    render(<SchedulerTab />);

    await waitFor(() => {
      expect(screen.getByTestId("scheduler-tab")).toBeInTheDocument();
    });

    // w_preferred_slot default is 1
    const preferredSlotInput = screen.getByTestId(
      "soft-w_preferred_slot",
    ) as HTMLInputElement;
    expect(preferredSlotInput.value).toBe("1");

    // w_subject_distribution default is 2
    const subjectDistInput = screen.getByTestId(
      "soft-w_subject_distribution",
    ) as HTMLInputElement;
    expect(subjectDistInput.value).toBe("2");
  });

  it("save sends PUT with current weights", async () => {
    const user = userEvent.setup();
    render(<SchedulerTab />);

    await waitFor(() => {
      expect(screen.getByTestId("scheduler-tab")).toBeInTheDocument();
    });

    // Change w_teacher_gap to 5
    const teacherGapInput = screen.getByTestId("soft-w_teacher_gap");
    await user.clear(teacherGapInput);
    await user.type(teacherGapInput, "5");

    // Click Save button
    await user.click(
      screen.getByRole("button", {
        name: "settings.scheduler.save",
      }),
    );

    await waitFor(() => {
      expect(mockApiClient.put).toHaveBeenCalledWith(
        "/api/schools/school-1/scheduler-settings",
        expect.objectContaining({ w_teacher_gap: 5 }),
      );
    });
  });

  it("toggling 'allow with penalty' enables the penalty input", async () => {
    const user = userEvent.setup();
    render(<SchedulerTab />);

    await waitFor(() => {
      expect(screen.getByTestId("scheduler-tab")).toBeInTheDocument();
    });

    const penaltyInput = screen.getByTestId(
      "penalty-soften_teacher_max_hours",
    ) as HTMLInputElement;

    // Initially strict (null) so penalty input is disabled
    expect(penaltyInput).toBeDisabled();

    // Click the "allow with penalty" radio for soften_teacher_max_hours via its DOM id
    const allowInput = document.getElementById(
      "soften_teacher_max_hours-allow",
    ) as HTMLElement;
    await user.click(allowInput);

    // Penalty input should now be enabled
    expect(penaltyInput).toBeEnabled();
  });
});
