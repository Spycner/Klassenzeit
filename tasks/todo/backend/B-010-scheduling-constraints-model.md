# B-010: Timefold Planning Domain Model

## Description

Create the Timefold planning domain model for the timetabling solver. This involves creating separate planning POJOs (not JPA entities) that represent the optimization problem.

**Key Decision**: Separate planning domain from JPA entities per Timefold best practices. This avoids lazy loading issues and keeps concerns cleanly separated.

## Acceptance Criteria

- [ ] Add Timefold dependency to `build.gradle.kts`:
  ```kotlin
  implementation("ai.timefold.solver:timefold-solver-spring-boot-starter")
  testImplementation("ai.timefold.solver:timefold-solver-test")
  ```
- [ ] Create planning domain classes in `solver/domain/`:
  - [ ] `PlanningLesson.java` - @PlanningEntity with @PlanningVariable for timeSlot and room
  - [ ] `PlanningTimeSlot.java` - Problem fact (dayOfWeek, period, startTime, endTime, isBreak)
  - [ ] `PlanningRoom.java` - Problem fact (id, name, capacity, features)
  - [ ] `PlanningTeacher.java` - Problem fact (id, fullName, maxHoursPerWeek, blockedSlots, preferredSlots, qualifiedSubjectIds)
  - [ ] `PlanningSchoolClass.java` - Problem fact (id, name, gradeLevel, studentCount)
  - [ ] `PlanningSubject.java` - Problem fact (id, name)
  - [ ] `Timetable.java` - @PlanningSolution with @PlanningScore (HardSoftScore)
- [ ] Create `TimetableMapper.java` in `solver/mapper/`:
  - [ ] Convert JPA entities to planning domain
  - [ ] Apply solution back to JPA entities

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
