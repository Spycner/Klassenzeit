# B-021: Multi-tenancy Enforcement

## Description
Ensure all queries are scoped to user's school for data isolation.

## Acceptance Criteria
- [ ] Implement school-level data isolation
- [ ] Validate ownership on all queries
- [ ] Prevent cross-school data access

## Dependencies
- [B-020: Authentication & Authorization](B-020-authentication-authorization.md)

## Blocks
None

## Notes
### Approaches
- **Explicit:** Always pass `schoolId` and validate ownership (Recommended for v1)
- **Implicit:** Use Spring Security context + custom repository base class
- **Hibernate filter:** Global filter applied automatically
