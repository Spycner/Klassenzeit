# G-004: Clean Up Redundant Test Assertions

## Description
Standardize response status checking pattern in E2E tests.

## Acceptance Criteria
- [ ] Choose consistent pattern for response status checks
- [ ] Option A: `expect(response.status()).toBe(200)` for specific status
- [ ] Option B: `expect(response.ok()).toBeTruthy()` for 2xx range
- [ ] Remove redundant checks (using both is unnecessary)

## Dependencies
None

## Blocks
None

## Notes
**Location:** `e2e/tests/api/*.spec.ts`
