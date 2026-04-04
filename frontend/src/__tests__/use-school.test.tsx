import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { useSchool } from "@/hooks/use-school";
import { SchoolProvider } from "@/providers/school-provider";

function Wrapper({ children }: { children: ReactNode }) {
  return <SchoolProvider>{children}</SchoolProvider>;
}

describe("useSchool", () => {
  it("starts with null selectedSchoolId", () => {
    const { result } = renderHook(() => useSchool(), { wrapper: Wrapper });
    expect(result.current.selectedSchoolId).toBeNull();
  });

  it("updates selectedSchoolId via selectSchool", () => {
    const { result } = renderHook(() => useSchool(), { wrapper: Wrapper });

    act(() => {
      result.current.selectSchool("school-123");
    });

    expect(result.current.selectedSchoolId).toBe("school-123");
  });

  it("clears selectedSchoolId when set to null", () => {
    const { result } = renderHook(() => useSchool(), { wrapper: Wrapper });

    act(() => {
      result.current.selectSchool("school-123");
    });
    expect(result.current.selectedSchoolId).toBe("school-123");

    act(() => {
      result.current.selectSchool(null);
    });
    expect(result.current.selectedSchoolId).toBeNull();
  });
});
