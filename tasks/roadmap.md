# Klassenzeit Roadmap

Ordered by priority. Move tasks to `doing/` when starting work, then to `done/` when complete.

## Current Focus: Authentication & Frontend UI

### Authentication & Authorization (In Progress)

Multi-user support with Keycloak authentication and school-scoped permissions.

- [B-020: Authentication & Authorization](doing/backend/B-020-authentication-authorization.md) **Phase 1 Complete**
  - Phase 1: Foundation ✅ (Keycloak, JWT, AppUser, SecurityConfig)
  - Phase 2: School Membership ✅
  - Phase 3: Secure All Endpoints ✅
  - Phase 4: Platform Admin ✅
  - Phase 5: Access Requests ✅
  - Phase 6: Frontend Integration ✅
  - Phase 7: Invitations (future)

See [docs/authentication.md](../docs/authentication.md) for architecture details.

### Frontend Application Shell

Build out the full frontend application with data management pages:

1. [F-012: Teachers CRUD Pages](done/frontend/F-012-teachers-crud.md) ✅
2. [F-019: Schools CRUD Pages](done/frontend/F-019-schools-crud.md) ✅
3. [F-013: Subjects CRUD Pages](todo/frontend/F-013-subjects-crud.md)
4. [F-014: Rooms CRUD Pages](todo/frontend/F-014-rooms-crud.md)
5. [F-015: Classes CRUD Pages](todo/frontend/F-015-classes-crud.md)
6. [F-016: Time Slots Configuration](todo/frontend/F-016-timeslots-config.md)
7. [F-017: Timetable Grid Views](todo/frontend/F-017-timetable-views.md)
   - Depends on: F-016
8. [F-018: Settings & Academic Calendar](todo/frontend/F-018-settings-pages.md)

### Schools Management (Pending)

- [F-022: Add School Members](todo/frontend/F-022-add-school-members.md)
  - Requires backend user search endpoint
- [F-023: School Settings Redesign](todo/frontend/F-023-school-settings-redesign.md)
  - Current settings are placeholders, need real requirements from teachers

### Backend Timetabling Solver (Timefold)

---

## Polish & Enhancement

These can be mixed in as needed while building core features:

- [B-001: Implement Pagination](todo/backend/B-001-implement-pagination.md)
- [F-007: Frontend Pagination](todo/frontend/F-007-frontend-pagination.md) - Depends on: B-001
- [F-005: Request Rate Limiting](todo/frontend/F-005-request-rate-limiting.md)
- [F-006: React Query Cache Settings](todo/frontend/F-006-react-query-cache-settings.md)

## Low Priority

- [B-004: Request/Response Logging](todo/backend/B-004-request-response-logging.md)
- [F-008: Optimistic Updates](todo/frontend/F-008-optimistic-updates.md)
- [G-006: Network Condition Tests](todo/global/G-006-network-condition-tests.md)
- [G-010: Structured Logging](todo/global/G-010-structured-logging.md)

## Future Phases

### Phase: Multi-tenancy Enforcement

- [B-021: Multi-tenancy Enforcement](todo/backend/B-021-multi-tenancy-enforcement.md) - Depends on: B-020

### Phase: Solver UI (after core frontend + backend solver)

- [F-020: Solver UI Components](todo/frontend/F-020-solver-ui.md)
  - Depends on: F-017

---

## Future Considerations

Not tracked as tasks yet. Create task files when ready to work on these:

- Substitution management: Track teacher absences and substitutes
- Class groups: Split classes for subjects like religion/ethics
- Recurring patterns: A/B week support (schema prepared)
- Audit logging: Track all changes for compliance
- Import/Export: CSV/Excel import for bulk data entry
- Notifications: Email/push for schedule changes
- Mobile app: Teacher-facing schedule viewer
- Analytics: Teaching load distribution, room utilization reports
- Partial Rooms: Support rooms/facilities that are partially available
- Dedicated Rooms: Support rooms dedicated to a specific subject or class
- Subject Room Relationships: Signify which subjects can be taught in which rooms
- Advanced Monitoring: Grafana + Prometheus, centralized logging, Sentry
- Interactive solving: i.e. user can make manual changes to the schedule and the solver will automatically verify and update the schedule, based on constraints and preferences.
- Copy ui from claude / anthropic for tasteful frontend.
