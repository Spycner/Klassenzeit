# B-002: Add Cascading Delete Tests

## Description
Verify that cascading deletes work correctly and no orphan records are left behind.

## Acceptance Criteria
- [x] Verify cascading deletes work correctly (school → teachers, classes, etc.)
- [x] Add integration tests to verify orphan records are not left behind
- [x] Test that deleting a school properly cascades to all related entities

## Dependencies
None

## Blocks
None

## Completion Notes

### What was implemented
Created `CascadingDeleteIntegrationTest.java` with comprehensive tests covering:

1. **SchoolDeletion** - Tests that deleting a school cascades to all related entities (SchoolYear, Term, Teacher, Subject, Room, SchoolClass, TimeSlot, lessons, qualifications, availabilities)
2. **TeacherDeletion** - Tests cascade to qualifications, availabilities, and lessons; also tests that SchoolClass.classTeacher is set to null
3. **SubjectDeletion** - Tests cascade to qualifications and lessons
4. **SchoolYearDeletion** - Tests cascade to terms, lessons, and teacher availabilities
5. **TermDeletion** - Tests cascade to lessons and availabilities
6. **RoomDeletion** - Tests that Lesson.room is set to null (ON DELETE SET NULL)
7. **SchoolClassDeletion** - Tests cascade to lessons
8. **TimeSlotDeletion** - Tests cascade to lessons

### Key decisions
- Used `EntityManager.remove()` for hard deletes via JPA to test cascade behavior
- Tests verify both direct child deletion and count queries to ensure no orphan records remain
- Tests verify that deleting one school doesn't affect another school's data
