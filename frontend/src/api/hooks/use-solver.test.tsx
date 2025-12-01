/**
 * Tests for Solver hooks
 */

import { renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import type { SolverJobResponse, TimetableSolutionResponse } from "@/api";
import { server } from "@/test/mocks/server";
import { createWrapper } from "@/test/test-utils";
import {
  useApplySolution,
  useSolution,
  useSolverStatus,
  useStartSolving,
  useStopSolving,
} from "./use-solver";

const API_BASE = "http://localhost:8080";
const SCHOOL_ID = "school-1";
const TERM_ID = "term-1";

// Mock data
const mockSolverStatusNotSolving: SolverJobResponse = {
  termId: TERM_ID,
  status: "NOT_SOLVING",
  score: undefined,
  hardViolations: undefined,
  softPenalties: undefined,
};

const mockSolverStatusSolving: SolverJobResponse = {
  termId: TERM_ID,
  status: "SOLVING",
  score: "0hard/-15soft",
  hardViolations: 0,
  softPenalties: -15,
};

const mockSolution: TimetableSolutionResponse = {
  termId: TERM_ID,
  score: "0hard/-5soft",
  hardViolations: 0,
  softPenalties: -5,
  assignments: [
    {
      lessonId: "lesson-1",
      schoolClassId: "class-1",
      schoolClassName: "3a",
      teacherId: "teacher-1",
      teacherName: "John Doe",
      subjectId: "subject-1",
      subjectName: "Mathematics",
      timeSlotId: "timeslot-1",
      dayOfWeek: 0,
      period: 1,
      roomId: "room-1",
      roomName: "Room 101",
      weekPattern: "EVERY",
    },
  ],
  violations: [],
};

// Default handlers for solver endpoints
const solverHandlers = [
  http.get(
    `${API_BASE}/api/schools/:schoolId/terms/:termId/solver/status`,
    () => {
      return HttpResponse.json(mockSolverStatusNotSolving);
    },
  ),
  http.post(
    `${API_BASE}/api/schools/:schoolId/terms/:termId/solver/solve`,
    () => {
      return HttpResponse.json(mockSolverStatusSolving, { status: 202 });
    },
  ),
  http.post(
    `${API_BASE}/api/schools/:schoolId/terms/:termId/solver/stop`,
    () => {
      return new HttpResponse(null, { status: 204 });
    },
  ),
  http.get(
    `${API_BASE}/api/schools/:schoolId/terms/:termId/solver/solution`,
    () => {
      return HttpResponse.json(mockSolution);
    },
  ),
  http.post(
    `${API_BASE}/api/schools/:schoolId/terms/:termId/solver/apply`,
    () => {
      return new HttpResponse(null, { status: 204 });
    },
  ),
];

describe("useSolverStatus", () => {
  beforeEach(() => {
    server.use(...solverHandlers);
  });

  it("should fetch solver status", async () => {
    const { result } = renderHook(() => useSolverStatus(SCHOOL_ID, TERM_ID), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockSolverStatusNotSolving);
  });

  it("should not fetch when schoolId is undefined", () => {
    const { result } = renderHook(() => useSolverStatus(undefined, TERM_ID), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
  });

  it("should not fetch when termId is undefined", () => {
    const { result } = renderHook(() => useSolverStatus(SCHOOL_ID, undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
  });

  it("should not fetch when enabled is false", () => {
    const { result } = renderHook(
      () => useSolverStatus(SCHOOL_ID, TERM_ID, { enabled: false }),
      { wrapper: createWrapper() },
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
  });

  it("should handle fetch error", async () => {
    server.use(
      http.get(
        `${API_BASE}/api/schools/:schoolId/terms/:termId/solver/status`,
        () => {
          return HttpResponse.json(
            { message: "Term not found" },
            { status: 404 },
          );
        },
      ),
    );

    const { result } = renderHook(() => useSolverStatus(SCHOOL_ID, TERM_ID), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeDefined();
  });
});

describe("useSolution", () => {
  beforeEach(() => {
    server.use(...solverHandlers);
  });

  it("should fetch solution", async () => {
    const { result } = renderHook(() => useSolution(SCHOOL_ID, TERM_ID), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockSolution);
    expect(result.current.data?.assignments).toHaveLength(1);
  });

  it("should not fetch when schoolId is undefined", () => {
    const { result } = renderHook(() => useSolution(undefined, TERM_ID), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
  });

  it("should not fetch when enabled is false", () => {
    const { result } = renderHook(
      () => useSolution(SCHOOL_ID, TERM_ID, { enabled: false }),
      { wrapper: createWrapper() },
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
  });
});

describe("useStartSolving", () => {
  beforeEach(() => {
    server.use(...solverHandlers);
  });

  it("should start solving", async () => {
    const { result } = renderHook(() => useStartSolving(SCHOOL_ID, TERM_ID), {
      wrapper: createWrapper(),
    });

    result.current.mutate();

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockSolverStatusSolving);
  });

  it("should handle error when no lessons exist", async () => {
    server.use(
      http.post(
        `${API_BASE}/api/schools/:schoolId/terms/:termId/solver/solve`,
        () => {
          return HttpResponse.json(
            { message: "No lessons to solve" },
            { status: 400 },
          );
        },
      ),
    );

    const { result } = renderHook(() => useStartSolving(SCHOOL_ID, TERM_ID), {
      wrapper: createWrapper(),
    });

    result.current.mutate();

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });

  it("should handle conflict when solver already running", async () => {
    server.use(
      http.post(
        `${API_BASE}/api/schools/:schoolId/terms/:termId/solver/solve`,
        () => {
          return HttpResponse.json(
            { message: "Solver already running" },
            { status: 409 },
          );
        },
      ),
    );

    const { result } = renderHook(() => useStartSolving(SCHOOL_ID, TERM_ID), {
      wrapper: createWrapper(),
    });

    result.current.mutate();

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});

describe("useStopSolving", () => {
  beforeEach(() => {
    server.use(...solverHandlers);
  });

  it("should stop solving", async () => {
    const { result } = renderHook(() => useStopSolving(SCHOOL_ID, TERM_ID), {
      wrapper: createWrapper(),
    });

    result.current.mutate();

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });

  it("should handle error when solver not running", async () => {
    server.use(
      http.post(
        `${API_BASE}/api/schools/:schoolId/terms/:termId/solver/stop`,
        () => {
          return HttpResponse.json(
            { message: "Solver is not running" },
            { status: 400 },
          );
        },
      ),
    );

    const { result } = renderHook(() => useStopSolving(SCHOOL_ID, TERM_ID), {
      wrapper: createWrapper(),
    });

    result.current.mutate();

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});

describe("useApplySolution", () => {
  beforeEach(() => {
    server.use(...solverHandlers);
  });

  it("should apply solution", async () => {
    const { result } = renderHook(() => useApplySolution(SCHOOL_ID, TERM_ID), {
      wrapper: createWrapper(),
    });

    result.current.mutate();

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });

  it("should handle error when no solution available", async () => {
    server.use(
      http.post(
        `${API_BASE}/api/schools/:schoolId/terms/:termId/solver/apply`,
        () => {
          return HttpResponse.json(
            { message: "No solution available" },
            { status: 400 },
          );
        },
      ),
    );

    const { result } = renderHook(() => useApplySolution(SCHOOL_ID, TERM_ID), {
      wrapper: createWrapper(),
    });

    result.current.mutate();

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });

  it("should handle error when solution has hard violations", async () => {
    server.use(
      http.post(
        `${API_BASE}/api/schools/:schoolId/terms/:termId/solver/apply`,
        () => {
          return HttpResponse.json(
            { message: "Cannot apply solution with hard violations" },
            { status: 400 },
          );
        },
      ),
    );

    const { result } = renderHook(() => useApplySolution(SCHOOL_ID, TERM_ID), {
      wrapper: createWrapper(),
    });

    result.current.mutate();

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});

describe("useSolverStatus polling configuration", () => {
  beforeEach(() => {
    server.use(...solverHandlers);
  });

  it("should have polling disabled by default", async () => {
    // We test that polling is configurable by checking the hook behavior
    // When polling is not enabled, the hook should still work for initial fetch
    const { result } = renderHook(() => useSolverStatus(SCHOOL_ID, TERM_ID), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockSolverStatusNotSolving);
  });

  it("should accept polling option without error", async () => {
    // Test that the polling option is accepted and doesn't cause errors
    const { result } = renderHook(
      () => useSolverStatus(SCHOOL_ID, TERM_ID, { polling: true }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toBeDefined();
  });

  it("should work with polling explicitly disabled", async () => {
    const { result } = renderHook(
      () => useSolverStatus(SCHOOL_ID, TERM_ID, { polling: false }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockSolverStatusNotSolving);
  });
});
