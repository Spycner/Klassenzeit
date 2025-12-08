# Add Unit Tests for Room Subject Hooks and Services

## Description
The subject suitability feature (SubjectSuitabilitySection component) depends on `use-room-subjects.ts` hook and `room-subjects.ts` service, but they have no/low test coverage.

## Acceptance Criteria
- [x] Create `use-room-subjects.test.tsx` following `use-subjects.test.tsx` pattern
- [x] Add tests for list, create, and delete operations
- [x] Test error handling and undefined parameters
- [x] Test query invalidation on mutations
- [x] Coverage for use-room-subjects.ts reaches 90%+
- [x] Coverage for room-subjects.ts reaches 90%+

## Context
- Found by: frontend-tests agent
- Priority: LOW
- Effort: Small
- Related files:
  - `frontend/src/api/hooks/use-room-subjects.ts` (0% coverage)
  - `frontend/src/api/services/room-subjects.ts` (33.33% coverage)

## Notes
Follow the pattern from `frontend/src/api/hooks/use-rooms.test.tsx` which has 100% coverage.

## Completion Notes
Created comprehensive test suite:
1. Added MSW handlers for room subjects API (GET, POST, DELETE) in `handlers.ts`
2. Created `use-room-subjects.test.tsx` with tests covering:
   - `useRoomSubjects` fetching suitabilities
   - `useRoomSubjects` returning empty for undefined schoolId/roomId
   - `useCreateRoomSubject` creating suitabilities
   - `useDeleteRoomSubject` deleting suitabilities
   - Query invalidation on successful mutations
3. Coverage achieved: use-room-subjects.ts 100%, room-subjects.ts 100%
