import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SubjectResponse } from "@/lib/types";

const mockApiClient = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "school-1", locale: "en" }),
  useSearchParams: () => new URLSearchParams(),
}));

// Cache per namespace to avoid infinite re-render (useCallback depends on translation fn)
const _tCache = new Map<string, (key: string) => string>();
const translations: Record<string, Record<string, string>> = {
  "settings.subjects": {
    addTitle: "Add Subject",
    editTitle: "Edit Subject",
    name: "Name",
    abbreviation: "Abbreviation",
    color: "Color",
    needsSpecialRoom: "Needs special room",
    namePlaceholder: "e.g. Mathematics",
    abbreviationPlaceholder: "e.g. MA",
    saved: "Saved",
    deleted: "Deleted",
    empty: "No subjects yet",
    specialRoomBadge: "Special room",
    deleteConfirm: "Delete this subject?",
    deleteConflict: "Cannot delete",
  },
  common: {
    loading: "Loading...",
    cancel: "Cancel",
    save: "Save",
    saving: "Saving...",
    remove: "Remove",
    removing: "Removing...",
    errorLoadData: "Failed to load data",
    errorSaveData: "Failed to save",
  },
  "settings.actions": { deleteTitle: "Delete" },
};
vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => {
    let fn = _tCache.get(ns);
    if (!fn) {
      fn = (k: string) => translations[ns]?.[k] ?? `${ns}.${k}`;
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

import { SubjectsTab } from "@/app/[locale]/schools/[id]/settings/components/subjects-tab";

const mockSubjects: SubjectResponse[] = [
  {
    id: "sub-1",
    name: "Mathematics",
    abbreviation: "MA",
    color: "#FF0000",
    needs_special_room: false,
  },
  {
    id: "sub-2",
    name: "Music",
    abbreviation: "MU",
    color: null,
    needs_special_room: true,
  },
];

describe("SubjectsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiClient.get.mockResolvedValue(mockSubjects);
  });

  it("renders loading state then subjects list", async () => {
    render(<SubjectsTab />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText("Mathematics")[0]).toBeInTheDocument();
    });
    expect(screen.getAllByText("Music")[0]).toBeInTheDocument();
    expect(screen.getAllByText("MA")[0]).toBeInTheDocument();
    expect(screen.getAllByText("MU")[0]).toBeInTheDocument();
    expect(screen.getAllByText("Special room")[0]).toBeInTheDocument();
  });

  it("shows empty state when no subjects exist", async () => {
    mockApiClient.get.mockResolvedValue([]);
    render(<SubjectsTab />);

    await waitFor(() => {
      expect(screen.getAllByText("No subjects yet")[0]).toBeInTheDocument();
    });
  });

  it("opens add dialog and creates a subject", async () => {
    mockApiClient.post.mockResolvedValue({});
    const user = userEvent.setup();

    render(<SubjectsTab />);
    await waitFor(() => {
      expect(screen.getAllByText("Mathematics")[0]).toBeInTheDocument();
    });

    await user.click(screen.getByText("Add Subject"));

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText("e.g. Mathematics"),
      ).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText("e.g. Mathematics"), "Science");
    await user.type(screen.getByPlaceholderText("e.g. MA"), "SC");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mockApiClient.post).toHaveBeenCalledWith(
        "/api/schools/school-1/subjects",
        expect.objectContaining({ name: "Science", abbreviation: "SC" }),
      );
    });
  });

  it("fetches subjects on mount", async () => {
    render(<SubjectsTab />);

    await waitFor(() => {
      expect(mockApiClient.get).toHaveBeenCalledWith(
        "/api/schools/school-1/subjects",
      );
    });
  });
});
