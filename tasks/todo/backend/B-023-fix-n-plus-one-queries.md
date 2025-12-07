# B-023: Fix N+1 Query Patterns

## Priority: MEDIUM

## Description

Address N+1 query patterns identified in membership and access request services that will cause performance issues as data grows.

## Acceptance Criteria

- [ ] Fix N+1 query in `SchoolMembershipService.findAllBySchool`
- [ ] Fix N+1 risk in `AccessRequestService.toResponse`
- [ ] Add composite index for admin count queries
- [ ] Verify fixes with query logging enabled

## Tasks

### 1. Fix SchoolMembershipService N+1
**File:** `backend/src/main/java/com/klassenzeit/klassenzeit/membership/SchoolMembershipRepository.java`

Add repository method with JOIN FETCH:
```java
@Query("SELECT m FROM SchoolMembership m " +
       "JOIN FETCH m.user " +
       "WHERE m.school.id = :schoolId AND m.active = true")
List<SchoolMembership> findBySchoolIdAndActiveTrueWithUser(@Param("schoolId") UUID schoolId);
```

Update service to use new method.

### 2. Fix AccessRequestService N+1
**File:** `backend/src/main/java/com/klassenzeit/klassenzeit/accessrequest/SchoolAccessRequestRepository.java`

Add JOIN FETCH for school and reviewedBy:
```java
@Query("SELECT r FROM SchoolAccessRequest r " +
       "JOIN FETCH r.user " +
       "JOIN FETCH r.school " +
       "LEFT JOIN FETCH r.reviewedBy " +
       "WHERE r.id = :id AND r.school.id = :schoolId")
Optional<SchoolAccessRequest> findByIdAndSchoolIdWithDetails(
    @Param("id") UUID id, @Param("schoolId") UUID schoolId);
```

### 3. Add composite index for membership queries
**File:** New migration `V9__add_membership_indexes.sql`

```sql
CREATE INDEX idx_school_membership_school_role_active
ON school_membership(school_id, role, is_active)
WHERE is_active = true;
```

## Verification

Enable query logging in `application.yaml` during development:
```yaml
spring:
  jpa:
    show-sql: true
    properties:
      hibernate:
        format_sql: true
```

Run membership list and access request detail endpoints, verify only expected queries are executed.

## Notes

- Can be done independently of other tasks
- Consider adding integration tests that verify query count

## Related Tasks

- [B-001: Implement Pagination](./B-001-implement-pagination.md) - pagination will help but doesn't fix N+1
