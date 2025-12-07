import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SchoolMembership } from "@/auth/types";

// Import actual module, bypassing the global mock in setup.ts
const { SchoolProvider, useSchoolContext } =
  await vi.importActual<typeof import("./SchoolContext")>("./SchoolContext");

const STORAGE_KEY = "klassenzeit_current_school_id";

// Mock useCurrentUser hook
const mockUseCurrentUser = vi.fn();
vi.mock("@/api/hooks/use-current-user", () => ({
  useCurrentUser: () => mockUseCurrentUser(),
}));

// Mock queryClient
vi.mock("@/api", () => ({
  queryClient: {
    invalidateQueries: vi.fn(),
  },
}));

const mockSchool1: SchoolMembership = {
  schoolId: "school-1",
  schoolName: "School One",
  role: "TEACHER",
};

const mockSchool2: SchoolMembership = {
  schoolId: "school-2",
  schoolName: "School Two",
  role: "SCHOOL_ADMIN",
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("SchoolContext", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe("initialization", () => {
    it("initializes with first school when localStorage is empty", async () => {
      mockUseCurrentUser.mockReturnValue({
        data: { schools: [mockSchool1, mockSchool2] },
        isLoading: false,
      });

      const { result } = renderHook(() => useSchoolContext(), {
        wrapper: ({ children }) => <SchoolProvider>{children}</SchoolProvider>,
      });

      await waitFor(() => {
        expect(result.current.currentSchool).toEqual(mockSchool1);
      });

      expect(result.current.userSchools).toEqual([mockSchool1, mockSchool2]);
      expect(result.current.isLoading).toBe(false);
    });

    it("restores school from localStorage when valid", async () => {
      localStorage.setItem(STORAGE_KEY, "school-2");

      mockUseCurrentUser.mockReturnValue({
        data: { schools: [mockSchool1, mockSchool2] },
        isLoading: false,
      });

      const { result } = renderHook(() => useSchoolContext(), {
        wrapper: ({ children }) => <SchoolProvider>{children}</SchoolProvider>,
      });

      await waitFor(() => {
        expect(result.current.currentSchool).toEqual(mockSchool2);
      });

      // localStorage should remain intact
      expect(localStorage.getItem(STORAGE_KEY)).toBe("school-2");
    });

    it("clears invalid localStorage and uses first school", async () => {
      localStorage.setItem(STORAGE_KEY, "invalid-school-id");

      mockUseCurrentUser.mockReturnValue({
        data: { schools: [mockSchool1, mockSchool2] },
        isLoading: false,
      });

      const { result } = renderHook(() => useSchoolContext(), {
        wrapper: ({ children }) => <SchoolProvider>{children}</SchoolProvider>,
      });

      await waitFor(() => {
        expect(result.current.currentSchool).toEqual(mockSchool1);
      });

      // Invalid localStorage should be cleared
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it("clears localStorage when user has no schools", async () => {
      localStorage.setItem(STORAGE_KEY, "some-old-school-id");

      mockUseCurrentUser.mockReturnValue({
        data: { schools: [] },
        isLoading: false,
      });

      const { result } = renderHook(() => useSchoolContext(), {
        wrapper: ({ children }) => <SchoolProvider>{children}</SchoolProvider>,
      });

      await waitFor(() => {
        expect(result.current.currentSchool).toBeNull();
      });

      // localStorage should be cleared when user has no schools
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
      expect(result.current.userSchools).toEqual([]);
    });

    it("returns null currentSchool when user data is not loaded", () => {
      mockUseCurrentUser.mockReturnValue({
        data: undefined,
        isLoading: true,
      });

      const { result } = renderHook(() => useSchoolContext(), {
        wrapper: ({ children }) => <SchoolProvider>{children}</SchoolProvider>,
      });

      expect(result.current.currentSchool).toBeNull();
      expect(result.current.isLoading).toBe(true);
    });
  });

  describe("setCurrentSchool", () => {
    it("updates localStorage when school is changed", async () => {
      mockUseCurrentUser.mockReturnValue({
        data: { schools: [mockSchool1, mockSchool2] },
        isLoading: false,
      });

      const { result } = renderHook(() => useSchoolContext(), {
        wrapper: ({ children }) => <SchoolProvider>{children}</SchoolProvider>,
      });

      await waitFor(() => {
        expect(result.current.currentSchool).toEqual(mockSchool1);
      });

      act(() => {
        result.current.setCurrentSchool(mockSchool2);
      });

      expect(result.current.currentSchool).toEqual(mockSchool2);
      expect(localStorage.getItem(STORAGE_KEY)).toBe("school-2");
    });
  });

  describe("error handling", () => {
    it("throws error when useSchoolContext is used outside provider", () => {
      // Suppress console.error for this test
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      expect(() => {
        renderHook(() => useSchoolContext(), {
          wrapper: createWrapper(),
        });
      }).toThrow("useSchoolContext must be used within SchoolProvider");

      consoleSpy.mockRestore();
    });
  });
});
