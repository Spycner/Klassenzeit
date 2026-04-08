import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CurriculumEntryResponse,
  SchoolClassResponse,
  SubjectResponse,
  TeacherResponse,
  TermResponse,
} from "@/lib/types";

const mockApiClient = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "school-1", locale: "en" }),
}));

const _tCache = new Map<string, (key: string) => string>();
const translations: Record<string, Record<string, string>> = {
  curriculum: {
    title: "Curriculum",
    description: "Manage curriculum entries",
    class: "Class",
    subject: "Subject",
    teacher: "Teacher",
    hoursPerWeek: "Hours/Week",
    addClass: "Add Entry",
    autoAssign: "Auto-assign",
    noEntries: "No curriculum entries",
    saved: "Saved",
    deleted: "Deleted",
    deleteConfirm: "Delete this entry?",
    selectClass: "Select class",
    selectSubject: "Select subject",
    selectTeacher: "Select teacher",
  },
  common: {
    loading: "Loading...",
    cancel: "Cancel",
    save: "Save",
    saving: "Saving...",
    errorGeneric: "Something went wrong",
  },
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

import CurriculumPage from "@/app/[locale]/schools/[id]/curriculum/page";

const mockTerms: TermResponse[] = [
  {
    id: "term-1",
    school_year_id: "sy-1",
    name: "Semester 1",
    start_date: "2025-08-01",
    end_date: "2026-01-31",
    is_current: true,
  },
];

const mockClasses: SchoolClassResponse[] = [
  {
    id: "class-1",
    name: "1a",
    grade_level: 1,
    student_count: 25,
    class_teacher_id: null,
    is_active: true,
  },
];

const mockSubjects: SubjectResponse[] = [
  {
    id: "sub-1",
    name: "Mathematics",
    abbreviation: "MA",
    color: null,
    needs_special_room: false,
  },
];

const mockTeachers: TeacherResponse[] = [
  {
    id: "teacher-1",
    first_name: "Anna",
    last_name: "Schmidt",
    email: null,
    abbreviation: "AS",
    max_hours_per_week: 28,
    is_part_time: false,
    is_active: true,
  },
];

const mockEntries: CurriculumEntryResponse[] = [
  {
    id: "entry-1",
    term_id: "term-1",
    school_class_id: "class-1",
    subject_id: "sub-1",
    teacher_id: "teacher-1",
    hours_per_week: 5,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
  },
];

function setupApiMock(entries: CurriculumEntryResponse[] = mockEntries) {
  mockApiClient.get.mockImplementation((url: string) => {
    if (url.includes("/terms") && !url.includes("/curriculum"))
      return Promise.resolve(mockTerms);
    if (url.includes("/classes")) return Promise.resolve(mockClasses);
    if (url.includes("/subjects")) return Promise.resolve(mockSubjects);
    if (url.includes("/teachers")) return Promise.resolve(mockTeachers);
    if (url.includes("/curriculum")) return Promise.resolve(entries);
    return Promise.resolve([]);
  });
}

describe("CurriculumPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupApiMock();
  });

  it("renders loading state then curriculum table", async () => {
    render(<CurriculumPage />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Curriculum")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getAllByText("1a")[0]).toBeInTheDocument();
    });
    expect(screen.getAllByText("Mathematics")[0]).toBeInTheDocument();
    expect(screen.getAllByText("Anna Schmidt")[0]).toBeInTheDocument();
    expect(screen.getAllByText("5")[0]).toBeInTheDocument();
  });

  it("shows empty state when no entries exist", async () => {
    setupApiMock([]);
    render(<CurriculumPage />);

    await waitFor(() => {
      expect(
        screen.getAllByText("No curriculum entries")[0],
      ).toBeInTheDocument();
    });
  });

  it("shows auto-assign for entries without teacher", async () => {
    setupApiMock([{ ...mockEntries[0], teacher_id: null }]);
    render(<CurriculumPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Auto-assign")[0]).toBeInTheDocument();
    });
  });
});
