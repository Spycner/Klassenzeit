/**
 * Tests for User hooks
 */

import { renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { mockUserSearchResult } from "@/test/mocks/handlers";
import { server } from "@/test/mocks/server";
import { createWrapper } from "@/test/test-utils";
import { useUserSearch } from "./use-users";

const API_BASE = "http://localhost:8080";

describe("useUserSearch", () => {
  it("should find user by email", async () => {
    // Override with explicit handler to ensure MSW intercepts
    server.use(
      http.get(`${API_BASE}/api/users/search`, ({ request }) => {
        const url = new URL(request.url);
        const email = url.searchParams.get("email");
        if (email === "admin@example.com") {
          return HttpResponse.json(mockUserSearchResult);
        }
        return HttpResponse.json(null);
      }),
    );

    const { result } = renderHook(() => useUserSearch("admin@example.com"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockUserSearchResult);
  });

  it("should return null when user not found", async () => {
    server.use(
      http.get(`${API_BASE}/api/users/search`, () => {
        return HttpResponse.json(null);
      }),
    );

    const { result } = renderHook(
      () => useUserSearch("nonexistent@example.com"),
      {
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toBeNull();
  });

  it("should not fetch when email is too short", () => {
    const { result } = renderHook(() => useUserSearch("ab"), {
      wrapper: createWrapper(),
    });

    // Should not be loading or fetching because email is < 3 chars
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
  });

  it("should fetch when email has 3+ characters", async () => {
    server.use(
      http.get(`${API_BASE}/api/users/search`, () => {
        return HttpResponse.json(null);
      }),
    );

    const { result } = renderHook(() => useUserSearch("abc"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });

  it("should respect enabled option", () => {
    const { result } = renderHook(
      () => useUserSearch("admin@example.com", { enabled: false }),
      {
        wrapper: createWrapper(),
      },
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
  });

  it("should handle server error", async () => {
    server.use(
      http.get(`${API_BASE}/api/users/search`, () => {
        return HttpResponse.json({ message: "Server error" }, { status: 500 });
      }),
    );

    const { result } = renderHook(() => useUserSearch("admin@example.com"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeDefined();
  });

  it("should trim email before searching", async () => {
    server.use(
      http.get(`${API_BASE}/api/users/search`, ({ request }) => {
        const url = new URL(request.url);
        const email = url.searchParams.get("email");
        // The hook should trim, so we should receive trimmed email
        if (email === "admin@example.com") {
          return HttpResponse.json(mockUserSearchResult);
        }
        return HttpResponse.json(null);
      }),
    );

    const { result } = renderHook(
      () => useUserSearch("  admin@example.com  "),
      {
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockUserSearchResult);
  });
});
