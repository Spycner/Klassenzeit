# G-003: Improve Test Isolation in E2E Tests

## Description
Ensure E2E tests are properly isolated and can run independently.

## Acceptance Criteria
- [x] Review use of `beforeAll` vs `beforeEach` in API tests
- [x] Ensure tests don't rely on shared state from other tests
- [x] Add proper cleanup in `afterEach` or `afterAll`
- [x] Each test should be able to run independently

## Dependencies
None

## Blocks
None

## Notes
**Location:** `e2e/tests/api/*.spec.ts`

## Completion Notes

**Fixed:** `schools.api.spec.ts` was missing proper test isolation:
- Removed unused `createdSchoolId` variable that was set but never cleaned up
- Added cleanup to POST test that creates a school but wasn't cleaning it up
- Now each test creates its own data and cleans up inline

**Existing patterns kept:** Other test files (classes, rooms, subjects, teachers) already had proper `beforeAll`/`afterAll` hooks with cascading cleanup via parent deletion.

**Decision:** No `beforeEach`/`afterEach` needed - the pattern of creating test-specific data within each test and cleaning up inline is sufficient for test independence.
