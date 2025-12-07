/**
 * Tests for Lessons hooks
 */

import { renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { mockLessonDetail, mockLessons } from "@/test/mocks/handlers";
import { server } from "@/test/mocks/server";
import { createWrapper } from "@/test/test-utils";
import {
  useCreateLesson,
  useDeleteLesson,
  useLesson,
  useLessons,
  useUpdateLesson,
} from "./use-lessons";

const API_BASE = "http://localhost:8080";

describe("useLessons", () => {
  it("should fetch lessons list", async () => {
    const { result } = renderHook(() => useLessons("school-1", "term-1"), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockLessons);
  });

  it("should not fetch when schoolId is undefined", () => {
    const { result } = renderHook(() => useLessons(undefined, "term-1"), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
  });

  it("should not fetch when termId is undefined", () => {
    const { result } = renderHook(() => useLessons("school-1", undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
  });

  it("should handle fetch error", async () => {
    server.use(
      http.get(
        `${API_BASE}/api/schools/:schoolId/terms/:termId/lessons`,
        () => {
          return HttpResponse.json(
            { message: "Server error" },
            { status: 500 },
          );
        },
      ),
    );

    const { result } = renderHook(() => useLessons("school-1", "term-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeDefined();
  });
});

describe("useLesson", () => {
  it("should fetch a single lesson", async () => {
    const { result } = renderHook(
      () => useLesson("school-1", "term-1", "lesson-1"),
      {
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockLessonDetail);
  });

  it("should not fetch when schoolId is undefined", () => {
    const { result } = renderHook(
      () => useLesson(undefined, "term-1", "lesson-1"),
      {
        wrapper: createWrapper(),
      },
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
  });

  it("should not fetch when termId is undefined", () => {
    const { result } = renderHook(
      () => useLesson("school-1", undefined, "lesson-1"),
      {
        wrapper: createWrapper(),
      },
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
  });

  it("should not fetch when id is undefined", () => {
    const { result } = renderHook(
      () => useLesson("school-1", "term-1", undefined),
      {
        wrapper: createWrapper(),
      },
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
  });

  it("should handle 404 error", async () => {
    const { result } = renderHook(
      () => useLesson("school-1", "term-1", "non-existent-id"),
      {
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});

describe("useCreateLesson", () => {
  it("should create a new lesson", async () => {
    const newLesson = {
      schoolClassId: "class-1",
      teacherId: "teacher-1",
      subjectId: "subject-1",
      timeslotId: "slot-2",
      roomId: "room-1",
      weekPattern: "EVERY" as const,
    };

    const { result } = renderHook(() => useCreateLesson("school-1", "term-1"), {
      wrapper: createWrapper(),
    });

    result.current.mutate(newLesson);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toMatchObject({
      schoolClassId: "class-1",
      teacherId: "teacher-1",
      id: "new-lesson-id",
    });
  });
});

describe("useUpdateLesson", () => {
  it("should update an existing lesson", async () => {
    const updateData = {
      schoolClassId: "class-1",
      teacherId: "teacher-2",
      subjectId: "subject-1",
      timeslotId: "slot-1",
      roomId: "room-2",
      weekPattern: "A" as const,
    };

    const { result } = renderHook(() => useUpdateLesson("school-1", "term-1"), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ id: "lesson-1", data: updateData });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toMatchObject({
      teacherId: "teacher-2",
      weekPattern: "A",
    });
  });
});

describe("useDeleteLesson", () => {
  it("should delete a lesson", async () => {
    const { result } = renderHook(() => useDeleteLesson("school-1", "term-1"), {
      wrapper: createWrapper(),
    });

    result.current.mutate("lesson-1");

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });
});
