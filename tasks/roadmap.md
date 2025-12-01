# Klassenzeit Roadmap

Ordered by priority. Move tasks to `doing/` when starting work, then to `done/` when complete.

## Current Focus: Frontend UI + Backend Solver

### Frontend Application Shell

Build out the full frontend application with data management pages:

1. [F-010: App Layout & Navigation](todo/frontend/F-010-app-layout-navigation.md)
2. [F-011: Shared UI Components](todo/frontend/F-011-shared-components.md)
   - Depends on: F-010
3. [F-012: Teachers CRUD Pages](todo/frontend/F-012-teachers-crud.md)
   - Depends on: F-010, F-011
4. [F-013: Subjects CRUD Pages](todo/frontend/F-013-subjects-crud.md)
   - Depends on: F-010, F-011
5. [F-014: Rooms CRUD Pages](todo/frontend/F-014-rooms-crud.md)
   - Depends on: F-010, F-011
6. [F-015: Classes CRUD Pages](todo/frontend/F-015-classes-crud.md)
   - Depends on: F-010, F-011
7. [F-016: Time Slots Configuration](todo/frontend/F-016-timeslots-config.md)
   - Depends on: F-010, F-011
8. [F-017: Timetable Grid Views](todo/frontend/F-017-timetable-views.md)
   - Depends on: F-010, F-011, F-016
9. [F-018: Settings & Academic Calendar](todo/frontend/F-018-settings-pages.md)
   - Depends on: F-010, F-011

### Backend Timetabling Solver (Timefold)

Implement constraint-based automatic schedule generation:

10. [B-010: Timefold Planning Domain Model](todo/backend/B-010-scheduling-constraints-model.md)
11. [B-011: Timefold Constraint Definitions](todo/backend/B-011-timetabling-algorithm.md)
    - Depends on: B-010
12. [B-012: Timefold Solver Service & API](todo/backend/B-012-schedule-validation.md)
    - Depends on: B-010, B-011

---

## Polish & Enhancement

These can be mixed in as needed while building core features:

- [F-003: Add JSDoc Documentation](todo/frontend/F-003-add-jsdoc-documentation.md)
- [F-004: Verify Bundle Size](todo/frontend/F-004-verify-bundle-size.md)
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

### Phase: Infrastructure & Security

- [B-020: Authentication & Authorization](todo/backend/B-020-authentication-authorization.md)
- [B-021: Multi-tenancy Enforcement](todo/backend/B-021-multi-tenancy-enforcement.md) - Depends on: B-020

### Phase: Solver UI (after core frontend + backend solver)

- Solver controls UI (start/stop solving, progress indicator)
- Solution review and apply workflow
- Constraint violation visualization

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
