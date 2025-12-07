/**
 * Tests for Access Requests hooks
 */

import { renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import {
  mockAccessRequestDetail,
  mockAccessRequests,
} from "@/test/mocks/handlers";
import { server } from "@/test/mocks/server";
import { createWrapper } from "@/test/test-utils";
import {
  useAccessRequest,
  useAccessRequests,
  useCancelAccessRequest,
  useCreateAccessRequest,
  useReviewAccessRequest,
} from "./use-access-requests";

const API_BASE = "http://localhost:8080";

describe("useAccessRequests", () => {
  it("should fetch access requests list", async () => {
    const { result } = renderHook(() => useAccessRequests("school-1"), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockAccessRequests);
  });

  it("should not fetch when schoolId is undefined", () => {
    const { result } = renderHook(() => useAccessRequests(undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
  });

  it("should handle fetch error", async () => {
    server.use(
      http.get(`${API_BASE}/api/schools/:schoolId/access-requests`, () => {
        return HttpResponse.json({ message: "Server error" }, { status: 500 });
      }),
    );

    const { result } = renderHook(() => useAccessRequests("school-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeDefined();
  });
});

describe("useAccessRequest", () => {
  it("should fetch a single access request", async () => {
    const { result } = renderHook(
      () => useAccessRequest("school-1", "request-1"),
      {
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockAccessRequestDetail);
  });

  it("should not fetch when schoolId is undefined", () => {
    const { result } = renderHook(
      () => useAccessRequest(undefined, "request-1"),
      {
        wrapper: createWrapper(),
      },
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
  });

  it("should not fetch when requestId is undefined", () => {
    const { result } = renderHook(
      () => useAccessRequest("school-1", undefined),
      {
        wrapper: createWrapper(),
      },
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
  });

  it("should handle 404 error", async () => {
    const { result } = renderHook(
      () => useAccessRequest("school-1", "non-existent-id"),
      {
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});

describe("useCreateAccessRequest", () => {
  it("should create a new access request", async () => {
    const newRequest = {
      requestedRole: "TEACHER" as const,
      message: "I would like to join as a teacher.",
    };

    const { result } = renderHook(() => useCreateAccessRequest("school-1"), {
      wrapper: createWrapper(),
    });

    result.current.mutate(newRequest);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toMatchObject({
      requestedRole: "TEACHER",
      id: "new-request-id",
    });
  });
});

describe("useReviewAccessRequest", () => {
  it("should approve an access request", async () => {
    const reviewData = {
      requestId: "request-1",
      data: {
        decision: "APPROVE" as const,
        responseMessage: "Welcome to the team!",
      },
    };

    const { result } = renderHook(() => useReviewAccessRequest("school-1"), {
      wrapper: createWrapper(),
    });

    result.current.mutate(reviewData);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toMatchObject({
      status: "APPROVED",
      reviewedById: "user-1",
    });
  });

  it("should reject an access request", async () => {
    const reviewData = {
      requestId: "request-1",
      data: {
        decision: "REJECT" as const,
        responseMessage: "Position not available.",
      },
    };

    const { result } = renderHook(() => useReviewAccessRequest("school-1"), {
      wrapper: createWrapper(),
    });

    result.current.mutate(reviewData);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toMatchObject({
      status: "REJECTED",
      reviewedById: "user-1",
    });
  });
});

describe("useCancelAccessRequest", () => {
  it("should cancel an access request", async () => {
    const { result } = renderHook(() => useCancelAccessRequest(), {
      wrapper: createWrapper(),
    });

    result.current.mutate("request-1");

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });
});
