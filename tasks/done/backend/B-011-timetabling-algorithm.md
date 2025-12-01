# B-011: Timefold Constraint Definitions

## Description

Implement the constraint provider for the Timefold solver. This defines all hard and soft constraints that govern valid timetable generation.

## Acceptance Criteria

- [x] Implement constraints in existing `TimetableConstraintProvider.java` (placeholder created in B-010)
- [x] Implement hard constraints:
  - [x] Teacher conflict - no teacher teaches two lessons at the same time
  - [x] Room conflict - no room hosts two lessons at the same time
  - [x] Class conflict - no class has two lessons at the same time
  - [x] Teacher availability - teacher must not be blocked at the timeslot
  - [x] Room capacity - room must fit the class size
  - [x] Teacher qualification - teacher must be qualified to teach the subject
- [x] Implement soft constraints:
  - [x] Teacher preferred slots - reward lessons in preferred times
  - [x] Minimize teacher gaps - penalize gaps between lessons on same day
  - [x] Subject distribution - avoid multiple lessons of same subject on same day
  - [x] Class teacher first period - prefer class teacher for period 1
- [x] Create `TimetableConstraintProviderTest.java` with unit tests using `ConstraintVerifier`

## Technical Details

### Constraint Provider Structure
```java
public class TimetableConstraintProvider implements ConstraintProvider {

    @Override
    public Constraint[] defineConstraints(ConstraintFactory factory) {
        return new Constraint[] {
            // Hard constraints
            teacherConflict(factory),
            roomConflict(factory),
            schoolClassConflict(factory),
            teacherAvailability(factory),
            roomCapacity(factory),
            teacherQualification(factory),

            // Soft constraints
            teacherPreferredSlots(factory),
            minimizeTeacherGaps(factory),
            subjectDistribution(factory),
            classTeacherFirstPeriod(factory)
        };
    }
}
```

### Hard Constraint: Teacher Conflict
```java
Constraint teacherConflict(ConstraintFactory factory) {
    return factory
        .forEachUniquePair(PlanningLesson.class,
            Joiners.equal(PlanningLesson::getTimeSlot),
            Joiners.equal(PlanningLesson::getTeacher),
            Joiners.filtering((l1, l2) -> weekPatternsOverlap(l1, l2)))
        .penalize(HardSoftScore.ONE_HARD)
        .asConstraint("Teacher conflict");
}
```

### Hard Constraint: Room Capacity
```java
Constraint roomCapacity(ConstraintFactory factory) {
    return factory
        .forEach(PlanningLesson.class)
        .filter(lesson -> lesson.getRoom() != null)
        .filter(lesson -> lesson.getRoom().getCapacity() != null)
        .filter(lesson -> lesson.getSchoolClass().getStudentCount() != null)
        .filter(lesson -> lesson.getRoom().getCapacity()
            < lesson.getSchoolClass().getStudentCount())
        .penalize(HardSoftScore.ONE_HARD)
        .asConstraint("Room capacity");
}
```

### Soft Constraint: Minimize Teacher Gaps
```java
Constraint minimizeTeacherGaps(ConstraintFactory factory) {
    return factory
        .forEach(PlanningLesson.class)
        .filter(lesson -> lesson.getTimeSlot() != null)
        .join(PlanningLesson.class,
            Joiners.equal(PlanningLesson::getTeacher),
            Joiners.equal(lesson -> lesson.getTimeSlot().getDayOfWeek()),
            Joiners.lessThan(lesson -> lesson.getTimeSlot().getPeriod()))
        .filter((l1, l2) -> {
            int gap = l2.getTimeSlot().getPeriod() - l1.getTimeSlot().getPeriod();
            return gap > 1;
        })
        .penalize(HardSoftScore.ONE_SOFT,
            (l1, l2) -> l2.getTimeSlot().getPeriod() - l1.getTimeSlot().getPeriod() - 1)
        .asConstraint("Teacher gap");
}
```

