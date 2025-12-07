/**
 * Tests for School Years hooks
 */

import { renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { mockSchoolYearDetail, mockSchoolYears } from "@/test/mocks/handlers";
import { server } from "@/test/mocks/server";
import { createWrapper } from "@/test/test-utils";
import {
  useCreateSchoolYear,
  useDeleteSchoolYear,
  useSchoolYear,
  useSchoolYears,
  useUpdateSchoolYear,
} from "./use-school-years";

const API_BASE = "http://localhost:8080";

describe("useSchoolYears", () => {
  it("should fetch school years list", async () => {
    const { result } = renderHook(() => useSchoolYears("school-1"), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockSchoolYears);
  });

  it("should not fetch when schoolId is undefined", () => {
    const { result } = renderHook(() => useSchoolYears(undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
  });

  it("should handle fetch error", async () => {
    server.use(
      http.get(`${API_BASE}/api/schools/:schoolId/school-years`, () => {
        return HttpResponse.json({ message: "Server error" }, { status: 500 });
      }),
    );

    const { result } = renderHook(() => useSchoolYears("school-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeDefined();
  });
});

describe("useSchoolYear", () => {
  it("should fetch a single school year", async () => {
    const { result } = renderHook(() => useSchoolYear("school-1", "year-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockSchoolYearDetail);
  });

  it("should not fetch when schoolId is undefined", () => {
    const { result } = renderHook(() => useSchoolYear(undefined, "year-1"), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
  });

  it("should not fetch when id is undefined", () => {
    const { result } = renderHook(() => useSchoolYear("school-1", undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
  });

  it("should handle 404 error", async () => {
    const { result } = renderHook(
      () => useSchoolYear("school-1", "non-existent-id"),
      {
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});

describe("useCreateSchoolYear", () => {
  it("should create a new school year", async () => {
    const newSchoolYear = {
      name: "2025/2026",
      startDate: "2025-08-01",
      endDate: "2026-07-31",
      isCurrent: false,
    };

    const { result } = renderHook(() => useCreateSchoolYear("school-1"), {
      wrapper: createWrapper(),
    });

    result.current.mutate(newSchoolYear);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toMatchObject({
      name: "2025/2026",
      startDate: "2025-08-01",
      id: "new-year-id",
    });
  });
});

describe("useUpdateSchoolYear", () => {
  it("should update an existing school year", async () => {
    const updateData = {
      name: "2024/2025 Updated",
      startDate: "2024-09-01",
      endDate: "2025-06-30",
      isCurrent: true,
    };

    const { result } = renderHook(() => useUpdateSchoolYear("school-1"), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ id: "year-1", data: updateData });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toMatchObject({
      name: "2024/2025 Updated",
      startDate: "2024-09-01",
    });
  });
});

describe("useDeleteSchoolYear", () => {
  it("should delete a school year", async () => {
    const { result } = renderHook(() => useDeleteSchoolYear("school-1"), {
      wrapper: createWrapper(),
    });

    result.current.mutate("year-1");

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });
});
