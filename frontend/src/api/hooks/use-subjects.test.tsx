/**
 * Tests for Subject hooks
 */

import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { mockSubjectDetail, mockSubjects } from "@/test/mocks/handlers";
import { createWrapper } from "@/test/test-utils";
import { useSubject, useSubjects } from "./use-subjects";

describe("useSubjects", () => {
  it("should fetch subjects list for a school", async () => {
    const { result } = renderHook(() => useSubjects("school-1"), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockSubjects);
  });

  it("should not fetch when schoolId is undefined", () => {
    const { result } = renderHook(() => useSubjects(undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
  });
});

describe("useSubject", () => {
  it("should fetch a single subject", async () => {
    const { result } = renderHook(() => useSubject("school-1", "subject-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockSubjectDetail);
  });

  it("should not fetch when schoolId or id is undefined", () => {
    const { result: result1 } = renderHook(
      () => useSubject(undefined, "subject-1"),
      {
        wrapper: createWrapper(),
      },
    );

    expect(result1.current.isLoading).toBe(false);

    const { result: result2 } = renderHook(
      () => useSubject("school-1", undefined),
      {
        wrapper: createWrapper(),
      },
    );

    expect(result2.current.isLoading).toBe(false);
  });
});
