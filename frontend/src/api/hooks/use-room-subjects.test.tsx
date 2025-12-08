/**
 * Tests for Room Subject Suitability hooks
 */

import { renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { mockRoomSubjects } from "@/test/mocks/handlers";
import { server } from "@/test/mocks/server";
import { createWrapper } from "@/test/test-utils";
import {
  useCreateRoomSubject,
  useDeleteRoomSubject,
  useRoomSubjects,
} from "./use-room-subjects";

const API_BASE = "http://localhost:8080";

describe("useRoomSubjects", () => {
  it("should fetch room subjects list", async () => {
    const { result } = renderHook(() => useRoomSubjects("school-1", "room-1"), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockRoomSubjects);
  });

  it("should not fetch when schoolId is undefined", () => {
    const { result } = renderHook(() => useRoomSubjects(undefined, "room-1"), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
  });

  it("should not fetch when roomId is undefined", () => {
    const { result } = renderHook(
      () => useRoomSubjects("school-1", undefined),
      {
        wrapper: createWrapper(),
      },
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
  });

  it("should handle fetch error", async () => {
    server.use(
      http.get(
        `${API_BASE}/api/schools/:schoolId/rooms/:roomId/subjects`,
        () => {
          return HttpResponse.json(
            { message: "Server error" },
            { status: 500 },
          );
        },
      ),
    );

    const { result } = renderHook(() => useRoomSubjects("school-1", "room-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeDefined();
  });
});

describe("useCreateRoomSubject", () => {
  it("should create a new room subject suitability", async () => {
    const newSuitability = {
      subjectId: "subject-3",
      isRequired: true,
    };

    const { result } = renderHook(
      () => useCreateRoomSubject("school-1", "room-1"),
      {
        wrapper: createWrapper(),
      },
    );

    result.current.mutate(newSuitability);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toMatchObject({
      subjectId: "subject-3",
      isRequired: true,
      id: "new-suit-id",
    });
  });

  it("should handle create error", async () => {
    server.use(
      http.post(
        `${API_BASE}/api/schools/:schoolId/rooms/:roomId/subjects`,
        () => {
          return HttpResponse.json(
            { message: "Subject already assigned" },
            { status: 400 },
          );
        },
      ),
    );

    const { result } = renderHook(
      () => useCreateRoomSubject("school-1", "room-1"),
      {
        wrapper: createWrapper(),
      },
    );

    result.current.mutate({ subjectId: "subject-1", isRequired: false });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});

describe("useDeleteRoomSubject", () => {
  it("should delete a room subject suitability", async () => {
    const { result } = renderHook(
      () => useDeleteRoomSubject("school-1", "room-1"),
      {
        wrapper: createWrapper(),
      },
    );

    result.current.mutate("suit-1");

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });

  it("should handle delete error", async () => {
    server.use(
      http.delete(
        `${API_BASE}/api/schools/:schoolId/rooms/:roomId/subjects/:id`,
        () => {
          return HttpResponse.json({ message: "Not found" }, { status: 404 });
        },
      ),
    );

    const { result } = renderHook(
      () => useDeleteRoomSubject("school-1", "room-1"),
      {
        wrapper: createWrapper(),
      },
    );

    result.current.mutate("non-existent-id");

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});
