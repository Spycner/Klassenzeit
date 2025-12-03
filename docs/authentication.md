# Authentication & Authorization Architecture

This document describes the authentication and authorization system for Klassenzeit.

## Overview

Klassenzeit uses **Keycloak** for identity management (authentication) and an **application-level permission system** for authorization (what users can do within schools).

```
┌─────────────────────────────────────────────────────────────────┐
│                         Architecture                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────────┐     ┌───────────────┐     ┌──────────────────┐  │
│   │ Frontend │────▶│   Keycloak    │◀────│     Backend      │  │
│   │ (React)  │     │  (Identity)   │     │ (Authorization)  │  │
│   └──────────┘     └───────────────┘     └──────────────────┘  │
│        │                   │                      │             │
│        │ 1. Login          │                      │             │
│        │──────────────────▶│                      │             │
│        │                   │                      │             │
│        │ 2. JWT Token      │                      │             │
│        │◀──────────────────│                      │             │
│        │                   │                      │             │
│        │ 3. API Request with JWT                  │             │
│        │─────────────────────────────────────────▶│             │
│        │                   │                      │             │
│        │                   │ 4. Validate JWT      │             │
│        │                   │◀─────────────────────│             │
│        │                   │                      │             │
│        │                   │ 5. JWT Valid         │             │
│        │                   │─────────────────────▶│             │
│        │                   │                      │             │
│        │ 6. Response (based on school permissions)│             │
│        │◀─────────────────────────────────────────│             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Key Concepts

### Identity vs Authorization

| Concern | Handled By | Description |
|---------|------------|-------------|
| **Identity** | Keycloak | Who is this person? (login, password, email verification) |
| **Authorization** | Application | What can they do? (school access, roles, permissions) |

### Multi-School Membership

Users can belong to **multiple schools** with different roles in each:

```
User: alice@example.com
├── School A: SCHOOL_ADMIN
├── School B: PLANNER
└── School C: TEACHER (linked to Teacher record)
```

## Roles

### Platform Role

| Role | Scope | Permissions |
|------|-------|-------------|
| `PLATFORM_ADMIN` | Global | Create schools, assign initial school admins. **No automatic school data access.** |

### School Roles

| Role | Scope | Permissions |
|------|-------|-------------|
| `SCHOOL_ADMIN` | Per School | Full CRUD, manage users, approve access requests |
| `PLANNER` | Per School | Manage resources (teachers, rooms, subjects, schedules) |
| `TEACHER` | Per School | View own schedule, manage own availability |
| `VIEWER` | Per School | Read-only access to school data |

## Database Schema

### Entity Relationship

```
┌─────────────┐     ┌───────────────────┐     ┌─────────────┐
│   app_user  │────▶│ school_membership │◀────│   school    │
└─────────────┘     └───────────────────┘     └─────────────┘
       │                     │
       │                     │ (optional)
       │                     ▼
       │            ┌─────────────┐
       │            │   teacher   │
       │            └─────────────┘
       │
       ▼
┌─────────────────────┐
│ school_access_request│
└─────────────────────┘
```

### Tables

#### `app_user`
Links Keycloak identity to application data.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `keycloak_id` | VARCHAR | Keycloak user ID (JWT `sub` claim) |
| `email` | VARCHAR | User email (unique) |
| `display_name` | VARCHAR | Display name |
| `is_platform_admin` | BOOLEAN | Platform administrator flag |
| `is_active` | BOOLEAN | Account active flag |
| `last_login_at` | TIMESTAMPTZ | Last login timestamp |

#### `school_membership`
Many-to-many relationship between users and schools with roles.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | FK to app_user |
| `school_id` | UUID | FK to school |
| `role` | ENUM | SCHOOL_ADMIN, PLANNER, TEACHER, VIEWER |
| `linked_teacher_id` | UUID | FK to teacher (for TEACHER role) |
| `is_active` | BOOLEAN | Membership active flag |
| `granted_by` | UUID | FK to app_user who granted access |
| `granted_at` | TIMESTAMPTZ | When access was granted |

#### `school_access_request`
Users requesting access to schools.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | FK to app_user |
| `school_id` | UUID | FK to school |
| `requested_role` | ENUM | Requested role |
| `status` | ENUM | PENDING, APPROVED, REJECTED, CANCELLED |
| `message` | TEXT | Message from requester |
| `response_message` | TEXT | Response from admin |
| `reviewed_by` | UUID | FK to app_user who reviewed |
| `reviewed_at` | TIMESTAMPTZ | Review timestamp |

#### `school_invitation` (Future)
Email and link-based invitations.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `school_id` | UUID | FK to school |
| `email` | VARCHAR | Invitee email (null for link invitations) |
| `token` | VARCHAR | Secure invitation token |
| `role` | ENUM | Role to be granted |
| `status` | ENUM | PENDING, ACCEPTED, EXPIRED, CANCELLED |
| `expires_at` | TIMESTAMPTZ | Expiration timestamp |
| `max_uses` | INTEGER | Max uses for link invitations |
| `use_count` | INTEGER | Current use count |

## Backend Implementation

### Package Structure

```
com.klassenzeit.klassenzeit/
├── security/
│   ├── SecurityConfig.java           # Spring Security + JWT config
│   ├── CurrentUser.java              # User context record
│   ├── CurrentUserAuthentication.java # Authentication wrapper
│   ├── UserResolutionFilter.java     # JWT → AppUser resolution
│   └── AuthorizationService.java     # @authz for @PreAuthorize
├── user/
│   ├── AppUser.java                  # Entity
│   ├── AppUserRepository.java
│   ├── AppUserService.java
│   ├── AppUserController.java        # /api/users/me
│   └── dto/
│       └── UserProfileResponse.java
└── membership/
    ├── SchoolMembership.java         # Entity
    ├── SchoolRole.java               # Enum
    └── SchoolMembershipRepository.java
