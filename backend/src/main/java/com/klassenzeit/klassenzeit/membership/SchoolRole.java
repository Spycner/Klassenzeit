package com.klassenzeit.klassenzeit.membership;

/** Role that a user can have within a school. */
public enum SchoolRole {
  /** Full access to school - manage users, all CRUD operations. */
  SCHOOL_ADMIN,

  /** Manage resources (teachers, rooms, subjects, schedules). */
  PLANNER,

  /** View own schedule, manage own availability. */
  TEACHER,

  /** Read-only access to school data. */
  VIEWER
}
