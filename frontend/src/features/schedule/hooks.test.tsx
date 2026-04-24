import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api-client";
import { scheduleByClassId, violationsByClassId } from "../../../tests/msw-handlers";
import { scheduleQueryKey, useClassSchedule, useGenerateClassSchedule } from "./hooks";

const CLASS_ID = "00000000-0000-0000-0000-00000000a001";

function wrapScheduleHook() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

describe("useClassSchedule", () => {
  beforeEach(() => {
    for (const key of Object.keys(scheduleByClassId)) delete scheduleByClassId[key];
    for (const key of Object.keys(violationsByClassId)) delete violationsByClassId[key];
  });

  it("returns the placements seeded for the class", async () => {
    scheduleByClassId[CLASS_ID] = [
      {
        lesson_id: "00000000-0000-0000-0000-00000000b001",
        time_block_id: "00000000-0000-0000-0000-00000000c001",
        room_id: "00000000-0000-0000-0000-00000000d001",
      },
    ];
    const { wrapper } = wrapScheduleHook();
    const { result } = renderHook(() => useClassSchedule(CLASS_ID), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.placements).toHaveLength(1);
  });

  it("returns an empty placement list for a never-solved class", async () => {
    const { wrapper } = wrapScheduleHook();
    const { result } = renderHook(() => useClassSchedule(CLASS_ID), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.placements).toEqual([]);
  });

  it("surfaces a 404 as ApiError when the class id is unknown", async () => {
    const { wrapper } = wrapScheduleHook();
    const { result } = renderHook(() => useClassSchedule("deadbeef-dead-beef-dead-beefdeadbeef"), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect((result.current.error as ApiError).status).toBe(404);
  });

  it("stays disabled while classId is undefined (no request)", async () => {
    const { wrapper } = wrapScheduleHook();
    const { result } = renderHook(() => useClassSchedule(undefined), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.isPending).toBe(true);
  });
});

describe("useGenerateClassSchedule", () => {
  beforeEach(() => {
    for (const key of Object.keys(scheduleByClassId)) delete scheduleByClassId[key];
    for (const key of Object.keys(violationsByClassId)) delete violationsByClassId[key];
  });

  it("posts and writes placements into the GET cache", async () => {
    scheduleByClassId[CLASS_ID] = [];
    violationsByClassId[CLASS_ID] = [];
    const { client, wrapper } = wrapScheduleHook();
    const { result } = renderHook(() => useGenerateClassSchedule(), { wrapper });
    const response = await result.current.mutateAsync(CLASS_ID);
    expect(response.placements).toBeDefined();
    const cached = client.getQueryData(scheduleQueryKey(CLASS_ID));
    expect(cached).toEqual({ placements: response.placements });
  });
});
