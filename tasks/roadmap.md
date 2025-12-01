# Klassenzeit Roadmap

Ordered by priority. Move tasks to `doing/` when starting work, then to `done/` when complete.

## High Priority (Current Sprint)

3. [F-003: Add JSDoc Documentation](todo/frontend/F-003-add-jsdoc-documentation.md)
4. [F-004: Verify Bundle Size](todo/frontend/F-004-verify-bundle-size.md)

## Medium Priority

7. [B-001: Implement Pagination](todo/backend/B-001-implement-pagination.md)
8. [F-007: Frontend Pagination](todo/frontend/F-007-frontend-pagination.md)
   - Depends on: B-001
11. [F-005: Request Rate Limiting](todo/frontend/F-005-request-rate-limiting.md)
    - Depends on: F-001
12. [F-006: React Query Cache Settings](todo/frontend/F-006-react-query-cache-settings.md)

## Low Priority

16. [B-004: Request/Response Logging](todo/backend/B-004-request-response-logging.md)
17. [F-008: Optimistic Updates](todo/frontend/F-008-optimistic-updates.md)
    - Depends on: F-001
18. [G-006: Network Condition Tests](todo/global/G-006-network-condition-tests.md)
    - Depends on: F-001
19. [G-010: Structured Logging](todo/global/G-010-structured-logging.md)

## Phase 3: Timetabling

20. [B-010: Scheduling Constraints Model](todo/backend/B-010-scheduling-constraints-model.md)
21. [B-011: Timetabling Algorithm](todo/backend/B-011-timetabling-algorithm.md)
    - Depends on: B-010
22. [B-012: Schedule Validation](todo/backend/B-012-schedule-validation.md)
    - Depends on: B-010

## Phase 4: Infrastructure

23. [B-020: Authentication & Authorization](todo/backend/B-020-authentication-authorization.md)
24. [B-021: Multi-tenancy Enforcement](todo/backend/B-021-multi-tenancy-enforcement.md)
    - Depends on: B-020

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