```

### Security Flow

1. **JWT Validation**: Spring Security validates the JWT against Keycloak
2. **User Resolution**: `UserResolutionFilter` finds/creates `AppUser` from JWT claims
3. **Role Loading**: School memberships are loaded into `CurrentUser`
4. **Authorization**: `@PreAuthorize("@authz.canAccessSchool(#schoolId)")` checks permissions

### Using Authorization in Controllers

**Standard Pattern** (for school-scoped resources):

```java
// READ operations - any school member can access
@GetMapping
@PreAuthorize("@authz.canAccessSchool(#schoolId)")
public List<TeacherSummary> findAll(@PathVariable UUID schoolId) {
    return teacherService.findAllBySchool(schoolId);
}

// WRITE operations - requires admin or planner role
@PostMapping
@PreAuthorize("@authz.canManageSchool(#schoolId)")
public TeacherResponse create(@PathVariable UUID schoolId, ...) {
    return teacherService.create(schoolId, request);
}
```

**SchoolController Pattern** (special case):

```java
// List schools - returns only user's schools
@GetMapping
@PreAuthorize("@authz.canListSchools()")
public List<SchoolSummary> findAll() {
    CurrentUser currentUser = authorizationService.getCurrentUser();
    return schoolService.findAllForUser(currentUser);
}

// Create school - platform admin only
@PostMapping
@PreAuthorize("@authz.isPlatformAdmin()")
public SchoolResponse create(...) { ... }

// Update/delete school - school admin only
@PutMapping("/{id}")
@PreAuthorize("@authz.isSchoolAdmin(#id)")
public SchoolResponse update(@PathVariable UUID id, ...) { ... }
```

### AuthorizationService Methods

| Method | Description |
|--------|-------------|
| `isPlatformAdmin()` | Check if current user is platform admin |
| `canAccessSchool(schoolId)` | Check if user has any access to school |
| `canManageSchool(schoolId)` | Check if user is SCHOOL_ADMIN or PLANNER |
| `isSchoolAdmin(schoolId)` | Check if user is SCHOOL_ADMIN |
| `hasRole(schoolId, roles...)` | Check if user has one of the specified roles |
| `canListSchools()` | Check if user can list schools |

## API Endpoints

### User Profile
```
GET  /api/users/me              # Current user profile with school memberships
PUT  /api/users/me              # Update display name (future)
```

### Platform Admin (future)
```
POST /api/admin/schools              # Create school
POST /api/admin/schools/{id}/admins  # Assign school admin
```

### School Membership ✅
```
GET    /api/schools/{schoolId}/members       # List members (SCHOOL_ADMIN)
GET    /api/schools/{schoolId}/members/{id}  # Get member details (SCHOOL_ADMIN)
POST   /api/schools/{schoolId}/members       # Add member (SCHOOL_ADMIN)
PUT    /api/schools/{schoolId}/members/{id}  # Update role (SCHOOL_ADMIN)
DELETE /api/schools/{schoolId}/members/{id}  # Remove member (SCHOOL_ADMIN)
```

### Access Requests (future)
```
POST   /api/schools/{schoolId}/access-requests
GET    /api/schools/{schoolId}/access-requests
PUT    /api/schools/{schoolId}/access-requests/{id}
DELETE /api/users/me/access-requests/{id}
```

## Keycloak Setup

### Docker Configuration

Keycloak runs alongside the application in Docker:

```yaml
# compose.yml
keycloak:
  image: quay.io/keycloak/keycloak:26.0
  container_name: klassenzeit-keycloak
  environment:
    KC_DB: postgres
    KC_DB_URL: jdbc:postgresql://postgres:5432/keycloak
    KC_DB_USERNAME: ${POSTGRES_USER}
    KC_DB_PASSWORD: ${POSTGRES_PASSWORD}
    KEYCLOAK_ADMIN: ${KEYCLOAK_ADMIN:-admin}
    KEYCLOAK_ADMIN_PASSWORD: ${KEYCLOAK_ADMIN_PASSWORD:-admin}
  command: start-dev
  ports:
    - "8180:8080"
