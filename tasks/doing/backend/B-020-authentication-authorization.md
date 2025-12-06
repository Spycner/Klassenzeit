# B-020: Authentication & Authorization

## Description

Implement Keycloak-based authentication with application-level school-scoped authorization.

## Status: In Progress

**Phase 1-6 Complete** - Foundation, School Membership, Endpoint Security, Platform Admin, Access Requests, and Frontend Integration implemented. Only Phase 7 (Invitations) remains as a future enhancement.

## Architecture Decision

- **Authentication**: Keycloak (self-hosted via Docker)
- **Authorization**: Application database (school-scoped roles)
- **Multi-school**: Users can belong to multiple schools with different roles

See [docs/authentication.md](../../../docs/authentication.md) for full architecture documentation.

## Acceptance Criteria

### Phase 1: Foundation ✅
- [x] Add Keycloak to Docker Compose (`compose.yml`)
- [x] Add Spring Security dependencies (`build.gradle.kts`)
- [x] Create database migration (`V7__create_user_permission_tables.sql`)
- [x] Implement SecurityConfig with JWT validation
- [x] Create AppUser entity, repository, service
- [x] Implement UserResolutionFilter (JWT → AppUser sync)
- [x] Create `/api/users/me` endpoint
- [x] Test configuration (disable auth for tests)

### Phase 2: School Membership ✅
- [x] Create SchoolMembershipService
- [x] Create SchoolMembershipController
- [x] Membership CRUD endpoints (`/api/schools/{schoolId}/members`)
- [x] Add `@PreAuthorize` to TeacherController as POC

### Phase 3: Secure All Endpoints ✅
- [x] Add `@PreAuthorize` to all controllers:
  - SchoolController (special pattern: `canListSchools`, `canAccessSchool`, `isPlatformAdmin`, `isSchoolAdmin`)
  - TeacherController, TeacherAvailabilityController, TeacherQualificationController
  - SubjectController, RoomController, SchoolClassController
  - TimeSlotController, LessonController
  - SchoolYearController, TermController
  - TimetableSolverController
- [x] Create `@WithMockCurrentUser` test annotation
- [x] Update tests with security context
- [x] Add `findAllForUser(CurrentUser)` to SchoolService for user-scoped school listing

### Phase 4: Platform Admin ✅
- [x] Create PlatformAdminController
- [x] `POST /api/admin/schools/{id}/admins` - Assign school admin

Note: `POST /api/admin/schools` is not needed since `POST /api/schools` already exists with platform admin auth.

### Phase 5: Access Requests ✅
- [x] Create SchoolAccessRequest entity
- [x] Create AccessRequestService
- [x] Create AccessRequestController
- [x] Request/approve/reject workflow endpoints
- [x] Cancel endpoint in AppUserController

### Phase 6: Frontend Integration ✅
- [x] Configure React for Keycloak OIDC
- [x] Add AuthContext/AuthProvider
- [x] Add ProtectedRoute component
- [x] Add Login/Logout UI
- [x] Add SchoolSelector for multi-school users
- [x] Add AccessRequest UI

### Phase 7: Invitations (Future)
- [ ] SchoolInvitation entity (already in schema)
- [ ] Email invitation flow
- [ ] Invitation link flow

## Dependencies
None

## Blocks
- [B-021: Multi-tenancy Enforcement](../todo/backend/B-021-multi-tenancy-enforcement.md)

## Files Created/Modified

### New Files
- `compose.yml` - Added Keycloak service
- `docker/postgres/init-keycloak-db.sql` - Keycloak database init
- `backend/src/main/resources/db/migration/V7__create_user_permission_tables.sql`
- `backend/src/main/java/com/klassenzeit/klassenzeit/security/`
  - `SecurityConfig.java`
  - `CurrentUser.java`
  - `CurrentUserAuthentication.java`
  - `UserResolutionFilter.java`
  - `AuthorizationService.java`
- `backend/src/main/java/com/klassenzeit/klassenzeit/user/`
  - `AppUser.java`
  - `AppUserRepository.java`
  - `AppUserService.java`
  - `AppUserController.java`
  - `dto/UserProfileResponse.java`
- `backend/src/main/java/com/klassenzeit/klassenzeit/membership/`
  - `SchoolMembership.java`
  - `SchoolRole.java`
  - `SchoolMembershipRepository.java`
  - `SchoolMembershipService.java` (Phase 2)
  - `SchoolMembershipController.java` (Phase 2)
  - `ForbiddenOperationException.java` (Phase 2)
  - `dto/CreateMembershipRequest.java` (Phase 2)
  - `dto/UpdateMembershipRequest.java` (Phase 2)
  - `dto/MembershipResponse.java` (Phase 2)
  - `dto/MembershipSummary.java` (Phase 2)
