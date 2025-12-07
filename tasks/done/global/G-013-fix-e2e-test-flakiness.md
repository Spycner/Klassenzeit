# G-013: Fix E2E Test Flakiness

## Priority: LOW

## Description

E2E API tests have 5 flaky failures (94.6% pass rate) due to Keycloak brute force protection triggering during parallel test execution.

## Acceptance Criteria

- [x] E2E tests pass consistently at 100%
- [x] Tests remain parallelized for speed
- [x] No authentication-related flaky failures

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

## Completion Notes

Implemented **Option 1: Test User Pool** as recommended. Changes made:

### 1. Keycloak Realm Config (`docker/keycloak/klassenzeit-realm.json`)
- Added 6 test users: `e2e-test-1@klassenzeit.com` through `e2e-test-6@klassenzeit.com`
- All users share the same password: `e2e-test-password`

### 2. E2E Test Infrastructure
- **`e2e/tests/api/auth.ts`**: Added `TEST_USERS` array and `setWorkerIndex()` function
- **`e2e/tests/api/fixtures.ts`**: Created custom Playwright fixture that sets worker index automatically (scope: worker)
- All API spec files updated to import `test` from fixtures instead of `@playwright/test`

### 3. Backend Platform Admin Config
- **`backend/src/main/resources/application.yaml`**: Added all 6 test users to `platform-admin-emails`
- **`backend/src/main/java/.../AppUserService.java`**: Changed `@Value` annotation to use SpEL split expression for comma-separated list support
- **`backend/build.gradle.kts`**: Updated env var from `PLATFORM_ADMIN_EMAIL` to `PLATFORM_ADMIN_EMAILS`
- **`.env`**: Updated to `PLATFORM_ADMIN_EMAILS` with all 7 users (comma-separated)
- **`.github/workflows/ci.yml`**: Updated CI env var to include all test users

### Test Results
- **168/168 tests passed** (100% pass rate)
- Tests remain fully parallelized with 6 workers
- No more "Invalid user credentials" flaky failures
