# B-020: Authentication & Authorization

## Description

Implement Keycloak-based authentication with application-level school-scoped authorization.

## Status: In Progress

**Phase 1 & 2 Complete** - Foundation and School Membership implemented. Remaining phases pending.

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

### Phase 3: Secure All Endpoints
- [ ] Add `@PreAuthorize` to all controllers:
  - SchoolController
  - TeacherController, TeacherAvailabilityController, TeacherQualificationController
  - SubjectController, RoomController, SchoolClassController
  - TimeSlotController, LessonController
  - SchoolYearController, TermController
  - TimetableSolverController
- [ ] Create `@WithMockCurrentUser` test annotation
- [ ] Update tests with security context

### Phase 4: Platform Admin
- [ ] Create PlatformAdminController
- [ ] `POST /api/admin/schools` - Create school
- [ ] `POST /api/admin/schools/{id}/admins` - Assign school admin

### Phase 5: Access Requests
- [ ] Create SchoolAccessRequest entity
- [ ] Create AccessRequestService
- [ ] Create AccessRequestController
- [ ] Request/approve/reject workflow endpoints

### Phase 6: Frontend Integration
- [ ] Configure React for Keycloak OIDC
- [ ] Add AuthContext/AuthProvider
- [ ] Add ProtectedRoute component
- [ ] Add Login/Logout UI
- [ ] Add SchoolSelector for multi-school users
- [ ] Add AccessRequest UI

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

### Modified Files
- `backend/build.gradle.kts` - Added security dependencies
- `backend/src/main/resources/application.yaml` - Added OAuth2 config
- `.env.example` - Added Keycloak env vars
- `.env` - Added Keycloak env vars

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
| POST | `/api/admin/schools/{id}/admins` | Assign admin | 4 |
| POST | `/api/schools/{id}/access-requests` | Request access | 5 |
| GET | `/api/schools/{id}/access-requests` | List requests | 5 |
| PUT | `/api/schools/{id}/access-requests/{id}` | Review request | 5 |

## Notes

### Testing
- Production security config uses `@Profile("!test")`
- Test security config uses `@Profile("test")` and permits all requests
- All 456 existing tests pass

### Keycloak Access
- URL: http://localhost:8180
- Admin: admin/admin (configurable via env vars)
- Realm: `klassenzeit` (needs to be created manually or via script)
