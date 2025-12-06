/**
 * Common types and enums shared across the API
 */

/** Teacher qualification level for a subject */
export type QualificationLevel = "PRIMARY" | "SECONDARY" | "SUBSTITUTE";

/** Teacher availability type for scheduling constraints */
export type AvailabilityType = "AVAILABLE" | "BLOCKED" | "PREFERRED";

/** Week pattern for A/B week rotation */
export type WeekPattern = "EVERY" | "A" | "B";

/** Day of week (0-4 representing Monday-Friday) */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4;

/** Period number (dynamic based on school's TimeSlot configuration) */
export type Period = number;

/** Grade level (1-13) */
export type GradeLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

/** Base timestamp fields present on all entities */
export interface Timestamps {
  createdAt: string;
  updatedAt: string;
}

/** Generic paginated response (if needed in future) */
export interface PaginatedResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  page: number;
  size: number;
}
