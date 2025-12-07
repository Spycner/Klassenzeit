/**
 * Tests for Rooms hooks
 */

import { renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { mockRoomDetail, mockRooms } from "@/test/mocks/handlers";
import { server } from "@/test/mocks/server";
import { createWrapper } from "@/test/test-utils";
import {
  useCreateRoom,
  useDeleteRoom,
  useRoom,
  useRooms,
  useUpdateRoom,
} from "./use-rooms";

const API_BASE = "http://localhost:8080";

describe("useRooms", () => {
  it("should fetch rooms list", async () => {
    const { result } = renderHook(() => useRooms("school-1"), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockRooms);
  });

  it("should not fetch when schoolId is undefined", () => {
    const { result } = renderHook(() => useRooms(undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
  });

  it("should handle fetch error", async () => {
    server.use(
      http.get(`${API_BASE}/api/schools/:schoolId/rooms`, () => {
        return HttpResponse.json({ message: "Server error" }, { status: 500 });
      }),
    );

    const { result } = renderHook(() => useRooms("school-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeDefined();
  });
});

describe("useRoom", () => {
  it("should fetch a single room", async () => {
    const { result } = renderHook(() => useRoom("school-1", "room-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockRoomDetail);
  });

  it("should not fetch when schoolId is undefined", () => {
    const { result } = renderHook(() => useRoom(undefined, "room-1"), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
  });

  it("should not fetch when id is undefined", () => {
    const { result } = renderHook(() => useRoom("school-1", undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
  });

  it("should handle 404 error", async () => {
    const { result } = renderHook(
      () => useRoom("school-1", "non-existent-id"),
      {
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});

describe("useCreateRoom", () => {
  it("should create a new room", async () => {
    const newRoom = {
      name: "Room 201",
      building: "Annex",
      capacity: 20,
      features: "Computer Lab",
    };

    const { result } = renderHook(() => useCreateRoom("school-1"), {
      wrapper: createWrapper(),
    });

    result.current.mutate(newRoom);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toMatchObject({
      name: "Room 201",
      building: "Annex",
      id: "new-room-id",
    });
  });
});

describe("useUpdateRoom", () => {
  it("should update an existing room", async () => {
    const updateData = {
      name: "Room 101 Updated",
      building: "Main",
      capacity: 35,
    };

    const { result } = renderHook(() => useUpdateRoom("school-1"), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ id: "room-1", data: updateData });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toMatchObject({
      name: "Room 101 Updated",
      capacity: 35,
    });
  });
});

describe("useDeleteRoom", () => {
  it("should delete a room", async () => {
    const { result } = renderHook(() => useDeleteRoom("school-1"), {
      wrapper: createWrapper(),
    });

    result.current.mutate("room-1");

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });
});
