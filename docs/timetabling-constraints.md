# Timetabling Constraints

This document describes the constraints enforced by the Timefold solver when generating school timetables.

## Overview

The timetabling solver uses constraint-based optimization to find valid schedules. Constraints are divided into two categories:

- **Hard Constraints**: Must be satisfied for a valid solution. Violations make the timetable unusable.
- **Soft Constraints**: Should be satisfied when possible. Violations are minimized to improve quality.

## Hard Constraints

Hard constraints ensure the basic validity of a timetable. A solution with any hard constraint violations is considered infeasible.

### 1. Teacher Conflict

**Rule**: A teacher cannot teach two lessons at the same time.

```
If two lessons have the same teacher AND same time slot AND overlapping week patterns
→ VIOLATION (1 hard penalty)
```

**Week Pattern Logic**:
- `EVERY` conflicts with `EVERY`, `A`, and `B`
- `A` conflicts with `A` and `EVERY`
- `B` conflicts with `B` and `EVERY`
- `A` does NOT conflict with `B` (they occur in different weeks)

### 2. Room Conflict

**Rule**: A room cannot host two lessons at the same time.

```
If two lessons have the same room AND same time slot AND overlapping week patterns
→ VIOLATION (1 hard penalty)
```

Note: Lessons without an assigned room (room = null) do not trigger this constraint.

### 3. Class Conflict

**Rule**: A class cannot have two lessons at the same time.

```
If two lessons have the same school class AND same time slot AND overlapping week patterns
→ VIOLATION (1 hard penalty)
```

### 4. Teacher Availability

**Rule**: A teacher cannot be scheduled when they are blocked.

```
If a lesson's teacher is BLOCKED at the lesson's time slot
→ VIOLATION (1 hard penalty)
```

Teacher availability is defined per `(dayOfWeek, period)` combination. Availability can be:
- **Global**: Applies to all terms (e.g., part-time teacher always unavailable on Fridays)
- **Term-specific**: Applies to a specific term only

### 5. Room Capacity

**Rule**: A room must have sufficient capacity for the class.

```
If room capacity < class student count
→ VIOLATION (1 hard penalty)
```

Note: This constraint is skipped when:
- Room is not assigned (null)
- Room capacity is not specified (null)
- Class student count is not specified (null)

### 6. Teacher Qualification

**Rule**: A teacher must be qualified to teach the subject at the class's grade level.

```
If teacher is NOT qualified for (subjectId, gradeLevel)
→ VIOLATION (1 hard penalty)
```

Teacher qualifications are stored in `TeacherSubjectQualification` with:
- `subject_id`: The subject the teacher can teach
- `can_teach_grades`: Array of grade levels (e.g., `{1, 2, 3, 4}`)

## Soft Constraints

Soft constraints optimize the quality of the timetable. The solver minimizes soft constraint violations while respecting all hard constraints.

### 1. Teacher Preferred Slots

**Rule**: Schedule teachers in their preferred time slots when possible.

```
If a lesson is scheduled in a teacher's PREFERRED time slot
→ REWARD (+1 soft)
```

Teachers can mark certain `(dayOfWeek, period)` combinations as preferred for scheduling.

### 2. Minimize Teacher Gaps

**Rule**: Avoid gaps between lessons for the same teacher on the same day.

```
If teacher has lessons at period P1 and P3 on the same day (gap of 1 period)
→ PENALTY (-1 soft)

If teacher has lessons at period P1 and P4 on the same day (gap of 2 periods)
→ PENALTY (-2 soft)
```

The penalty increases with the size of the gap: `penalty = (period2 - period1 - 1)`.

Note: Gaps between A-week and B-week lessons are not penalized (they don't actually occur on the same day).

### 3. Subject Distribution

**Rule**: Avoid scheduling multiple lessons of the same subject on the same day for a class.

```
If a class has two Math lessons on Monday
→ PENALTY (-2 soft)
```

This encourages spreading subjects throughout the week for better learning outcomes.

### 4. Class Teacher First Period

**Rule**: Prefer the class teacher to teach period 1 for their class.

```
If period 1 lesson is taught by someone other than the class teacher
→ PENALTY (-1 soft)
```

This allows class teachers to start the day with their class (for announcements, etc.).

## Constraint Weights Summary

| Constraint | Type | Weight |
|------------|------|--------|
| Teacher conflict | Hard | 1 |
| Room conflict | Hard | 1 |
| Class conflict | Hard | 1 |
| Teacher availability | Hard | 1 |
| Room capacity | Hard | 1 |
| Teacher qualification | Hard | 1 |
| Teacher preferred slots | Soft | +1 (reward) |
| Teacher gaps | Soft | -1 per period |
| Subject distribution | Soft | -2 |
| Class teacher first period | Soft | -1 |

## Score Interpretation

The solver produces a `HardSoftScore`:

- **Hard score**: Count of hard constraint violations (must be 0 for valid solution)
- **Soft score**: Sum of soft constraint penalties/rewards (higher is better)

Example scores:
- `0hard/-15soft` = Valid solution with some soft violations
- `0hard/+5soft` = Valid solution with net positive soft score (many preferred slots used)
- `-3hard/-10soft` = Invalid solution (3 hard violations)

## Future Enhancements

The following constraints are planned for future implementation:

- **Room Features**: Require specific room features for certain subjects (e.g., science needs a lab)
- **Multi-period Blocks**: Support double lessons (two consecutive periods)
- **Teacher Max Hours**: Penalize exceeding teacher's max hours per week
- **Configurable Weights**: Allow schools to customize constraint weights via settings

## Implementation Details

The constraints are implemented in:
- `TimetableConstraintProvider.java` - Constraint definitions using Timefold Constraint Streams
- `TimetableConstraintProviderTest.java` - Unit tests for individual constraints
- `TimetableSolverIntegrationTest.java` - Integration tests with realistic scenarios

See also:
- [Data Model](data-model.md) - Entity relationships and database schema
- [Timefold Documentation](https://docs.timefold.ai/) - Solver framework documentation
