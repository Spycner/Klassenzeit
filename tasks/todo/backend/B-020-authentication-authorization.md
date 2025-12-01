# B-020: Authentication & Authorization

## Description
Add Spring Security with JWT or session-based authentication.

## Acceptance Criteria
- [ ] Add Spring Security dependency
- [ ] Choose auth method (JWT vs OAuth2/OIDC)
- [ ] Implement user roles: ADMIN, PLANNER, TEACHER, VIEWER
- [ ] Secure API endpoints by role
- [ ] Add login/logout endpoints

## Dependencies
None

## Blocks
- [B-021: Multi-tenancy Enforcement](B-021-multi-tenancy-enforcement.md)

## Notes
### Dependencies
```kotlin
implementation("org.springframework.boot:spring-boot-starter-security")
implementation("org.springframework.boot:spring-boot-starter-oauth2-resource-server") // For JWT
```

### User Roles
- `ADMIN` - Full access to school
- `PLANNER` - Can create/modify schedules
- `TEACHER` - View own schedule, manage availability
- `VIEWER` - Read-only access

### Implementation Options
- Self-managed JWT (simpler)
- OAuth2/OIDC with external provider (Keycloak, Auth0)
