package com.klassenzeit.klassenzeit.common;

/** Availability status for teacher scheduling. */
public enum AvailabilityType {
  /** Teacher is available to teach during this slot. */
  AVAILABLE,

  /** Teacher cannot teach during this slot (hard constraint). */
  BLOCKED,

  /** Teacher prefers to teach during this slot (soft constraint). */
  PREFERRED
}
