# G-004: Clean Up Redundant Test Assertions

## Description
Standardize response status checking pattern in E2E tests.

## Acceptance Criteria
- [x] Choose consistent pattern for response status checks
- [x] Option A: `expect(response.status()).toBe(200)` for specific status
- [x] Option B: `expect(response.ok()).toBeTruthy()` for 2xx range
- [x] Remove redundant checks (using both is unnecessary)

## Dependencies
None

## Blocks
None

## Notes
**Location:** `e2e/tests/api/*.spec.ts`

## Completion Notes

**Decision:** Use `response.status()` with exact codes (Option A)

**Rationale:**
- More precise - catches 201 vs 200 issues
- Better error messages - shows actual vs expected status
- Required anyway for 4xx/5xx checks
- Consistent with REST API semantics

**Changes made:** Removed all `response.ok()` checks from:
- `schools.api.spec.ts` (7 occurrences)
- `classes.api.spec.ts` (6 occurrences)
- `rooms.api.spec.ts` (6 occurrences)
- `subjects.api.spec.ts` (5 occurrences)
- `teachers.api.spec.ts` (6 occurrences)