```

### Realm Configuration

Create a `klassenzeit` realm with:
- Standard login (username/email + password)
- Email verification enabled
- Client: `klassenzeit-frontend` (public client for SPA)

### Application Configuration

```yaml
# application.yaml
spring:
  security:
    oauth2:
      resourceserver:
        jwt:
          issuer-uri: ${KEYCLOAK_ISSUER_URI:http://localhost:8180/realms/klassenzeit}
```

## Implementation Status

### Phase 1: Foundation ✅
- [x] Add Keycloak to Docker Compose
- [x] Add Spring Security dependencies
- [x] Create database migration (V7)
- [x] Implement SecurityConfig with JWT validation
- [x] Create AppUser entity, repository, service
- [x] Implement UserResolutionFilter
- [x] Create `/api/users/me` endpoint
- [x] Test configuration for existing tests

### Phase 2: School Membership ✅
- [x] Membership CRUD endpoints (`/api/schools/{schoolId}/members`)
- [x] Add `@PreAuthorize` to TeacherController (POC)

### Phase 3: Secure All Endpoints ✅
- [x] Add `@PreAuthorize` to all controllers
- [x] Create `@WithMockCurrentUser` test annotation
- [x] Update tests with security context

### Phase 4: Platform Admin (Pending)
- [ ] Create PlatformAdminController
- [ ] School creation endpoint
- [ ] School admin assignment

### Phase 5: Access Requests (Pending)
- [ ] Access request entity and endpoints
- [ ] Request/approve/reject workflow

### Phase 6: Frontend Integration (Pending)
- [ ] Configure React for Keycloak OIDC
- [ ] Auth context and protected routes
- [ ] Login/logout UI
- [ ] School selector

### Phase 7: Invitations (Future)
- [ ] Email invitation flow
- [ ] Invitation link flow

## Testing

### Test Security Configuration

Tests use a separate security configuration that enables method security:

```java
@Configuration
@EnableWebSecurity
@EnableMethodSecurity(prePostEnabled = true)
@Profile("test")
public class TestSecurityConfig {
  @Bean
  public SecurityFilterChain testSecurityFilterChain(HttpSecurity http) throws Exception {
    http.csrf(AbstractHttpConfigurer::disable)
        .authorizeHttpRequests(auth -> auth.anyRequest().permitAll());
    return http.build();
  }
}
```

### Testing with @WithMockCurrentUser

Use the `@WithMockCurrentUser` annotation to set up a security context in tests:

```java
@Test
@WithMockCurrentUser(
    email = "admin@school.com",
    isPlatformAdmin = true
)
void platformAdminCanCreateSchool() { ... }

@Test
@WithMockCurrentUser(
    email = "planner@school.com",
    schoolRoles = {"550e8400-e29b-41d4-a716-446655440000:PLANNER"}
)
void plannerCanCreateTeacher() { ... }
```

**Annotation parameters:**
- `email` - User's email (default: "test@example.com")
- `displayName` - User's display name (default: "Test User")
- `isPlatformAdmin` - Whether user is platform admin (default: false)
- `schoolRoles` - Array of "schoolId:ROLE" strings (default: empty)

### Testing @WebMvcTest Controllers

For `@WebMvcTest` controller tests, mock the `AuthorizationService` bean:

```java
@WebMvcTest(MyController.class)
@Import(TestSecurityConfig.class)
@ActiveProfiles("test")
class MyControllerTest {

  @MockitoBean(name = "authz")
  private AuthorizationService authorizationService;

  @BeforeEach
  void setUp() {
    when(authorizationService.canAccessSchool(any())).thenReturn(true);
    when(authorizationService.canManageSchool(any())).thenReturn(true);
  }
}
```

## Design Decisions

### Why Keycloak?
- Open-source, self-hosted (no vendor lock-in)
- Handles complex auth flows (password reset, email verification, social login)
- Industry standard (OIDC/OAuth2)
- Admin console for user management

### Why store roles in application database?
- **Flexibility**: School-scoped roles require complex mapping in Keycloak
- **Performance**: Avoid extra Keycloak calls per request
- **Multi-tenancy**: One user can have different roles in different schools

### Why `app_user` table?
- Links Keycloak identity to application data
- Stores platform-level flags (is_platform_admin)
- Enables relationships (memberships, requests, invitations)
- Application works if Keycloak is temporarily unavailable

### Why Platform Admin has no automatic school access?
- Prevents accidental data exposure
- Separation of concerns (infrastructure vs data)
- Platform admin must be explicitly granted school access if needed