### Week Pattern Overlap Logic
```java
private boolean weekPatternsOverlap(PlanningLesson l1, PlanningLesson l2) {
    WeekPattern p1 = l1.getWeekPattern();
    WeekPattern p2 = l2.getWeekPattern();
    // EVERY conflicts with everything
    // A only conflicts with A or EVERY
    // B only conflicts with B or EVERY
    return p1 == WeekPattern.EVERY || p2 == WeekPattern.EVERY || p1 == p2;
}
```

### Testing with ConstraintVerifier
```java
@Test
void teacherConflict() {
    PlanningTeacher teacher = new PlanningTeacher(UUID.randomUUID(), "Teacher");
    PlanningTimeSlot slot = new PlanningTimeSlot(...);

    PlanningLesson lesson1 = new PlanningLesson(..., teacher, slot);
    PlanningLesson lesson2 = new PlanningLesson(..., teacher, slot);

    constraintVerifier.verifyThat(TimetableConstraintProvider::teacherConflict)
        .given(lesson1, lesson2)
        .penalizesBy(1);
}
```

## Dependencies

- [B-010: Timefold Planning Domain Model](B-010-scheduling-constraints-model.md)

## Blocks

- [B-012: Solver Service & API](B-012-schedule-validation.md)

## Notes

### From B-010 Implementation

The following helper methods are already available in the planning domain classes:

**PlanningLesson:**
- `weekPatternsOverlap(PlanningLesson other)` - already implements the week pattern conflict logic

**PlanningTeacher:**
- `isBlockedAt(PlanningTimeSlot)` - returns true if teacher is blocked at that slot
- `prefersSlot(PlanningTimeSlot)` - returns true if teacher prefers that slot
- `isQualifiedFor(UUID subjectId, short gradeLevel)` - checks teacher qualification

**PlanningRoom:**
- `hasFeatures(Set<String>)` - checks if room has required features

**PlanningTimeSlot:**
- `getDayPeriodKey()` - returns "dayOfWeek-period" string for lookups

**PlanningSchoolClass:**
- `getClassTeacherId()` - returns UUID of class teacher (for first period constraint)

### Constraint Weights (Soft)
Default weights, can be tuned later:
- Teacher preferred slots: +1 soft per match
- Teacher gaps: -1 soft per period gap
- Subject distribution: -2 soft per same-day duplicate
- Class teacher first period: -1 soft if not class teacher

### Future Enhancements
- User-configurable constraint weights via database
- Room feature requirements per subject (e.g., science needs lab)
- Multi-period blocks (e.g., double lessons)

## Completion Notes

**Completed**: 2025-12-01

### What Was Implemented

1. **TimetableConstraintProvider.java** - Full implementation of all 10 constraints:
   - 6 hard constraints: teacherConflict, roomConflict, schoolClassConflict, teacherAvailability, roomCapacity, teacherQualification
   - 4 soft constraints: teacherPreferredSlots, minimizeTeacherGaps, subjectDistribution, classTeacherFirstPeriod

2. **TimetableConstraintProviderTest.java** - 38 unit tests covering:
   - All hard constraints with positive and negative cases
   - All soft constraints with reward/penalty verification
   - Edge cases: null values, A/B week patterns, etc.

3. **TimetableSolverIntegrationTest.java** - 5 integration tests verifying:
   - Solver finds valid solutions for realistic school scenarios
   - Teacher blocked slots are respected
   - Room capacity constraints are enforced
   - Teacher qualifications are validated
   - A/B week patterns don't create false conflicts

4. **Documentation** - `docs/timetabling-constraints.md`:
   - Detailed explanation of all constraints
   - Week pattern logic
   - Score interpretation guide
   - Constraint weights summary

### Key Decisions

- Used `forEachUniquePair` for conflict constraints to avoid duplicate counting
- Week pattern overlap check uses existing `weekPatternsOverlap()` helper from PlanningLesson
- Subject distribution penalizes by 2 (higher than other soft constraints) to encourage spreading
- Null checks added for optional fields (room, capacity, studentCount) to avoid NPEs

### Test Results

All 43 tests pass (38 unit + 5 integration):
```
./gradlew check - BUILD SUCCESSFUL
```
