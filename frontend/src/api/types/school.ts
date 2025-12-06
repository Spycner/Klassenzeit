/**
 * School-related types (School, SchoolYear, Term)
 */

import type { Timestamps } from "./common";

// ============================================================================
// School
// ============================================================================

export interface CreateSchoolRequest {
  name: string;
  slug: string;
  schoolType: string;
  minGrade: number;
  maxGrade: number;
  timezone?: string;
  settings?: string;
  /** The user ID of the initial school administrator (required) */
  initialAdminUserId: string;
}

export interface UpdateSchoolRequest {
  name: string;
  slug: string;
  schoolType: string;
  minGrade: number;
  maxGrade: number;
  timezone?: string;
  settings?: string;
}

export interface SchoolResponse extends Timestamps {
  id: string;
  name: string;
  slug: string;
  schoolType: string;
  minGrade: number;
  maxGrade: number;
  timezone: string | null;
  settings: string | null;
}

export interface SchoolSummary {
  id: string;
  name: string;
  slug: string;
  schoolType: string;
}

// ============================================================================
// School Year
// ============================================================================

export interface CreateSchoolYearRequest {
  name: string;
  startDate: string; // ISO date format YYYY-MM-DD
  endDate: string;
  isCurrent?: boolean;
}

export interface UpdateSchoolYearRequest {
  name: string;
  startDate: string;
  endDate: string;
  isCurrent?: boolean;
}

export interface SchoolYearResponse extends Timestamps {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
}

export interface SchoolYearSummary {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
}

// ============================================================================
// Term
// ============================================================================

export interface CreateTermRequest {
  name: string;
  startDate: string;
  endDate: string;
  isCurrent?: boolean;
}

export interface UpdateTermRequest {
  name: string;
  startDate: string;
  endDate: string;
  isCurrent?: boolean;
}

export interface TermResponse extends Timestamps {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
}

export interface TermSummary {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
}
