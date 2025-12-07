# G-013: Fix E2E Test Flakiness

## Priority: LOW

## Description

E2E API tests have 5 flaky failures (94.6% pass rate) due to Keycloak brute force protection triggering during parallel test execution.

## Acceptance Criteria

- [ ] E2E tests pass consistently at 100%
- [ ] Tests remain parallelized for speed
- [ ] No authentication-related flaky failures

## Root Cause

When tests run in parallel with 6 workers:
1. Multiple workers authenticate the same test user simultaneously
2. Some auth attempts may fail due to timing
3. Keycloak's brute force protection (failureFactor: 30) gets triggered
4. Test user gets temporarily locked
5. Subsequent tests fail with "Invalid user credentials"

## Solution Options

### Option 1: Test User Pool (Recommended)
Create multiple E2E test users so parallel tests don't share credentials.

**Implementation:**
1. Create users in Keycloak realm config:
   - `e2e-test-1@klassenzeit.com`
   - `e2e-test-2@klassenzeit.com`
   - `e2e-test-3@klassenzeit.com`
   - `e2e-test-4@klassenzeit.com`
   - `e2e-test-5@klassenzeit.com`
   - `e2e-test-6@klassenzeit.com`

2. Update `e2e/tests/api/auth.ts` to use worker-specific user:
   ```typescript
   const testUsers = [
     'e2e-test-1@klassenzeit.com',
     'e2e-test-2@klassenzeit.com',
     // ...
   ];

   export function getTestUser(workerIndex: number) {
     return testUsers[workerIndex % testUsers.length];
   }
   ```

3. Update test fixtures to pass worker index

### Option 2: Token Caching
Share authenticated tokens across workers.

**Implementation:**
1. Create token cache file before tests run
2. Workers read from shared cache
3. Refresh token when expired

### Option 3: Reduce Parallelism
Run fewer workers to reduce auth contention.

**Implementation:**
Update `playwright.config.ts`:
```typescript
export default defineConfig({
  workers: 2, // Reduce from 6
  // ...
});
```

### Option 4: Disable Brute Force in Test Realm
Adjust Keycloak test realm settings.

**Implementation:**
Update `docker/keycloak/klassenzeit-realm.json`:
```json
{
  "bruteForceProtected": false,
  // or
  "failureFactor": 100,
  "maxFailureWaitSeconds": 60
}
```

## Recommendation

Implement Option 1 (Test User Pool) as it:
- Maintains full parallelization
- Doesn't require disabling security features
- Scales with more workers if needed
- Is a clean architectural solution

## Notes

- Current flaky tests all pass individually
- Failures only occur under parallel load
- This is an infrastructure issue, not a code bug

## Related Tasks

- None
