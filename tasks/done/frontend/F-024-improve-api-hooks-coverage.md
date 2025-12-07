# F-024: Improve API Hooks Test Coverage

## Priority: MEDIUM

## Status: COMPLETED (2025-12-07)

## Description

Many API hooks have 0% test coverage. These hooks are critical for data fetching and mutations throughout the application.

## Acceptance Criteria

- [x] Add tests for all untested hooks
- [x] Achieve 80%+ coverage on API hooks
- [x] Test error handling scenarios
- [x] Test loading and success states

## Final Coverage

| Hook | Status | Tests Added |
|------|--------|-------------|
| use-classes.ts | ✅ Complete | 10 tests |
| use-lessons.ts | ✅ Complete | 12 tests |
| use-memberships.ts | ✅ Complete | 10 tests |
| use-rooms.ts | ✅ Complete | 10 tests |
| use-school-years.ts | ✅ Complete | 10 tests |
| use-terms.ts | ✅ Complete | 12 tests |
| use-time-slots.ts | ✅ Complete | 10 tests |
| use-access-requests.ts | ✅ Complete | 11 tests |
| use-current-user.ts | ✅ Complete | 3 tests |
| use-teachers.ts | ✅ Already tested | - |
| use-subjects.ts | ✅ Already tested | - |
| use-schools.ts | ✅ Already tested | - |
| use-solver.ts | ✅ Already tested | - |
| use-users.ts | ✅ Already tested | - |

**Total new tests added: 88**

## Completion Notes

### What was implemented

1. **MSW Mock Data and Handlers** (`frontend/src/test/mocks/handlers.ts`)
   - Added mock data for 8 entities: Classes, Rooms, School Years, Terms, Time Slots, Lessons, Memberships, Access Requests
   - Added HTTP request handlers for all CRUD operations on these entities

2. **Test Files Created**
   - `use-classes.test.tsx` - Tests for useClasses, useClass, useCreateClass, useUpdateClass, useDeleteClass
   - `use-rooms.test.tsx` - Tests for useRooms, useRoom, useCreateRoom, useUpdateRoom, useDeleteRoom
   - `use-school-years.test.tsx` - Tests for useSchoolYears, useSchoolYear, useCreateSchoolYear, useUpdateSchoolYear, useDeleteSchoolYear
   - `use-terms.test.tsx` - Tests for useTerms, useTerm, useCreateTerm, useUpdateTerm, useDeleteTerm
   - `use-time-slots.test.tsx` - Tests for useTimeSlots, useTimeSlot, useCreateTimeSlot, useUpdateTimeSlot, useDeleteTimeSlot
   - `use-lessons.test.tsx` - Tests for useLessons, useLesson, useCreateLesson, useUpdateLesson, useDeleteLesson
   - `use-memberships.test.tsx` - Tests for useMemberships, useMembership, useCreateMembership, useUpdateMembership, useDeleteMembership
   - `use-access-requests.test.tsx` - Tests for useAccessRequests, useAccessRequest, useCreateAccessRequest, useReviewAccessRequest, useCancelAccessRequest
   - `use-current-user.test.tsx` - Tests for useCurrentUser hook

3. **Test Patterns Used**
   - Query tests: Fetch list, fetch single, disabled when ID undefined, error handling
   - Mutation tests: Create, update, delete operations

### Test Results

- All 456 tests pass (39 test files)
- All pre-commit hooks pass (Biome lint/format, TypeScript type check)

### Decision on F-025 (API Services Coverage)

F-025 was **intentionally skipped** because:
- API services are thin wrappers around the API client
- The API client has comprehensive tests
- Hook tests exercise services indirectly through MSW mocking
- Adding direct service tests would provide minimal additional value

## Related Tasks

- [F-025: Improve API Services Coverage](../../todo/frontend/F-025-improve-api-services-coverage.md) - Skipped (covered by hook tests)
