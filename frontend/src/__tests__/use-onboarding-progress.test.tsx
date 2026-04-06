import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockApiClient = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};

vi.mock("@/hooks/use-api-client", () => ({
  useApiClient: () => mockApiClient,
}));

import { useOnboardingProgress } from "@/hooks/use-onboarding-progress";

beforeEach(() => {
  vi.clearAllMocks();
});

function mockResponses(map: Record<string, unknown>) {
  mockApiClient.get.mockImplementation((path: string) => {
    const key = Object.keys(map).find((k) => path === k);
    if (!key) return Promise.reject(new Error(`unexpected GET ${path}`));
    return Promise.resolve(map[key]);
  });
}

describe("useOnboardingProgress", () => {
  it("reports isEmpty when every count is zero", async () => {
    mockResponses({
      "/api/schools/s1/terms": [],
      "/api/schools/s1/classes": [],
      "/api/schools/s1/subjects": [],
      "/api/schools/s1/teachers": [],
      "/api/schools/s1/rooms": [],
      "/api/schools/s1/time-slots": [],
    });

    const { result } = renderHook(() => useOnboardingProgress("s1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isEmpty).toBe(true);
    expect(result.current.allComplete).toBe(false);
    expect(result.current.firstIncomplete).toBe("term");
    for (const id of [
      "term",
      "classes",
      "subjects",
      "teachers",
      "rooms",
      "timeslots",
      "curriculum",
    ] as const) {
      expect(result.current.steps[id].done).toBe(false);
      expect(result.current.steps[id].count).toBe(0);
    }
    const curriculumCalls = mockApiClient.get.mock.calls.filter(
      (call: unknown[]) => String(call[0]).includes("/curriculum"),
    );
    expect(curriculumCalls).toHaveLength(0);
  });

  it("marks term done and curriculum still empty when only a term exists", async () => {
    mockResponses({
      "/api/schools/s1/terms": [{ id: "t1" }],
      "/api/schools/s1/classes": [],
      "/api/schools/s1/subjects": [],
      "/api/schools/s1/teachers": [],
      "/api/schools/s1/rooms": [],
      "/api/schools/s1/time-slots": [],
      "/api/schools/s1/terms/t1/curriculum": [],
    });

    const { result } = renderHook(() => useOnboardingProgress("s1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isEmpty).toBe(false);
    expect(result.current.steps.term.done).toBe(true);
    expect(result.current.steps.curriculum.done).toBe(false);
    expect(result.current.firstIncomplete).toBe("classes");
  });

  it("marks allComplete when every entity has at least one row", async () => {
    mockResponses({
      "/api/schools/s1/terms": [{ id: "t1" }],
      "/api/schools/s1/classes": [{}],
      "/api/schools/s1/subjects": [{}],
      "/api/schools/s1/teachers": [{}],
      "/api/schools/s1/rooms": [{}],
      "/api/schools/s1/time-slots": [{}],
      "/api/schools/s1/terms/t1/curriculum": [{}],
    });

    const { result } = renderHook(() => useOnboardingProgress("s1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.allComplete).toBe(true);
    expect(result.current.firstIncomplete).toBe(null);
  });
});
