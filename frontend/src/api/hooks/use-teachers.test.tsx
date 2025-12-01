/**
 * Tests for Teacher hooks
 */

import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { mockTeacherDetail, mockTeachers } from "@/test/mocks/handlers";
import { createWrapper } from "@/test/test-utils";
import { useCreateTeacher, useTeacher, useTeachers } from "./use-teachers";

describe("useTeachers", () => {
  it("should fetch teachers list for a school", async () => {
    const { result } = renderHook(() => useTeachers("school-1"), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockTeachers);
  });

  it("should not fetch when schoolId is undefined", () => {
    const { result } = renderHook(() => useTeachers(undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
  });
});

describe("useTeacher", () => {
  it("should fetch a single teacher", async () => {
    const { result } = renderHook(() => useTeacher("school-1", "teacher-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockTeacherDetail);
  });

  it("should not fetch when schoolId or id is undefined", () => {
    const { result: result1 } = renderHook(
      () => useTeacher(undefined, "teacher-1"),
      {
        wrapper: createWrapper(),
      },
    );

    expect(result1.current.isLoading).toBe(false);

    const { result: result2 } = renderHook(
      () => useTeacher("school-1", undefined),
      {
        wrapper: createWrapper(),
      },
    );

    expect(result2.current.isLoading).toBe(false);
  });
});

describe("useCreateTeacher", () => {
  it("should create a new teacher", async () => {
    const newTeacher = {
      firstName: "New",
      lastName: "Teacher",
      email: "new.teacher@school.com",
      abbreviation: "NT",
    };

    const { result } = renderHook(() => useCreateTeacher("school-1"), {
      wrapper: createWrapper(),
    });

    result.current.mutate(newTeacher);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toMatchObject({
      firstName: "New",
      lastName: "Teacher",
      id: "new-teacher-id",
    });
  });
});
