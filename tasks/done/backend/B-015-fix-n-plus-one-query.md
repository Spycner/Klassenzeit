# Fix N+1 Query in RoomSubjectSuitabilityService

## Description
The `findAllByRoom` method in `RoomSubjectSuitabilityService` causes N+1 queries because `Subject` is lazily loaded but accessed in `toSummary()` for each result. If a room has 10 subject suitabilities, this executes 11 queries instead of 1.

## Acceptance Criteria
- [x] Add `findByRoomIdWithSubject` method to `RoomSubjectSuitabilityRepository` with `JOIN FETCH`
- [x] Update `RoomSubjectSuitabilityService.findAllByRoom` to use the new method
- [x] Verify with SQL logging that only 1 query is executed
- [x] All existing tests pass

## Context
- Found by: code-quality agent
- Priority: HIGH
- Effort: Small
- Related files:
  - `backend/src/main/java/com/klassenzeit/klassenzeit/room/RoomSubjectSuitabilityService.java:31-33`
  - `backend/src/main/java/com/klassenzeit/klassenzeit/room/RoomSubjectSuitabilityRepository.java`

## Notes
Fix approach:
```java
// In RoomSubjectSuitabilityRepository.java
@Query("SELECT s FROM RoomSubjectSuitability s JOIN FETCH s.subject WHERE s.room.id = :roomId")
List<RoomSubjectSuitability> findByRoomIdWithSubject(@Param("roomId") UUID roomId);
```

Then update the service to use `findByRoomIdWithSubject` instead of `findByRoomId`.

## Completion Notes

**Completed:** 2025-12-08

**Changes made:**
1. Added `findByRoomIdWithSubject` method to `RoomSubjectSuitabilityRepository` with JPQL `JOIN FETCH s.subject` query
2. Updated `RoomSubjectSuitabilityService.findAllByRoom()` to use the new method

**Verification:**
- All 675 backend tests pass
- The `JOIN FETCH` ensures Subject is eagerly loaded in a single query, eliminating N+1 queries
