/**
 * Tests for Teacher hooks (including Qualifications and Availability)
 */

import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  mockAvailability,
  mockAvailabilityDetail,
  mockClassTeacherAssignments,
  mockQualificationDetail,
  mockQualifications,
  mockTeacherDetail,
  mockTeachers,
} from "@/test/mocks/handlers";
import { createWrapper } from "@/test/test-utils";
import {
  useAvailability,
  useAvailabilityEntry,
  useClassTeacherAssignments,
  useCreateAvailability,
  useCreateQualification,
  useCreateTeacher,
  useDeleteAvailability,
  useDeleteQualification,
  useDeleteTeacher,
  usePermanentDeleteTeacher,
  useQualification,
  useQualifications,
  useTeacher,
  useTeachers,
  useUpdateAvailability,
  useUpdateQualification,
  useUpdateTeacher,
} from "./use-teachers";

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

describe("useUpdateTeacher", () => {
  it("should update an existing teacher", async () => {
    const { result } = renderHook(() => useUpdateTeacher("school-1"), {
      wrapper: createWrapper(),
    });

    result.current.mutate({
      id: "teacher-1",
      data: {
        firstName: "Updated",
        lastName: "Teacher",
        abbreviation: "UT",
        version: 1,
      },
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toMatchObject({
      firstName: "Updated",
      lastName: "Teacher",
    });
  });
});

describe("useDeleteTeacher", () => {
  it("should soft-delete a teacher", async () => {
    const { result } = renderHook(() => useDeleteTeacher("school-1"), {
      wrapper: createWrapper(),
    });

    result.current.mutate("teacher-1");

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });
});

describe("usePermanentDeleteTeacher", () => {
  it("should permanently delete a teacher", async () => {
    const { result } = renderHook(() => usePermanentDeleteTeacher("school-1"), {
      wrapper: createWrapper(),
    });

    result.current.mutate("teacher-1");

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });
});

describe("useClassTeacherAssignments", () => {
  it("should fetch class teacher assignments", async () => {
    const { result } = renderHook(
      () => useClassTeacherAssignments("school-1", "teacher-1"),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockClassTeacherAssignments);
  });

  it("should not fetch when schoolId or teacherId is undefined", () => {
    const { result: result1 } = renderHook(
      () => useClassTeacherAssignments(undefined, "teacher-1"),
      { wrapper: createWrapper() },
    );

    expect(result1.current.isLoading).toBe(false);

    const { result: result2 } = renderHook(
      () => useClassTeacherAssignments("school-1", undefined),
      { wrapper: createWrapper() },
    );

    expect(result2.current.isLoading).toBe(false);
  });
});

// ============================================================================
// Qualification Hooks Tests
// ============================================================================

describe("useQualifications", () => {
  it("should fetch qualifications for a teacher", async () => {
    const { result } = renderHook(
      () => useQualifications("school-1", "teacher-1"),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockQualifications);
  });

  it("should not fetch when schoolId or teacherId is undefined", () => {
    const { result: result1 } = renderHook(
      () => useQualifications(undefined, "teacher-1"),
      { wrapper: createWrapper() },
    );

    expect(result1.current.isLoading).toBe(false);

    const { result: result2 } = renderHook(
      () => useQualifications("school-1", undefined),
      { wrapper: createWrapper() },
    );

    expect(result2.current.isLoading).toBe(false);
  });
});

describe("useQualification", () => {
  it("should fetch a single qualification", async () => {
    const { result } = renderHook(
      () => useQualification("school-1", "teacher-1", "qual-1"),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockQualificationDetail);
  });

  it("should not fetch when any id is undefined", () => {
    const { result } = renderHook(
      () => useQualification("school-1", "teacher-1", undefined),
      { wrapper: createWrapper() },
    );

    expect(result.current.isLoading).toBe(false);
  });
});

describe("useCreateQualification", () => {
  it("should create a new qualification", async () => {
    const { result } = renderHook(
      () => useCreateQualification("school-1", "teacher-1"),
      { wrapper: createWrapper() },
    );

    result.current.mutate({
      subjectId: "subject-1",
      qualificationLevel: "PRIMARY",
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toMatchObject({
      id: "new-qual-id",
      subjectId: "subject-1",
    });
  });
});

describe("useUpdateQualification", () => {
  it("should update an existing qualification", async () => {
    const { result } = renderHook(
      () => useUpdateQualification("school-1", "teacher-1"),
      { wrapper: createWrapper() },
    );

    result.current.mutate({
      id: "qual-1",
      data: { qualificationLevel: "SECONDARY" },
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toMatchObject({
      qualificationLevel: "SECONDARY",
    });
  });
});

describe("useDeleteQualification", () => {
  it("should delete a qualification", async () => {
    const { result } = renderHook(
      () => useDeleteQualification("school-1", "teacher-1"),
      { wrapper: createWrapper() },
    );

    result.current.mutate("qual-1");

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });
});

// ============================================================================
// Availability Hooks Tests
// ============================================================================

describe("useAvailability", () => {
  it("should fetch availability for a teacher", async () => {
    const { result } = renderHook(
      () => useAvailability("school-1", "teacher-1"),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockAvailability);
  });

  it("should not fetch when schoolId or teacherId is undefined", () => {
    const { result: result1 } = renderHook(
      () => useAvailability(undefined, "teacher-1"),
      { wrapper: createWrapper() },
    );

    expect(result1.current.isLoading).toBe(false);

    const { result: result2 } = renderHook(
      () => useAvailability("school-1", undefined),
      { wrapper: createWrapper() },
    );

    expect(result2.current.isLoading).toBe(false);
  });
});

describe("useAvailabilityEntry", () => {
  it("should fetch a single availability entry", async () => {
    const { result } = renderHook(
      () => useAvailabilityEntry("school-1", "teacher-1", "avail-1"),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockAvailabilityDetail);
  });

  it("should not fetch when any id is undefined", () => {
    const { result } = renderHook(
      () => useAvailabilityEntry("school-1", "teacher-1", undefined),
      { wrapper: createWrapper() },
    );

    expect(result.current.isLoading).toBe(false);
  });
});

describe("useCreateAvailability", () => {
  it("should create a new availability entry", async () => {
    const { result } = renderHook(
      () => useCreateAvailability("school-1", "teacher-1"),
      { wrapper: createWrapper() },
    );

    result.current.mutate({
      dayOfWeek: 0,
      period: 3,
      availabilityType: "AVAILABLE",
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toMatchObject({
      id: "new-avail-id",
      dayOfWeek: 0,
      period: 3,
    });
  });
});

describe("useUpdateAvailability", () => {
  it("should update an existing availability entry", async () => {
    const { result } = renderHook(
      () => useUpdateAvailability("school-1", "teacher-1"),
      { wrapper: createWrapper() },
    );

    result.current.mutate({
      id: "avail-1",
      data: { availabilityType: "PREFERRED" },
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toMatchObject({
      availabilityType: "PREFERRED",
    });
  });
});

describe("useDeleteAvailability", () => {
  it("should delete an availability entry", async () => {
    const { result } = renderHook(
      () => useDeleteAvailability("school-1", "teacher-1"),
      { wrapper: createWrapper() },
    );

    result.current.mutate("avail-1");

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });
});
