# B-011: Timetabling Algorithm

## Description
Evaluate and integrate a constraint solver for automatic timetable generation.

## Acceptance Criteria
- [ ] Evaluate solver options (Timefold, OR-Tools, custom)
- [ ] Define `@PlanningEntity` (Lesson with variable room/timeslot)
- [ ] Define `@PlanningSolution` (full timetable)
- [ ] Implement constraint providers
- [ ] Create solver configuration
- [ ] Build async solving with progress updates

## Dependencies
- [B-010: Scheduling Constraints Model](B-010-scheduling-constraints-model.md)

## Blocks
None

## Notes
### Solver Options
- **Timefold (formerly OptaPlanner)** - Java-native constraint solver, Apache licensed (Recommended)
- **OR-Tools** - Google's optimization suite
- **Custom greedy algorithm** - Simpler but less optimal

### Dependencies (if using Timefold)
```kotlin
implementation("ai.timefold.solver:timefold-solver-core:1.x.x")
implementation("ai.timefold.solver:timefold-solver-spring-boot-starter:1.x.x")
```
