import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
const _tCache = new Map<string, ReturnType<typeof makeT>>();

function makeT(ns: string) {
  const fn = (k: string, params?: Record<string, string>) => {
    if (params && params.name !== undefined) {
      return `${ns}.${k}(${params.name})`;
    }
    return `${ns}.${k}`;
  };
  fn.raw = (k: string) => {
    if (ns === "settings.rooms" && k === "dayNames") {
      return ["Mon", "Tue", "Wed", "Thu", "Fri"];
    }
    return `${ns}.${k}`;
  };
  return fn;
}

vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => {
    let fn = _tCache.get(ns);
    if (!fn) {
      fn = makeT(ns);
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

import { TeacherAvailabilityDialog } from "@/app/[locale]/schools/[id]/settings/components/teacher-availability-dialog";
import type { TeacherResponse, TimeSlotResponse } from "@/lib/types";

const TEACHER: TeacherResponse = {
  id: "teacher-1",
  first_name: "Anna",
  last_name: "Schmidt",
  email: null,
  abbreviation: "SCH",
  max_hours_per_week: 28,
  is_part_time: false,
  is_active: true,
};

const TIMESLOTS: TimeSlotResponse[] = [
  {
    id: "ts-1",
    day_of_week: 0,
    period: 1,
    start_time: "08:00",
    end_time: "08:45",
    is_break: false,
    label: null,
  },
  {
    id: "ts-2",
    day_of_week: 0,
    period: 2,
    start_time: "08:50",
    end_time: "09:35",
    is_break: false,
    label: null,
  },
  {
    id: "ts-3",
    day_of_week: 1,
    period: 1,
    start_time: "08:00",
    end_time: "08:45",
    is_break: false,
    label: null,
  },
];

describe("TeacherAvailabilityDialog", () => {
  beforeEach(() => {
    mockApiClient.get.mockReset();
    mockApiClient.put.mockReset();
    _tCache.clear();
  });

  it("renders cells with no state when GET returns []", async () => {
    mockApiClient.get.mockResolvedValue([]);

    render(
      <TeacherAvailabilityDialog
        teacher={TEACHER}
        timeslots={TIMESLOTS}
        open={true}
        onOpenChange={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("cell-0-1")).toBeInTheDocument();
    });
    expect(screen.getByTestId("cell-0-1").textContent).toBe("");
  });

  it("clicking a cell cycles available → preferred → blocked → available", async () => {
    mockApiClient.get.mockResolvedValue([]);

    render(
      <TeacherAvailabilityDialog
        teacher={TEACHER}
        timeslots={TIMESLOTS}
        open={true}
        onOpenChange={() => {}}
      />,
    );

    await waitFor(() => screen.getByTestId("cell-0-1"));
    const cell = screen.getByTestId("cell-0-1");

    fireEvent.click(cell);
    expect(cell.textContent).toBe("P");

    fireEvent.click(cell);
    expect(cell.textContent).toBe("B");

    fireEvent.click(cell);
    expect(cell.textContent).toBe("");
  });

  it("Save issues PUT with only non-available cells", async () => {
    mockApiClient.get.mockResolvedValue([]);
    mockApiClient.put.mockResolvedValue(undefined);

    render(
      <TeacherAvailabilityDialog
        teacher={TEACHER}
        timeslots={TIMESLOTS}
        open={true}
        onOpenChange={() => {}}
      />,
    );

    await waitFor(() => screen.getByTestId("cell-0-1"));

    // Set cell (0,1) to preferred (one click)
    fireEvent.click(screen.getByTestId("cell-0-1"));
    // Set cell (1,1) to blocked (two clicks)
    fireEvent.click(screen.getByTestId("cell-1-1"));
    fireEvent.click(screen.getByTestId("cell-1-1"));

    fireEvent.click(
      screen.getByRole("button", {
        name: "settings.teachers.availability.save",
      }),
    );

    await waitFor(() => {
      expect(mockApiClient.put).toHaveBeenCalledWith(
        "/api/schools/school-1/teachers/teacher-1/availabilities",
        expect.arrayContaining([
          expect.objectContaining({
            day_of_week: 0,
            period: 1,
            availability_type: "preferred",
          }),
          expect.objectContaining({
            day_of_week: 1,
            period: 1,
            availability_type: "blocked",
          }),
        ]),
      );
    });

    const call = mockApiClient.put.mock.calls[0];
    const body = call[1] as Array<{ day_of_week: number; period: number }>;
    // Cell (0,2) was never touched → should be absent
    expect(body.some((e) => e.day_of_week === 0 && e.period === 2)).toBe(false);
  });

  it("Cancel closes the dialog without calling PUT", async () => {
    mockApiClient.get.mockResolvedValue([]);
    const onOpenChange = vi.fn();

    render(
      <TeacherAvailabilityDialog
        teacher={TEACHER}
        timeslots={TIMESLOTS}
        open={true}
        onOpenChange={onOpenChange}
      />,
    );

    await waitFor(() => screen.getByTestId("cell-0-1"));

    fireEvent.click(
      screen.getByRole("button", {
        name: "settings.teachers.availability.cancel",
      }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mockApiClient.put).not.toHaveBeenCalled();
  });
});
