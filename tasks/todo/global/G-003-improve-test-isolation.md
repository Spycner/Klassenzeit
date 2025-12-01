# G-003: Improve Test Isolation in E2E Tests

## Description
Ensure E2E tests are properly isolated and can run independently.

## Acceptance Criteria
- [ ] Review use of `beforeAll` vs `beforeEach` in API tests
- [ ] Ensure tests don't rely on shared state from other tests
- [ ] Add proper cleanup in `afterEach` or `afterAll`
- [ ] Each test should be able to run independently

## Dependencies
None

## Blocks
None

## Notes
**Location:** `e2e/tests/api/*.spec.ts`
