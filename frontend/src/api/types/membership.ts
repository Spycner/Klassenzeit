/**
 * School membership types for managing user access to schools
 */

import type { Timestamps } from "./common";

// ============================================================================
// School Role
// ============================================================================

/** Role a user can have within a school */
export type SchoolRole = "SCHOOL_ADMIN" | "PLANNER" | "TEACHER" | "VIEWER";

// ============================================================================
// Membership
// ============================================================================

export interface CreateMembershipRequest {
  userId: string;
  role: SchoolRole;
  linkedTeacherId?: string;
}

export interface UpdateMembershipRequest {
  role: SchoolRole;
  linkedTeacherId?: string;
}

export interface MembershipResponse extends Timestamps {
  id: string;
  userId: string;
  userDisplayName: string;
  userEmail: string;
  schoolId: string;
  role: SchoolRole;
  linkedTeacherId: string | null;
  linkedTeacherName: string | null;
  isActive: boolean;
  grantedById: string;
  grantedByName: string;
  grantedAt: string;
}

export interface MembershipSummary {
  id: string;
  userId: string;
  userDisplayName: string;
  userEmail: string;
  role: SchoolRole;
  isActive: boolean;
}
