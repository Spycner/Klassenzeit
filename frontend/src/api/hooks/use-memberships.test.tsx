/**
 * Tests for Memberships hooks
 */

import { renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { mockMembershipDetail, mockMemberships } from "@/test/mocks/handlers";
import { server } from "@/test/mocks/server";
import { createWrapper } from "@/test/test-utils";
import {
  useCreateMembership,
  useDeleteMembership,
  useMembership,
  useMemberships,
  useUpdateMembership,
} from "./use-memberships";

const API_BASE = "http://localhost:8080";

describe("useMemberships", () => {
  it("should fetch memberships list", async () => {
    const { result } = renderHook(() => useMemberships("school-1"), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockMemberships);
  });

  it("should not fetch when schoolId is undefined", () => {
    const { result } = renderHook(() => useMemberships(undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
  });

  it("should handle fetch error", async () => {
    server.use(
      http.get(`${API_BASE}/api/schools/:schoolId/members`, () => {
        return HttpResponse.json({ message: "Server error" }, { status: 500 });
      }),
    );

    const { result } = renderHook(() => useMemberships("school-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeDefined();
  });
});

describe("useMembership", () => {
  it("should fetch a single membership", async () => {
    const { result } = renderHook(
      () => useMembership("school-1", "membership-1"),
      {
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockMembershipDetail);
  });

  it("should not fetch when schoolId is undefined", () => {
    const { result } = renderHook(
      () => useMembership(undefined, "membership-1"),
      {
        wrapper: createWrapper(),
      },
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
  });

  it("should not fetch when id is undefined", () => {
    const { result } = renderHook(() => useMembership("school-1", undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
  });

  it("should handle 404 error", async () => {
    const { result } = renderHook(
      () => useMembership("school-1", "non-existent-id"),
      {
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});

describe("useCreateMembership", () => {
  it("should create a new membership", async () => {
    const newMembership = {
      userId: "user-3",
      role: "TEACHER" as const,
      linkedTeacherId: "teacher-2",
    };

    const { result } = renderHook(() => useCreateMembership("school-1"), {
      wrapper: createWrapper(),
    });

    result.current.mutate(newMembership);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toMatchObject({
      userId: "user-3",
      role: "TEACHER",
      id: "new-membership-id",
    });
  });
});

describe("useUpdateMembership", () => {
  it("should update an existing membership", async () => {
    const updateData = {
      role: "PLANNER" as const,
      linkedTeacherId: "teacher-1",
    };

    const { result } = renderHook(() => useUpdateMembership("school-1"), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ id: "membership-1", data: updateData });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toMatchObject({
      role: "PLANNER",
      linkedTeacherId: "teacher-1",
    });
  });
});

describe("useDeleteMembership", () => {
  it("should delete a membership", async () => {
    const { result } = renderHook(() => useDeleteMembership("school-1"), {
      wrapper: createWrapper(),
    });

    result.current.mutate("membership-1");

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });
});
