# B-010: Timefold Planning Domain Model

## Description

Create the Timefold planning domain model for the timetabling solver. This involves creating separate planning POJOs (not JPA entities) that represent the optimization problem.

**Key Decision**: Separate planning domain from JPA entities per Timefold best practices. This avoids lazy loading issues and keeps concerns cleanly separated.

## Acceptance Criteria

- [x] Add Timefold dependency to `build.gradle.kts`:
  ```kotlin
  implementation("ai.timefold.solver:timefold-solver-spring-boot-starter:1.28.0")
  testImplementation("ai.timefold.solver:timefold-solver-test:1.28.0")
  ```
- [x] Create planning domain classes in `solver/domain/`:
  - [x] `PlanningLesson.java` - @PlanningEntity with @PlanningVariable for timeSlot and room
  - [x] `PlanningTimeSlot.java` - Problem fact (dayOfWeek, period, startTime, endTime, isBreak)
  - [x] `PlanningRoom.java` - Problem fact (id, name, capacity, features)
  - [x] `PlanningTeacher.java` - Problem fact (id, fullName, maxHoursPerWeek, blockedSlots, preferredSlots, qualifiedSubjectIds)
  - [x] `PlanningSchoolClass.java` - Problem fact (id, name, gradeLevel, studentCount)
  - [x] `PlanningSubject.java` - Problem fact (id, name)
  - [x] `Timetable.java` - @PlanningSolution with @PlanningScore (HardSoftScore)
- [x] Create `TimetableMapper.java` in `solver/mapper/`:
  - [x] Convert JPA entities to planning domain
  - [x] Apply solution back to JPA entities

## Technical Details

### PlanningLesson (Planning Entity)
```java
@PlanningEntity
public class PlanningLesson {
    @PlanningId
    private UUID id;

    // Fixed (not changed by solver)
    private PlanningSchoolClass schoolClass;
    private PlanningTeacher teacher;
    private PlanningSubject subject;
    private WeekPattern weekPattern;

    // Planning variables (assigned by solver)
    @PlanningVariable
    private PlanningTimeSlot timeSlot;

    @PlanningVariable
    private PlanningRoom room;
}
```

### Timetable (Planning Solution)
```java
@PlanningSolution
public class Timetable {
    private UUID termId;

    @ProblemFactCollectionProperty
    @ValueRangeProvider
    private List<PlanningTimeSlot> timeSlots;

    @ProblemFactCollectionProperty
    @ValueRangeProvider
    private List<PlanningRoom> rooms;

    @ProblemFactCollectionProperty
    private List<PlanningTeacher> teachers;

    @ProblemFactCollectionProperty
    private List<PlanningSchoolClass> schoolClasses;

    @ProblemFactCollectionProperty
    private List<PlanningSubject> subjects;

    @PlanningEntityCollectionProperty
    private List<PlanningLesson> lessons;

    @PlanningScore
    private HardSoftScore score;
}
```

### Package Structure
```
solver/
  domain/
    PlanningLesson.java
    PlanningTimeSlot.java
    PlanningRoom.java
    PlanningTeacher.java
    PlanningSchoolClass.java
    PlanningSubject.java
    Timetable.java
  mapper/
    TimetableMapper.java
```

## Dependencies

None

## Blocks

- [B-011: Timetabling Algorithm](B-011-timetabling-algorithm.md)

## Notes

- Teacher is fixed on the lesson (pre-assigned based on subject/class requirements)
- TimeSlot and Room are the planning variables the solver assigns
- WeekPattern (EVERY, A_WEEK, B_WEEK) affects conflict detection between lessons
- Use HardSoftScore for two-level scoring (hard constraints must be satisfied, soft are optimized)

## Completion Notes

**Completed**: 2025-12-01

### What Was Implemented

1. **Dependencies** - Added Timefold Solver 1.28.0 to build.gradle.kts
2. **Planning Domain Classes** (in `solver/domain/`):
   - `PlanningLesson.java` - Main planning entity with TimeSlot and Room as planning variables
   - `PlanningTimeSlot.java` - Problem fact with `getDayPeriodKey()` for availability lookups
   - `PlanningRoom.java` - Problem fact with `hasFeatures()` helper
   - `PlanningTeacher.java` - Problem fact with denormalized availability (blockedSlots, preferredSlots) and qualifications
   - `PlanningSchoolClass.java` - Problem fact with classTeacherId reference
   - `PlanningSubject.java` - Problem fact
   - `Timetable.java` - Planning solution with HardSoftScore
3. **TimetableMapper.java** (in `solver/mapper/`) - Bidirectional conversion between JPA entities and planning domain
4. **TimetableConstraintProvider.java** (in `solver/constraint/`) - Placeholder required by Timefold autoconfiguration
5. **Tests**:
   - `PlanningDomainTest.java` - Unit tests for domain helper methods
   - `TimetableMapperTest.java` - Integration tests for JPA-to-planning conversion

### Key Decisions

- **Denormalized teacher availability**: Teacher availability is converted to `Set<String>` keys like "0-1" (Monday period 1) for O(1) constraint lookups
- **WeekPattern overlap logic**: `weekPatternsOverlap()` method in PlanningLesson handles A/B week rotation correctly
- **Placeholder ConstraintProvider**: Created to satisfy Timefold autoconfiguration; actual constraints will be in B-011
- **Filtering in mapper**: Inactive rooms/teachers and break timeslots are filtered out during conversion

### Issues Encountered

- Timefold version needed to be explicit (1.28.0) since there's no BOM
- PMD required refactoring to avoid loops with object instantiation (used streams instead)
- Timefold autoconfiguration requires a ConstraintProvider bean even before constraints are implemented
