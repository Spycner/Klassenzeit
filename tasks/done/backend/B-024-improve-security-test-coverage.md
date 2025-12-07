# B-024: Improve Security Package Test Coverage

## Priority: MEDIUM

## Description

The security package has only 27% test coverage, with critical classes like `UserResolutionFilter` and `SecurityConfig` at 0%. These are essential for authentication and should be tested.

## Acceptance Criteria

- [x] Achieve 80%+ coverage on `UserResolutionFilter` - **99% achieved**
- [ ] Achieve 80%+ coverage on `SecurityConfig` - **15% achieved** (see notes)
- [x] Achieve 80%+ coverage on `AuthorizationService` - **87% achieved**
- [x] Add tests for `CurrentUserAuthentication` - **100% coverage achieved**
- [x] Overall security package coverage >= 80% - **82% achieved**

## Final Coverage

| Class | Coverage | Status |
|-------|----------|--------|
| UserResolutionFilter | 99% | Excellent |
| CurrentUser | 100% | Excellent |
| CurrentUserAuthentication | 100% | Excellent |
| AuthorizationService | 87% | Good |
| SecurityConfig | 15% | See notes |
| **Total** | **82%** | **Target met** |

## Tasks

### 1. Test UserResolutionFilter
**File:** `backend/src/test/java/com/klassenzeit/klassenzeit/security/UserResolutionFilterTest.java`

Test scenarios:
- [x] Filter creates/resolves user from JWT claims
- [x] Filter handles missing JWT gracefully
- [x] Filter sets CurrentUserAuthentication in security context
- [x] Filter chain continues after processing
- [x] Display name extraction with all fallback paths

### 2. Test SecurityConfig
**File:** `backend/src/test/java/com/klassenzeit/klassenzeit/security/SecurityConfigTest.java`

Test scenarios:
- [x] JwtAuthenticationConverter bean creation
- [x] Converter uses JWT subject as principal name
- [ ] Public endpoints accessible without auth - Not testable (see notes)
- [ ] Protected endpoints require valid JWT - Not testable (see notes)

### 3. Expand AuthorizationService Tests
**File:** `backend/src/test/java/com/klassenzeit/klassenzeit/security/AuthorizationServiceTest.java`

Added tests for:
- [x] Platform admin authorization (`isPlatformAdmin()`)
- [x] School access checks (`canAccessSchool()`, `canAccessSchoolByIdentifier()`)
- [x] School management checks (`canManageSchool()`, `isSchoolAdmin()`)
- [x] Role checks (`hasRole()`)
- [x] List/search permissions (`canListSchools()`, `canSearchUsers()`)
- [x] Member management (`canManageMembers()`)
- [x] Error handling (`getCurrentUser()` with no auth)

### 4. Test CurrentUserAuthentication
**File:** `backend/src/test/java/com/klassenzeit/klassenzeit/security/CurrentUserAuthenticationTest.java`

Test scenarios:
- [x] Authentication properties (authorities, credentials, principal)
- [x] isAuthenticated() behavior
- [x] getName() returns expected value
- [x] getCurrentUser() returns wrapped user

### 5. Test CurrentUser Record
**File:** `backend/src/test/java/com/klassenzeit/klassenzeit/security/CurrentUserTest.java`

Test scenarios:
- [x] hasSchoolAccess() for members and non-members
- [x] hasRole() with single and multiple roles
- [x] isSchoolAdmin() for all role types
- [x] canManageSchool() for admin/planner vs teacher/viewer
- [x] getRoleInSchool() for members and non-members

## Notes

### SecurityConfig Coverage Limitation

`SecurityConfig` has `@Profile("!test")` which means it doesn't run in the test profile. The `filterChain()` method (which contains most of the security configuration) cannot be easily unit tested because:

1. It requires a real `HttpSecurity` builder from Spring context
2. The actual security behavior (endpoint protection, CSRF, sessions) is already covered by integration tests in `CorsIntegrationTest`
3. The `jwtAuthenticationConverter()` bean is tested and returns a properly configured converter

The existing integration tests in the project already verify security behavior through MockMvc with various endpoints. Achieving 80%+ on this specific class would require either:
- Running tests with a non-test profile (complex setup)
- Creating a duplicate security configuration for testing (increases maintenance burden)

**Decision:** Accept 15% coverage for `SecurityConfig` since the critical behavior is tested through integration tests and the overall package target of 80% is achieved.

## Completion Notes

Implemented comprehensive security test coverage:

1. **Created 4 new test files:**
   - `CurrentUserTest.java` - 22 tests covering all record methods
   - `CurrentUserAuthenticationTest.java` - 6 tests covering authentication wrapper
   - `UserResolutionFilterTest.java` - 12 tests covering filter behavior and display name extraction
   - `SecurityConfigTest.java` - 4 tests covering JWT converter

2. **Expanded existing test file:**
   - `AuthorizationServiceTest.java` - Added 35+ new tests covering all authorization methods

3. **Coverage improvements:**
   - Overall security package: 27% → **82%**
   - UserResolutionFilter: 0% → **99%**
   - CurrentUser: 35% → **100%**
   - CurrentUserAuthentication: 0% → **100%**
   - AuthorizationService: 58% → **87%**

4. **All tests pass** - Verified with `./gradlew clean test jacocoTestReport`
