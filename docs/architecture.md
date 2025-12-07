# Architecture Overview

This document provides a high-level overview of the Klassenzeit system architecture.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Client Layer                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                     React Frontend (SPA)                             │   │
│   │  React 19 + Vite 7 + TypeScript + Tailwind CSS + shadcn/ui          │   │
│   └────────────────────────────────┬────────────────────────────────────┘   │
│                                    │                                         │
└────────────────────────────────────┼─────────────────────────────────────────┘
                                     │ HTTPS (JWT Bearer)
┌────────────────────────────────────┼─────────────────────────────────────────┐
│                           Server Layer                                       │
├────────────────────────────────────┼─────────────────────────────────────────┤
│                                    │                                         │
│   ┌────────────────────────────────▼────────────────────────────────────┐   │
│   │                     Spring Boot Backend                              │   │
│   │  Spring Boot 3.5.8 + Java 21 + Spring Security + Spring Data JPA    │   │
│   └────────────────────────────────┬────────────────────────────────────┘   │
│                                    │                                         │
│                    ┌───────────────┼───────────────┐                        │
│                    │               │               │                        │
│                    ▼               ▼               ▼                        │
│   ┌────────────────────┐ ┌─────────────────┐ ┌─────────────────────┐       │
│   │    PostgreSQL 17   │ │   Keycloak 26   │ │  Timefold Solver    │       │
│   │   (Primary Data)   │ │   (Identity)    │ │  (Optimization)     │       │
│   └────────────────────┘ └─────────────────┘ └─────────────────────┘       │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Technology Stack

| Layer | Technology | Version |
|-------|------------|---------|
| **Frontend** | React | 19 |
| | Vite | 7 |
| | TypeScript | 5 |
| | Tailwind CSS | 3 |
| | shadcn/ui | New York |
| | React Router | 7 |
| | React Query | 5 |
| **Backend** | Spring Boot | 3.5.8 |
| | Java | 21 |
| | Spring Security | 6 |
| | Spring Data JPA | 3 |
| | Flyway | 10 |
| **Database** | PostgreSQL | 17 |
| **Auth** | Keycloak | 26 |
| **Solver** | Timefold | 1.x |
| **Testing** | JUnit 5, Vitest, Playwright | - |

## Monorepo Structure

```
Klassenzeit/
├── backend/             # Spring Boot application
│   ├── src/main/java/   # Java source code
│   └── src/test/java/   # Tests
├── frontend/            # React SPA
│   ├── src/             # TypeScript source
│   └── src/api/         # Generated API client
├── e2e/                 # Playwright E2E tests
├── docs/                # Documentation
├── tasks/               # Task tracking (kanban)
├── .claude/             # Claude Code configuration
├── Makefile             # Development commands
└── compose.yml          # Docker services
```

## Backend Architecture

### Package-by-Feature Structure

```
com.klassenzeit.klassenzeit/
├── common/              # Shared utilities, exceptions, i18n
├── security/            # Auth, JWT, authorization
├── admin/               # Platform admin operations
├── user/                # AppUser management
├── membership/          # School membership
├── accessrequest/       # Access request workflow
├── school/              # School, SchoolYear, Term
├── teacher/             # Teacher, availability, qualifications
├── subject/             # Subject definitions
├── room/                # Room management
├── schoolclass/         # Student groups
├── timeslot/            # Weekly time grid
├── lesson/              # Scheduled lessons
└── solver/              # Timefold timetabling solver
```

### Security Flow

```
┌─────────────┐    ┌─────────────────┐    ┌──────────────────┐
│   Request   │───▶│ JWT Validation  │───▶│ UserResolution   │
│  (Bearer)   │    │ (Spring Sec)    │    │    Filter        │
└─────────────┘    └─────────────────┘    └────────┬─────────┘
                                                   │
                                                   ▼
┌─────────────┐    ┌─────────────────┐    ┌──────────────────┐
│  Response   │◀───│   Controller    │◀───│ @PreAuthorize    │
│             │    │                 │    │ Authorization    │
└─────────────┘    └─────────────────┘    └──────────────────┘
```

1. **JWT Validation**: Spring Security validates token against Keycloak
2. **User Resolution**: `UserResolutionFilter` finds/creates `AppUser` from JWT claims
3. **Authorization**: `@PreAuthorize("@authz.canAccessSchool(#schoolId)")` checks permissions
4. **Controller**: Business logic executes with security context

### Data Access Layer

- **ORM**: Spring Data JPA with Hibernate
- **Migrations**: Flyway (SQL-first, `V{n}__{description}.sql`)
- **Validation**: `ddl-auto: validate` (schema owned by Flyway)
- **Transactions**: `@Transactional` on service methods

## Frontend Architecture

### Component Hierarchy

```
App.tsx (Router)
├── AuthProvider (Keycloak context)
│   └── QueryClientProvider (React Query)
│       └── SchoolProvider (Selected school context)
│           └── Routes
│               ├── ProtectedRoute (Auth guard)
│               │   └── Page Components
│               └── Public Routes
```

### State Management

| State Type | Technology | Purpose |
|------------|------------|---------|
| Server State | React Query | API data, caching, invalidation |
| Auth State | Keycloak JS | User identity, tokens |
| App State | React Context | Selected school, UI preferences |
| Form State | React Hook Form | Form validation, submission |

### API Integration

1. **Type Generation**: Orval generates TypeScript from OpenAPI spec
2. **API Client**: Axios with JWT interceptor
3. **Data Fetching**: React Query hooks (`useSchools`, `useCreateTeacher`, etc.)
4. **Optimistic Updates**: Mutation hooks with cache invalidation

```
Backend OpenAPI ──(orval)──▶ Generated Types ──▶ React Query Hooks ──▶ Components
```

## Data Flow

### Read Operation (Example: List Teachers)

```
1. Component calls useTeachers(schoolId)
2. React Query checks cache
3. If stale/missing, Axios GET /api/schools/{id}/teachers
4. JWT attached via interceptor
5. Backend: @PreAuthorize validates access
6. Backend: Service calls repository
7. Response mapped to DTO
8. React Query caches result
9. Component re-renders with data
```

### Write Operation (Example: Create Teacher)

```
1. Form submitted with teacher data
2. useCreateTeacher mutation triggered
3. Axios POST /api/schools/{id}/teachers
4. Backend: @PreAuthorize checks SCHOOL_ADMIN or PLANNER
5. Backend: Service validates and persists
6. Success response returns created teacher
7. React Query invalidates teacher list cache
8. UI shows success, list refreshes
```

## Multi-Tenancy Model

Klassenzeit uses a **database-level multi-tenancy** model:

- Each `School` is a tenant
- All domain entities belong to exactly one school
- `school_id` foreign key enforces isolation
- Authorization checks verify user has school membership

```
AppUser ─────▶ SchoolMembership ◀───── School
    │              │                      │
    │              │ (role per school)    │
    │              ▼                      │
    │         SCHOOL_ADMIN               ├──▶ Teachers
    │         PLANNER                    ├──▶ Subjects
    │         TEACHER                    ├──▶ Rooms
    │         VIEWER                     ├──▶ Classes
    │                                    └──▶ Lessons
    │
    └──▶ Platform Admin (cross-school)
```

## Related Documentation

- [Authentication & Authorization](authentication.md) - Security architecture details
- [Data Model](data-model.md) - Database schema and entities
- [Timetabling Constraints](timetabling-constraints.md) - Solver constraint definitions
- [API Reference](api.md) - REST endpoint documentation
