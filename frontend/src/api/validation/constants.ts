/**
 * Validation constants matching backend constraints
 */

export const VALIDATION = {
  // String lengths
  NAME_SHORT: { MIN: 1, MAX: 20 }, // SchoolClass name
  NAME_MEDIUM: { MIN: 1, MAX: 50 }, // Room, SchoolYear names, school type
  NAME_LONG: { MIN: 1, MAX: 100 }, // Teacher names, Subject, Term, building
  NAME_EXTRA: { MIN: 1, MAX: 255 }, // School name, email
  ABBREVIATION_SHORT: { MIN: 1, MAX: 5 }, // Teacher abbreviation
  ABBREVIATION_MEDIUM: { MIN: 1, MAX: 10 }, // Subject abbreviation
  SLUG: { MIN: 1, MAX: 100, PATTERN: /^[a-z0-9-]+$/ },
  COLOR_HEX: { MAX: 7 },
  TIMEZONE: { MAX: 50 },
  LABEL: { MAX: 100 }, // TimeSlot label

  // Numeric ranges
  GRADE_LEVEL: { MIN: 1, MAX: 13 },
  ROOM_CAPACITY: { MIN: 1 },
  HOURS_PER_WEEK: { MIN: 1, MAX: 50 },
  STUDENT_COUNT: { MIN: 1, MAX: 100 },
  DAY_OF_WEEK: { MIN: 0, MAX: 4 },
  PERIOD: { MIN: 1, MAX: 10 },
} as const;
