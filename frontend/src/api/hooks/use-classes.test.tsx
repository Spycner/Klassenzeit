/**
 * Tests for School Classes hooks
 */

import { renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { mockClassDetail, mockClasses } from "@/test/mocks/handlers";
import { server } from "@/test/mocks/server";
import { createWrapper } from "@/test/test-utils";
import {
  useClass,
  useClasses,
  useCreateClass,
  useDeleteClass,
  useUpdateClass,
} from "./use-classes";

const API_BASE = "http://localhost:8080";

describe("useClasses", () => {
  it("should fetch classes list", async () => {
    const { result } = renderHook(() => useClasses("school-1"), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockClasses);
  });

  it("should not fetch when schoolId is undefined", () => {
    const { result } = renderHook(() => useClasses(undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
  });

  it("should handle fetch error", async () => {
    server.use(
      http.get(`${API_BASE}/api/schools/:schoolId/classes`, () => {
        return HttpResponse.json({ message: "Server error" }, { status: 500 });
      }),
    );

    const { result } = renderHook(() => useClasses("school-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeDefined();
  });
});

describe("useClass", () => {
  it("should fetch a single class", async () => {
    const { result } = renderHook(() => useClass("school-1", "class-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockClassDetail);
  });

  it("should not fetch when schoolId is undefined", () => {
    const { result } = renderHook(() => useClass(undefined, "class-1"), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
  });

  it("should not fetch when id is undefined", () => {
    const { result } = renderHook(() => useClass("school-1", undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
  });

  it("should handle 404 error", async () => {
    const { result } = renderHook(
      () => useClass("school-1", "non-existent-id"),
      {
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});

describe("useCreateClass", () => {
  it("should create a new class", async () => {
    const newClass = {
      name: "7a",
      gradeLevel: 7 as const,
      studentCount: 28,
    };

    const { result } = renderHook(() => useCreateClass("school-1"), {
      wrapper: createWrapper(),
    });

    result.current.mutate(newClass);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toMatchObject({
      name: "7a",
      gradeLevel: 7,
      id: "new-class-id",
    });
  });
});

describe("useUpdateClass", () => {
  it("should update an existing class", async () => {
    const updateData = {
      name: "5b",
      gradeLevel: 5 as const,
      studentCount: 26,
    };

    const { result } = renderHook(() => useUpdateClass("school-1"), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ id: "class-1", data: updateData });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toMatchObject({
      name: "5b",
      gradeLevel: 5,
    });
  });
});

describe("useDeleteClass", () => {
  it("should delete a class", async () => {
    const { result } = renderHook(() => useDeleteClass("school-1"), {
      wrapper: createWrapper(),
    });

    result.current.mutate("class-1");

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });
});
