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
  fn.raw = (k: string) => `${ns}.${k}`;
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

import { RoomSuitabilityDialog } from "@/app/[locale]/schools/[id]/settings/components/room-suitability-dialog";
import type { RoomResponse, SubjectResponse } from "@/lib/types";

const ROOM: RoomResponse = {
  id: "room-1",
  name: "Gym",
  building: null,
  capacity: null,
  max_concurrent: 1,
  is_active: true,
};

const SUBJECTS: SubjectResponse[] = [
  {
    id: "subj-1",
    name: "Math",
    abbreviation: "MA",
    color: null,
    needs_special_room: false,
  },
  {
    id: "subj-2",
    name: "Biology",
    abbreviation: "BIO",
    color: null,
    needs_special_room: false,
  },
];

describe("RoomSuitabilityDialog", () => {
  beforeEach(() => {
    mockApiClient.get.mockReset();
    mockApiClient.put.mockReset();
    _tCache.clear();
  });

  it("renders subject list and pre-checks fetched suitabilities", async () => {
    mockApiClient.get.mockResolvedValue([{ subject_id: "subj-2" }]);

    render(
      <RoomSuitabilityDialog
        room={ROOM}
        subjects={SUBJECTS}
        open={true}
        onOpenChange={() => {}}
      />,
    );

    await waitFor(() => {
      const subj2 = screen.getByTestId("subject-subj-2");
      expect(subj2.getAttribute("data-state")).toBe("checked");
    });

    const subj1 = screen.getByTestId("subject-subj-1");
    expect(subj1.getAttribute("data-state")).toBe("unchecked");
  });

  it("toggling a checkbox and Save sends selection", async () => {
    mockApiClient.get.mockResolvedValue([]);
    mockApiClient.put.mockResolvedValue(undefined);

    render(
      <RoomSuitabilityDialog
        room={ROOM}
        subjects={SUBJECTS}
        open={true}
        onOpenChange={() => {}}
      />,
    );

    await waitFor(() => screen.getByTestId("subject-subj-1"));

    fireEvent.click(screen.getByTestId("subject-subj-1"));
    fireEvent.click(
      screen.getByRole("button", {
        name: "settings.rooms.suitability.save",
      }),
    );

    await waitFor(() => {
      expect(mockApiClient.put).toHaveBeenCalledWith(
        "/api/schools/school-1/rooms/room-1/suitabilities",
        { subject_ids: ["subj-1"] },
      );
    });
  });
});
