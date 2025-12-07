# B-025: Improve User Package Test Coverage

## Priority: MEDIUM

## Description

The user package has only 20% test coverage. `AppUserService` and `AppUserController` handle user management and should be well-tested.

## Acceptance Criteria

- [ ] Achieve 80%+ coverage on `AppUserService`
- [ ] Achieve 80%+ coverage on `AppUserController`
- [ ] Improve `AppUser` entity coverage
- [ ] Overall user package coverage >= 80%

## Current Coverage

| Class | Coverage | Lines Missed |
|-------|----------|--------------|
| AppUserService | 10% | 44/51 |
| AppUserController | 11% | 26/31 |
| AppUser | 60% | 13/26 |

## Tasks

### 1. Test AppUserService
**File:** Create `backend/src/test/java/com/klassenzeit/klassenzeit/user/AppUserServiceTest.java`

Test scenarios:
- `findOrCreateByKeycloakId` - creates new user
- `findOrCreateByKeycloakId` - returns existing user
- `findOrCreateByKeycloakId` - updates user details on login
- `findById` - returns user
- `findById` - throws EntityNotFoundException
- `searchUsers` - returns matching users
- `searchUsers` - pagination works correctly
- `getCurrentUserProfile` - returns profile with memberships

### 2. Test AppUserController
**File:** Create `backend/src/test/java/com/klassenzeit/klassenzeit/user/AppUserControllerTest.java`

Test scenarios:
- `GET /api/users/me` - returns current user profile
- `GET /api/users/me` - requires authentication
- `GET /api/users/search` - returns search results
- `GET /api/users/search` - requires school admin role
- `GET /api/users/{id}` - returns user details
- Error handling for missing users

### 3. Test AppUser Entity
**File:** Create `backend/src/test/java/com/klassenzeit/klassenzeit/user/AppUserTest.java`

Test scenarios:
- Entity creation and validation
- Relationship mappings
- Equals/hashCode behavior
- Builder pattern usage

## Notes

- Use `@WebMvcTest` for controller tests
- Use `@DataJpaTest` for repository integration tests
- Mock dependencies in service tests

## Related Tasks

- [B-024: Improve Security Test Coverage](./B-024-improve-security-test-coverage.md) - can be done in parallel
