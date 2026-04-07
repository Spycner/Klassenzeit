import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  LessonResponse,
  RoomResponse,
  SchoolClassResponse,
  SubjectResponse,
  TeacherResponse,
  TermResponse,
  TimeSlotResponse,
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

vi.mock("@/hooks/use-api-client", () => ({
  useApiClient: () => mockApiClient,
}));

const _tCache = new Map<string, (k: string) => string>();
vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => {
    let fn = _tCache.get(ns);
    if (!fn) {
      fn = (k: string) => k;
      _tCache.set(ns, fn);
    }
    return fn;
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import TimetablePage from "@/app/[locale]/schools/[id]/timetable/page";

const term: TermResponse = {
  id: "term-1",
  school_year_id: "sy-1",
  name: "Fall",
  start_date: "2026-08-01",
  end_date: "2027-01-31",
  is_current: true,
};

const subject: SubjectResponse = {
  id: "sub-1",
  name: "Math",
  abbreviation: "M",
  color: null,
  needs_special_room: false,
};

const teacher: TeacherResponse = {
  id: "tch-1",
  first_name: "Anne",
  last_name: "M",
  email: null,
  abbreviation: "AM",
  max_hours_per_week: 28,
  is_part_time: false,
  is_active: true,
};

const cls: SchoolClassResponse = {
  id: "cls-1",
  name: "5a",
  grade_level: 5,
  student_count: 20,
  class_teacher_id: null,
  is_active: true,
};

const room: RoomResponse = {
  id: "rm-1",
  name: "R101",
  building: null,
  capacity: 30,
  max_concurrent: 1,
  is_active: true,
};

const ts: TimeSlotResponse = {
  id: "ts-1",
  day_of_week: 0,
  period: 1,
  start_time: "08:00:00",
  end_time: "08:45:00",
  is_break: false,
  label: null,
};

const lesson: LessonResponse = {
  id: "l-1",
  term_id: "term-1",
  class_id: "cls-1",
  teacher_id: "tch-1",
  subject_id: "sub-1",
  room_id: "rm-1",
  timeslot_id: "ts-1",
  week_pattern: "WEEKLY",
};

function mockReferenceData(lessons: LessonResponse[]) {
  mockApiClient.get.mockImplementation((url: string) => {
    if (url.includes("/terms/term-1/lessons"))
      return Promise.resolve({ lessons, violations: [] });
    if (url.endsWith("/terms")) return Promise.resolve([term]);
    if (url.endsWith("/classes")) return Promise.resolve([cls]);
    if (url.endsWith("/subjects")) return Promise.resolve([subject]);
    if (url.endsWith("/teachers")) return Promise.resolve([teacher]);
    if (url.endsWith("/rooms")) return Promise.resolve([room]);
    if (url.endsWith("/timeslots")) return Promise.resolve([ts]);
    if (url === "/api/schools/school-1")
      return Promise.resolve({
        id: "school-1",
        name: "Test",
        slug: "test",
        role: "viewer",
        created_at: "2026-01-01T00:00:00Z",
      });
    return Promise.resolve([]);
  });
}

describe("TimetablePage", () => {
  beforeEach(() => {
    mockApiClient.get.mockReset();
    localStorage.clear();
  });

  it("renders the empty state when no lessons are persisted", async () => {
    mockReferenceData([]);
    render(<TimetablePage />);
    await waitFor(() => {
      expect(screen.getByText("noTimetable")).toBeInTheDocument();
    });
  });

  it("renders the grid when lessons are present", async () => {
    mockReferenceData([lesson]);
    render(<TimetablePage />);
    await waitFor(() => {
      expect(screen.getByText("M")).toBeInTheDocument();
    });
  });
});
