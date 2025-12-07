# B-024: Improve Security Package Test Coverage

## Priority: MEDIUM

## Description

The security package has only 27% test coverage, with critical classes like `UserResolutionFilter` and `SecurityConfig` at 0%. These are essential for authentication and should be tested.

## Acceptance Criteria

- [ ] Achieve 80%+ coverage on `UserResolutionFilter`
- [ ] Achieve 80%+ coverage on `SecurityConfig`
- [ ] Achieve 80%+ coverage on `AuthorizationService`
- [ ] Add tests for `CurrentUserAuthentication`
- [ ] Overall security package coverage >= 80%

## Current Coverage

| Class | Coverage | Lines Missed |
|-------|----------|--------------|
| UserResolutionFilter | 0% | 43/43 |
| SecurityConfig | 0% | 23/23 |
| CurrentUserAuthentication | 0% | 5/5 |
| AuthorizationService | 58% | 18/53 |
| CurrentUser | 35% | 5/7 |

## Tasks

### 1. Test UserResolutionFilter
**File:** Create `backend/src/test/java/com/klassenzeit/klassenzeit/security/UserResolutionFilterTest.java`

Test scenarios:
- Filter creates/resolves user from JWT claims
- Filter handles missing JWT gracefully
- Filter sets CurrentUserAuthentication in security context
- Filter chain continues after processing
- Invalid JWT handling

### 2. Test SecurityConfig
**File:** Create `backend/src/test/java/com/klassenzeit/klassenzeit/security/SecurityConfigIntegrationTest.java`

Test scenarios:
- Public endpoints accessible without auth
- Protected endpoints require valid JWT
- CORS configuration applied correctly
- CSRF disabled for API
- Session management is stateless

### 3. Expand AuthorizationService Tests
**File:** `backend/src/test/java/com/klassenzeit/klassenzeit/security/AuthorizationServiceTest.java`

Add tests for uncovered branches:
- Platform admin authorization
- School membership role checks
- Edge cases (null user, missing membership)

### 4. Test CurrentUserAuthentication
**File:** Create `backend/src/test/java/com/klassenzeit/klassenzeit/security/CurrentUserAuthenticationTest.java`

Test scenarios:
- Authentication properties (authorities, credentials, principal)
- isAuthenticated() behavior
- getName() returns expected value

## Notes

- Use `@WebMvcTest` for filter/config tests
- Use `@WithMockUser` and custom security annotations
- May need to mock Keycloak JWT decoder

## Related Tasks

- [B-022: Fix Critical Security Issues](./B-022-fix-critical-security-issues.md) - fix first, then test
