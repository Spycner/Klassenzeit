import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
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

const _tCache = new Map<string, (key: string) => string>();
const translations: Record<string, Record<string, string>> = {
  scheduler: {
    title: "Schedule",
    description: "Generate and manage timetables",
    generate: "Generate",
    generating: "Generating...",
    noSchedule: "No schedule generated yet",
    solved: "Timetable generated successfully",
    failed: "Generation failed",
    alreadySolving: "Already solving",
    hardViolations: "Hard violations",
    discard: "Discard",
    apply: "Apply",
    applyConfirm: "Apply this timetable?",
    applied: "Applied",
    lessonsCreated: "lessons created",
    discarded: "Discarded",
    violations: "Violations",
    noViolations: "No violations",
    selectClass: "View class",
  },
  common: {
    loading: "Loading...",
    cancel: "Cancel",
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

import SchedulePage from "@/app/[locale]/schools/[id]/schedule/page";

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
    color: "#3B82F6",
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

const mockRooms: RoomResponse[] = [
  {
    id: "room-1",
    name: "101",
    building: null,
    capacity: 30,
    max_concurrent: 1,
    is_active: true,
  },
];

const mockTimeslots: TimeSlotResponse[] = [
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
    day_of_week: 1,
    period: 1,
    start_time: "08:00",
    end_time: "08:45",
    is_break: false,
    label: null,
  },
];

function setupDefaultMocks() {
  mockApiClient.get.mockImplementation((url: string) => {
    if (url.includes("/terms") && !url.includes("/scheduler"))
      return Promise.resolve(mockTerms);
    if (url.includes("/classes")) return Promise.resolve(mockClasses);
    if (url.includes("/subjects")) return Promise.resolve(mockSubjects);
    if (url.includes("/teachers")) return Promise.resolve(mockTeachers);
    if (url.includes("/rooms")) return Promise.resolve(mockRooms);
    if (url.includes("/timeslots")) return Promise.resolve(mockTimeslots);
    if (url.includes("/scheduler/status"))
      return Promise.reject(new Error("404"));
    if (url.includes("/scheduler/solution"))
      return Promise.reject(new Error("404"));
    return Promise.resolve([]);
  });
}

describe("SchedulePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it("renders loading state then page with generate button", async () => {
    render(<SchedulePage />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Schedule")).toBeInTheDocument();
    });
    expect(screen.getByText("Generate")).toBeInTheDocument();
    expect(screen.getByText("No schedule generated yet")).toBeInTheDocument();
  });

  it("shows term selector with current term", async () => {
    render(<SchedulePage />);

    await waitFor(() => {
      expect(screen.getByText("Semester 1")).toBeInTheDocument();
    });
  });

  it("clicking generate triggers solve API call", async () => {
    const user = userEvent.setup();
    mockApiClient.post.mockResolvedValue(undefined);

    render(<SchedulePage />);
    await waitFor(() => {
      expect(screen.getByText("Generate")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Generate"));

    await waitFor(() => {
      expect(mockApiClient.post).toHaveBeenCalledWith(
        "/api/schools/school-1/terms/term-1/scheduler/solve",
        {},
      );
    });
  });

  it("shows solved timetable with grid", async () => {
    const solvedSolution = {
      timetable: [
        {
          teacher_id: "teacher-1",
          class_id: "class-1",
          subject_id: "sub-1",
          room_id: "room-1",
          timeslot_id: "ts-1",
        },
      ],
      score: { hard_violations: 0, soft_score: 1.0 },
      violations: [],
    };

    mockApiClient.get.mockImplementation((url: string) => {
      if (url.includes("/terms") && !url.includes("/scheduler"))
        return Promise.resolve(mockTerms);
      if (url.includes("/classes")) return Promise.resolve(mockClasses);
      if (url.includes("/subjects")) return Promise.resolve(mockSubjects);
      if (url.includes("/teachers")) return Promise.resolve(mockTeachers);
      if (url.includes("/rooms")) return Promise.resolve(mockRooms);
      if (url.includes("/timeslots")) return Promise.resolve(mockTimeslots);
      if (url.includes("/scheduler/status"))
        return Promise.resolve({
          status: "solved",
          hard_violations: 0,
          soft_score: 1.0,
        });
      if (url.includes("/scheduler/solution"))
        return Promise.resolve(solvedSolution);
      return Promise.resolve([]);
    });

    render(<SchedulePage />);

    await waitFor(() => {
      expect(screen.getByText("Hard violations: 0")).toBeInTheDocument();
    });

    expect(screen.getByText("MA")).toBeInTheDocument();
    expect(screen.getByText("AS - 101")).toBeInTheDocument();
    expect(screen.getByText("No violations")).toBeInTheDocument();
  });
});
