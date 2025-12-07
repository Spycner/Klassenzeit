import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";

import { queryClient } from "@/api";
import { useCurrentUser } from "@/api/hooks/use-current-user";
import type { SchoolMembership } from "@/auth/types";

const STORAGE_KEY = "klassenzeit_current_school_id";

/**
 * School context value type
 */
export interface SchoolContextValue {
  /** Currently selected school (null if no schools or not loaded yet) */
  currentSchool: SchoolMembership | null;
  /** Set the current school */
  setCurrentSchool: (school: SchoolMembership) => void;
  /** All schools the user belongs to */
  userSchools: SchoolMembership[];
  /** Whether the user profile is still loading */
  isLoading: boolean;
}

const SchoolContext = createContext<SchoolContextValue | null>(null);

interface SchoolProviderProps {
  children: ReactNode;
}

/**
 * Provider for school selection context.
 * Manages the currently selected school for multi-school users.
 */
export function SchoolProvider({ children }: SchoolProviderProps) {
  const { data: user, isLoading: isUserLoading } = useCurrentUser();
  const [currentSchool, setCurrentSchoolState] =
    useState<SchoolMembership | null>(null);

  // Initialize from localStorage or first school when user data loads
  useEffect(() => {
    if (!user) return;

    if (user.schools.length > 0) {
      const savedSchoolId = localStorage.getItem(STORAGE_KEY);
      const savedSchool = savedSchoolId
        ? user.schools.find((s) => s.schoolId === savedSchoolId)
        : null;

      // Clear invalid localStorage value (e.g., user lost access to school)
      if (savedSchoolId && !savedSchool) {
        localStorage.removeItem(STORAGE_KEY);
      }

      setCurrentSchoolState(savedSchool ?? user.schools[0]);
    } else {
      // User has no schools - clear any stale localStorage
      localStorage.removeItem(STORAGE_KEY);
      setCurrentSchoolState(null);
    }
  }, [user]);

  const setCurrentSchool = (school: SchoolMembership) => {
    setCurrentSchoolState(school);
    localStorage.setItem(STORAGE_KEY, school.schoolId);

    // Invalidate all school-scoped queries to refetch with new context
    // This ensures data is refreshed when switching schools
    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey;
        // Invalidate queries that include a schoolId parameter
        return (
          Array.isArray(key) &&
          key.some((k) => k === "schools" || k === school.schoolId)
        );
      },
    });
  };

  return (
    <SchoolContext.Provider
      value={{
        currentSchool,
        setCurrentSchool,
        userSchools: user?.schools ?? [],
        isLoading: isUserLoading,
      }}
    >
      {children}
    </SchoolContext.Provider>
  );
}

/**
 * Hook to access the school context.
 * Must be used within a SchoolProvider.
 */
export function useSchoolContext(): SchoolContextValue {
  const context = useContext(SchoolContext);
  if (!context) {
    throw new Error("useSchoolContext must be used within SchoolProvider");
  }
  return context;
}
