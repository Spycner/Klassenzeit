/**
 * Tests for School hooks
 */

import { renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { mockSchoolDetail, mockSchools } from "@/test/mocks/handlers";
import { server } from "@/test/mocks/server";
import { createWrapper } from "@/test/test-utils";
import {
  useCreateSchool,
  useDeleteSchool,
  useSchool,
  useSchools,
  useUpdateSchool,
} from "./use-schools";

const API_BASE = "http://localhost:8080";

describe("useSchools", () => {
  it("should fetch schools list", async () => {
    const { result } = renderHook(() => useSchools(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockSchools);
  });

  it("should handle fetch error", async () => {
    server.use(
      http.get(`${API_BASE}/api/schools`, () => {
        return HttpResponse.json({ message: "Server error" }, { status: 500 });
      }),
    );

    const { result } = renderHook(() => useSchools(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeDefined();
  });
});

describe("useSchool", () => {
  it("should fetch a single school", async () => {
    const { result } = renderHook(() => useSchool("school-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockSchoolDetail);
  });

  it("should not fetch when id is undefined", () => {
    const { result } = renderHook(() => useSchool(undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
  });

  it("should handle 301 redirect for old slug", async () => {
    const oldSlug = "old-school-slug";
    const newSlug = "new-school-slug";

    server.use(
      http.get(`${API_BASE}/api/schools/${oldSlug}`, () => {
        return HttpResponse.json(
          {
            status: 301,
            newSlug: newSlug,
            redirectUrl: `/api/schools/${newSlug}`,
          },
          {
            status: 301,
            headers: {
              Location: `/api/schools/${newSlug}`,
              "X-Redirect-Slug": newSlug,
            },
          },
        );
      }),
    );

    const { result } = renderHook(() => useSchool(oldSlug), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    // The error should be a RedirectError (which triggers navigation in the hook)
    expect(result.current.error).toBeDefined();
  });

  it("should not retry on redirect errors", async () => {
    const oldSlug = "redirect-no-retry";
    const newSlug = "new-slug";
    let requestCount = 0;

    server.use(
      http.get(`${API_BASE}/api/schools/${oldSlug}`, () => {
        requestCount++;
        return HttpResponse.json(
          {
            status: 301,
            newSlug: newSlug,
            redirectUrl: `/api/schools/${newSlug}`,
          },
          {
            status: 301,
            headers: {
              Location: `/api/schools/${newSlug}`,
              "X-Redirect-Slug": newSlug,
            },
          },
        );
      }),
    );

    const { result } = renderHook(() => useSchool(oldSlug), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    // Should only make one request (no retries for redirects)
    expect(requestCount).toBe(1);
  });
});

describe("useCreateSchool", () => {
  it("should create a new school", async () => {
    const newSchool = {
      name: "New School",
      slug: "new-school",
      schoolType: "Gymnasium",
      minGrade: 5,
      maxGrade: 13,
      initialAdminUserId: "00000000-0000-0000-0000-000000000001",
    };

    const { result } = renderHook(() => useCreateSchool(), {
      wrapper: createWrapper(),
    });

    result.current.mutate(newSchool);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toMatchObject({
      name: "New School",
      slug: "new-school",
      id: "new-school-id",
    });
  });
});

describe("useUpdateSchool", () => {
  it("should update an existing school", async () => {
    const updateData = {
      name: "Updated School",
      slug: "updated-school",
      schoolType: "Realschule",
      minGrade: 5,
      maxGrade: 10,
    };

    const { result } = renderHook(() => useUpdateSchool(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ id: "school-1", data: updateData });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toMatchObject({
      name: "Updated School",
      slug: "updated-school",
    });
  });
});

describe("useDeleteSchool", () => {
  it("should delete a school", async () => {
    const { result } = renderHook(() => useDeleteSchool(), {
      wrapper: createWrapper(),
    });

    result.current.mutate("school-1");

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });
});
