# B-014: Fix N+1 Queries in Class/Teacher Listing

## Description

Two repository methods load `SchoolClass` entities but access the lazy-loaded `classTeacher` relationship during DTO mapping, causing N+1 queries:
- `findBySchoolId()` used by `SchoolClassService.findAllBySchool()`
- `findByClassTeacherId()` used by `TeacherService.getClassTeacherAssignments()`

## Acceptance Criteria

- [x] Add eager fetch for `classTeacher` in `findBySchoolId()`
- [x] Add eager fetch for `classTeacher` in `findByClassTeacherId()`
- [x] All existing tests pass

## Context

- **Found by:** code-quality subagent
- **Priority:** MEDIUM
- **Effort:** Small
- **Related files:**
  - `backend/src/main/java/com/klassenzeit/klassenzeit/schoolclass/SchoolClassRepository.java`
  - `backend/src/main/java/com/klassenzeit/klassenzeit/schoolclass/SchoolClass.java` (entity with lazy `classTeacher`)

## Completion Notes

**Completed:** 2025-12-08

**Solution implemented:** Added `@EntityGraph(attributePaths = {"classTeacher"})` annotations

**Changes made:**
1. `SchoolClassRepository.java` - Added `@EntityGraph` to `findBySchoolId()` and `findByClassTeacherId()` methods

This ensures Hibernate loads the `classTeacher` relationship in the same query using a LEFT JOIN, eliminating the N+1 query problem when mapping to `SchoolClassSummary`.
