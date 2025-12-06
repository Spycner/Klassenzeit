/**
 * Hook for checking school access permissions
 *
 * Provides permission checks for school-related operations based on
 * the current user's platform admin status and school memberships.
 */

import { useCurrentUser } from "@/api";

/**
 * Hook to check school access permissions.
 *
 * @param schoolId - Optional school ID for school-specific checks
 * @returns Permission check functions and flags
 */
export function useSchoolAccess(schoolId?: string) {
  const { data: user, isLoading } = useCurrentUser();

  const isPlatformAdmin = user?.isPlatformAdmin ?? false;

  /**
   * Check if user is a school admin for the given school.
   * Platform admins are always considered school admins.
   */
  const isSchoolAdmin = (id?: string): boolean => {
    if (isPlatformAdmin) return true;
    const targetId = id ?? schoolId;
    if (!targetId || !user?.schools) return false;
    return user.schools.some(
      (s) => s.schoolId === targetId && s.role === "SCHOOL_ADMIN",
    );
  };

  /**
   * Check if user has any of the given roles for a school.
   * Platform admins always return true.
   */
  const hasSchoolRole = (
    id: string | undefined,
    ...roles: Array<"SCHOOL_ADMIN" | "PLANNER" | "TEACHER" | "VIEWER">
  ): boolean => {
    if (isPlatformAdmin) return true;
    const targetId = id ?? schoolId;
    if (!targetId || !user?.schools) return false;
    return user.schools.some(
      (s) => s.schoolId === targetId && roles.includes(s.role),
    );
  };

  /**
   * Check if user can access a school (has any membership or is platform admin).
   */
  const canAccessSchool = (id?: string): boolean => {
    if (isPlatformAdmin) return true;
    const targetId = id ?? schoolId;
    if (!targetId || !user?.schools) return false;
    return user.schools.some((s) => s.schoolId === targetId);
  };

  return {
    /** User profile is still loading */
    isLoading,

    /** User is a platform admin */
    isPlatformAdmin,

    /** Only platform admins can create schools */
    canCreateSchool: isPlatformAdmin,

    /** Check if user is school admin for specific school */
    isSchoolAdmin,

    /** Check if user can edit school (platform admin or school admin) */
    canEditSchool: (id?: string) => isSchoolAdmin(id),

    /** Check if user can delete school (platform admin or school admin) */
    canDeleteSchool: (id?: string) => isSchoolAdmin(id),

    /** Check if user can manage school members (platform admin or school admin) */
    canManageMembers: (id?: string) => isSchoolAdmin(id),

    /** Check if user can access a school */
    canAccessSchool,

    /** Check if user has specific role(s) in a school */
    hasSchoolRole,
  };
}
