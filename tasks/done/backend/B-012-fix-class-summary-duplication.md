# B-012: Fix Code Duplication in SchoolClassSummary Mapping

## Description

The `toClassSummary()` method in `TeacherService` duplicates the exact same mapping logic as `toSummary()` in `SchoolClassService`. This violates the DRY principle and creates maintenance risk where changes need to be made in two places.

## Acceptance Criteria

- [x] Extract SchoolClassSummary mapping to a shared location
- [x] Update SchoolClassService to use the shared mapper
- [x] Update TeacherService to use the shared mapper
- [x] Remove duplicate code
- [x] All existing tests pass
- [x] Add test for the shared mapper if needed

## Context

- **Found by:** code-quality subagent
- **Priority:** HIGH
- **Effort:** Small (< 1 hour)
- **Related files:**
  - `backend/src/main/java/com/klassenzeit/klassenzeit/teacher/TeacherService.java:169-178`
  - `backend/src/main/java/com/klassenzeit/klassenzeit/schoolclass/SchoolClassService.java:135-144`

## Completion Notes

**Completed:** 2025-12-08

**Solution implemented:** Option A - Static factory method on DTO

Added `SchoolClassSummary.fromEntity(SchoolClass c)` static method to the record.

**Changes made:**
1. `SchoolClassSummary.java` - Added `fromEntity()` static factory method
2. `SchoolClassService.java` - Replaced `this::toSummary` with `SchoolClassSummary::fromEntity`, removed private `toSummary()` method
3. `TeacherService.java` - Replaced `this::toClassSummary` with `SchoolClassSummary::fromEntity`, removed private `toClassSummary()` method and unused `SchoolClass` import

**Testing:** Existing tests in `SchoolClassServiceTest` cover the mapping behavior. No additional tests needed since the static factory method is implicitly tested through service tests.
