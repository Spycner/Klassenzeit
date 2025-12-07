# G-012: Create Missing Documentation

## Priority: MEDIUM

## Description

The project has significant documentation gaps. Create comprehensive documentation for new features, API endpoints, and data models.

## Acceptance Criteria

- [ ] Create API endpoint documentation
- [ ] Create data model documentation
- [ ] Create authentication/authorization guide
- [ ] Update CLAUDE.md with new agent/skill architecture

## Tasks

### 1. Create API Documentation
**File:** Create `docs/api.md`

Document all endpoints:

```markdown
# API Reference

## Authentication
All API endpoints require a valid JWT token from Keycloak.

## Schools
- `GET /api/schools` - List schools
- `POST /api/schools` - Create school
- `GET /api/schools/{id}` - Get school
- `PUT /api/schools/{id}` - Update school
- `DELETE /api/schools/{id}` - Delete school

## Access Requests
- `GET /api/schools/{schoolId}/access-requests` - List requests
- `POST /api/schools/{schoolId}/access-requests` - Create request
- `PUT /api/schools/{schoolId}/access-requests/{id}/review` - Review request

## Memberships
- `GET /api/schools/{schoolId}/memberships` - List members
- `POST /api/schools/{schoolId}/memberships` - Add member
- `PUT /api/schools/{schoolId}/memberships/{id}` - Update role
- `DELETE /api/schools/{schoolId}/memberships/{id}` - Remove member

... (continue for all endpoints)
```

### 2. Create Data Model Documentation
**File:** Create `docs/data-model.md`

Document entities and relationships:

```markdown
# Data Model

## Core Entities

### AppUser
- Represents a user in the system
- Linked to Keycloak identity
- Can have multiple school memberships

### School
- Central entity for multi-tenancy
- Has members, teachers, classes, etc.

### SchoolMembership
- Links users to schools with roles
- Roles: ADMIN, TEACHER, VIEWER

### SchoolAccessRequest
- Workflow for requesting school access
- Statuses: PENDING, APPROVED, REJECTED

... (continue for all entities)
```

### 3. Create Auth/Security Guide
**File:** Create `docs/authentication.md`

Document security architecture:

```markdown
# Authentication & Authorization

## Overview
The application uses Keycloak for authentication and Spring Security for authorization.

## Authentication Flow
1. User authenticates with Keycloak
2. Frontend receives JWT token
3. Token sent with API requests
4. Backend validates token and resolves user

## Authorization Model
- Platform Admins: Full access to all schools
- School Admins: Manage their school
- Teachers: View and limited edit
- Viewers: Read-only access

## Security Configuration
... (document SecurityConfig, filters, etc.)
```

### 4. Update CLAUDE.md
**File:** `CLAUDE.md`

Add section for agent/skill architecture:

```markdown
## Code Review

The project includes Claude Code agents and skills for automated code review:

### Running Reviews
- `/review-all` - Full comprehensive review
- Pre-commit hooks run automatically

### Available Agents
- backend-tests: Run backend unit tests
- frontend-tests: Run frontend unit tests
- e2e-tests: Run E2E API tests
- lighthouse-audit: Performance/accessibility audit
- code-quality: Deep code analysis
- docs-check: Documentation verification
```

## Notes

- Documentation should be kept updated as features change
- Consider auto-generating API docs from OpenAPI spec

## Related Tasks

- None (standalone documentation work)