- `backend/src/test/java/com/klassenzeit/klassenzeit/security/TestSecurityConfig.java`
- `backend/src/test/java/com/klassenzeit/klassenzeit/membership/SchoolMembershipServiceTest.java` (Phase 2)
- `backend/src/test/java/com/klassenzeit/klassenzeit/security/WithMockCurrentUser.java` (Phase 3)
- `backend/src/test/java/com/klassenzeit/klassenzeit/security/WithMockCurrentUserSecurityContextFactory.java` (Phase 3)
- `backend/src/test/java/com/klassenzeit/klassenzeit/security/MockCurrentUserAuthentication.java` (Phase 3)
- `backend/src/main/java/com/klassenzeit/klassenzeit/admin/PlatformAdminController.java` (Phase 4)
- `backend/src/main/java/com/klassenzeit/klassenzeit/admin/dto/AssignAdminRequest.java` (Phase 4)
- `backend/src/test/java/com/klassenzeit/klassenzeit/admin/PlatformAdminControllerTest.java` (Phase 4)
- `backend/src/main/java/com/klassenzeit/klassenzeit/accessrequest/AccessRequestStatus.java` (Phase 5)
- `backend/src/main/java/com/klassenzeit/klassenzeit/accessrequest/SchoolAccessRequest.java` (Phase 5)
- `backend/src/main/java/com/klassenzeit/klassenzeit/accessrequest/SchoolAccessRequestRepository.java` (Phase 5)
- `backend/src/main/java/com/klassenzeit/klassenzeit/accessrequest/AccessRequestService.java` (Phase 5)
- `backend/src/main/java/com/klassenzeit/klassenzeit/accessrequest/AccessRequestController.java` (Phase 5)
- `backend/src/main/java/com/klassenzeit/klassenzeit/accessrequest/dto/CreateAccessRequestRequest.java` (Phase 5)
- `backend/src/main/java/com/klassenzeit/klassenzeit/accessrequest/dto/ReviewAccessRequestRequest.java` (Phase 5)
- `backend/src/main/java/com/klassenzeit/klassenzeit/accessrequest/dto/ReviewDecision.java` (Phase 5)
- `backend/src/main/java/com/klassenzeit/klassenzeit/accessrequest/dto/AccessRequestResponse.java` (Phase 5)
- `backend/src/main/java/com/klassenzeit/klassenzeit/accessrequest/dto/AccessRequestSummary.java` (Phase 5)
- `backend/src/test/java/com/klassenzeit/klassenzeit/accessrequest/AccessRequestServiceTest.java` (Phase 5)
- `backend/src/test/java/com/klassenzeit/klassenzeit/accessrequest/AccessRequestControllerTest.java` (Phase 5)

### Modified Files
- `backend/build.gradle.kts` - Added security dependencies
- `backend/src/main/resources/application.yaml` - Added OAuth2 config
- `.env.example` - Added Keycloak env vars
- `.env` - Added Keycloak env vars
- `backend/src/main/java/com/klassenzeit/klassenzeit/membership/SchoolMembershipService.java` - Added `assignSchoolAdmin()` method (Phase 4)
- `backend/src/test/java/com/klassenzeit/klassenzeit/membership/SchoolMembershipServiceTest.java` - Added tests for `assignSchoolAdmin()` (Phase 4)
- `docs/authentication.md` - Updated Phase 4 status, API docs, package structure (Phase 4)
- `backend/src/main/java/com/klassenzeit/klassenzeit/user/AppUserController.java` - Added cancel access request endpoint (Phase 5)
- `backend/src/main/java/com/klassenzeit/klassenzeit/membership/SchoolMembershipService.java` - Made create method public (Phase 5)
- `backend/src/test/java/com/klassenzeit/klassenzeit/TestDataBuilder.java` - Added accessRequest builder (Phase 5)

## Roles

| Role | Scope | Permissions |
|------|-------|-------------|
| `PLATFORM_ADMIN` | Global | Create schools, assign admins. NO automatic school access |
| `SCHOOL_ADMIN` | Per School | Full CRUD, manage users, approve requests |
| `PLANNER` | Per School | Manage resources and schedules |
| `TEACHER` | Per School | View own schedule, manage availability |
| `VIEWER` | Per School | Read-only access |

## API Endpoints

| Method | Endpoint | Description | Phase |
|--------|----------|-------------|-------|
| GET | `/api/users/me` | Current user profile | 1 ✅ |
| PUT | `/api/users/me` | Update profile | 3 |
| GET | `/api/schools/{id}/members` | List members | 2 ✅ |
| GET | `/api/schools/{id}/members/{id}` | Get member details | 2 ✅ |
| POST | `/api/schools/{id}/members` | Add member | 2 ✅ |
| PUT | `/api/schools/{id}/members/{id}` | Update member | 2 ✅ |
| DELETE | `/api/schools/{id}/members/{id}` | Remove member | 2 ✅ |
| POST | `/api/admin/schools` | Create school | 4 |
| POST | `/api/admin/schools/{id}/admins` | Assign admin | 4 ✅ |
| POST | `/api/schools/{id}/access-requests` | Request access | 5 ✅ |
| GET | `/api/schools/{id}/access-requests` | List requests | 5 ✅ |
| GET | `/api/schools/{id}/access-requests/{id}` | Get request details | 5 ✅ |
| PUT | `/api/schools/{id}/access-requests/{id}` | Review request | 5 ✅ |
| DELETE | `/api/users/me/access-requests/{id}` | Cancel request | 5 ✅ |

## Notes

### Testing
- Production security config uses `@Profile("!test")`
- Test security config uses `@Profile("test")` with `@EnableMethodSecurity(prePostEnabled = true)`
- Use `@WithMockCurrentUser` annotation to set up security context in tests
- All 481 tests pass

### Keycloak Access
- URL: http://localhost:8180
- Admin: admin/admin (configurable via env vars)
- Realm: `klassenzeit` (needs to be created manually or via script)

### Bug Fixes
- Fixed race condition in `AppUserService.resolveOrCreateUser()` where concurrent first-login requests could cause duplicate key errors. Now uses optimistic insert-or-fetch pattern instead of pessimistic locking.
