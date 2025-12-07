/**
 * Tests for Terms hooks
 */

import { renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { mockTermDetail, mockTerms } from "@/test/mocks/handlers";
import { server } from "@/test/mocks/server";
import { createWrapper } from "@/test/test-utils";
import {
  useCreateTerm,
  useDeleteTerm,
  useTerm,
  useTerms,
  useUpdateTerm,
} from "./use-terms";

const API_BASE = "http://localhost:8080";

describe("useTerms", () => {
  it("should fetch terms list", async () => {
    const { result } = renderHook(() => useTerms("school-1", "year-1"), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockTerms);
  });

  it("should not fetch when schoolId is undefined", () => {
    const { result } = renderHook(() => useTerms(undefined, "year-1"), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
  });

  it("should not fetch when schoolYearId is undefined", () => {
    const { result } = renderHook(() => useTerms("school-1", undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
  });

  it("should handle fetch error", async () => {
    server.use(
      http.get(
        `${API_BASE}/api/schools/:schoolId/school-years/:yearId/terms`,
        () => {
          return HttpResponse.json(
            { message: "Server error" },
            { status: 500 },
          );
        },
      ),
    );

    const { result } = renderHook(() => useTerms("school-1", "year-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeDefined();
  });
});

describe("useTerm", () => {
  it("should fetch a single term", async () => {
    const { result } = renderHook(
      () => useTerm("school-1", "year-1", "term-1"),
      {
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockTermDetail);
  });

  it("should not fetch when schoolId is undefined", () => {
    const { result } = renderHook(
      () => useTerm(undefined, "year-1", "term-1"),
      {
        wrapper: createWrapper(),
      },
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
  });

  it("should not fetch when schoolYearId is undefined", () => {
    const { result } = renderHook(
      () => useTerm("school-1", undefined, "term-1"),
      {
        wrapper: createWrapper(),
      },
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
  });

  it("should not fetch when id is undefined", () => {
    const { result } = renderHook(
      () => useTerm("school-1", "year-1", undefined),
      {
        wrapper: createWrapper(),
      },
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
  });

  it("should handle 404 error", async () => {
    const { result } = renderHook(
      () => useTerm("school-1", "year-1", "non-existent-id"),
      {
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});

describe("useCreateTerm", () => {
  it("should create a new term", async () => {
    const newTerm = {
      name: "Summer Term",
      startDate: "2025-03-01",
      endDate: "2025-05-31",
      isCurrent: false,
    };

    const { result } = renderHook(() => useCreateTerm("school-1", "year-1"), {
      wrapper: createWrapper(),
    });

    result.current.mutate(newTerm);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toMatchObject({
      name: "Summer Term",
      startDate: "2025-03-01",
      id: "new-term-id",
    });
  });
});

describe("useUpdateTerm", () => {
  it("should update an existing term", async () => {
    const updateData = {
      name: "1. Semester Updated",
      startDate: "2024-08-15",
      endDate: "2025-01-15",
      isCurrent: true,
    };

    const { result } = renderHook(() => useUpdateTerm("school-1", "year-1"), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ id: "term-1", data: updateData });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toMatchObject({
      name: "1. Semester Updated",
      startDate: "2024-08-15",
    });
  });
});

describe("useDeleteTerm", () => {
  it("should delete a term", async () => {
    const { result } = renderHook(() => useDeleteTerm("school-1", "year-1"), {
      wrapper: createWrapper(),
    });

    result.current.mutate("term-1");

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });
});
