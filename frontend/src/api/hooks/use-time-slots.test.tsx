/**
 * Tests for Time Slots hooks
 */

import { renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { mockTimeSlotDetail, mockTimeSlots } from "@/test/mocks/handlers";
import { server } from "@/test/mocks/server";
import { createWrapper } from "@/test/test-utils";
import {
  useCreateTimeSlot,
  useDeleteTimeSlot,
  useTimeSlot,
  useTimeSlots,
  useUpdateTimeSlot,
} from "./use-time-slots";

const API_BASE = "http://localhost:8080";

describe("useTimeSlots", () => {
  it("should fetch time slots list", async () => {
    const { result } = renderHook(() => useTimeSlots("school-1"), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockTimeSlots);
  });

  it("should not fetch when schoolId is undefined", () => {
    const { result } = renderHook(() => useTimeSlots(undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
  });

  it("should handle fetch error", async () => {
    server.use(
      http.get(`${API_BASE}/api/schools/:schoolId/time-slots`, () => {
        return HttpResponse.json({ message: "Server error" }, { status: 500 });
      }),
    );

    const { result } = renderHook(() => useTimeSlots("school-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeDefined();
  });
});

describe("useTimeSlot", () => {
  it("should fetch a single time slot", async () => {
    const { result } = renderHook(() => useTimeSlot("school-1", "slot-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockTimeSlotDetail);
  });

  it("should not fetch when schoolId is undefined", () => {
    const { result } = renderHook(() => useTimeSlot(undefined, "slot-1"), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
  });

  it("should not fetch when id is undefined", () => {
    const { result } = renderHook(() => useTimeSlot("school-1", undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
  });

  it("should handle 404 error", async () => {
    const { result } = renderHook(
      () => useTimeSlot("school-1", "non-existent-id"),
      {
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});

describe("useCreateTimeSlot", () => {
  it("should create a new time slot", async () => {
    const newTimeSlot = {
      dayOfWeek: 1 as const,
      period: 3,
      startTime: "10:00",
      endTime: "10:45",
      isBreak: false,
    };

    const { result } = renderHook(() => useCreateTimeSlot("school-1"), {
      wrapper: createWrapper(),
    });

    result.current.mutate(newTimeSlot);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toMatchObject({
      dayOfWeek: 1,
      period: 3,
      id: "new-slot-id",
    });
  });
});

describe("useUpdateTimeSlot", () => {
  it("should update an existing time slot", async () => {
    const updateData = {
      dayOfWeek: 0 as const,
      period: 1,
      startTime: "08:15",
      endTime: "09:00",
      isBreak: false,
    };

    const { result } = renderHook(() => useUpdateTimeSlot("school-1"), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ id: "slot-1", data: updateData });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toMatchObject({
      startTime: "08:15",
      endTime: "09:00",
    });
  });
});

describe("useDeleteTimeSlot", () => {
  it("should delete a time slot", async () => {
    const { result } = renderHook(() => useDeleteTimeSlot("school-1"), {
      wrapper: createWrapper(),
    });

    result.current.mutate("slot-1");

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });
});
