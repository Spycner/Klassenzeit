# B-003: Concurrent Operation Handling

## Description
Implement optimistic locking to handle concurrent modifications safely.

## Acceptance Criteria
- [x] Implement optimistic locking (if not already present)
- [x] Add version field to entities for concurrent modification detection
- [x] Return 409 Conflict when concurrent modifications are detected
- [x] Add integration tests for concurrent update scenarios

## Dependencies
None

## Blocks
None

## Completion Notes

### What was implemented

1. **Database Migration** (`V6__add_version_column.sql`)
   - Added `version BIGINT NOT NULL DEFAULT 0` column to all 11 entity tables

2. **BaseEntity.java**
   - Added `@Version` field for JPA optimistic locking

3. **GlobalExceptionHandler.java**
   - Added handler for `ObjectOptimisticLockingFailureException` → returns 409 Conflict

4. **Response DTOs** (8 files)
   - Added `Long version` field to: TeacherResponse, SubjectResponse, RoomResponse, SchoolClassResponse, TimeSlotResponse, LessonResponse, TermResponse, SchoolYearResponse

5. **Update Request DTOs** (8 files)
   - Added `Long version` field to: UpdateTeacherRequest, UpdateSubjectRequest, UpdateRoomRequest, UpdateSchoolClassRequest, UpdateTimeSlotRequest, UpdateLessonRequest, UpdateTermRequest, UpdateSchoolYearRequest

6. **Service classes** (8 files)
   - Updated `toResponse()` methods to include version field

7. **ConcurrentOperationIntegrationTest.java**
   - Tests version increments on update
   - Tests concurrent update detection with 409 Conflict response
   - Tests retry-after-conflict workflow

### Key decisions
- Version is exposed in API responses and optional in update requests (for true optimistic concurrency control)
- When version is null in request, update proceeds without version check
- When version mismatches, returns 409 Conflict with user-friendly message
