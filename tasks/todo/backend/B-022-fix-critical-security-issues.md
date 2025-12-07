# B-022: Fix Critical Security & Validation Issues

## Priority: HIGH (Must fix before merge)

## Description

Address three critical issues identified during code review that affect security and data validation.

## Acceptance Criteria

- [ ] Add `@Valid` annotation to `CreateAccessRequestRequest` in `AccessRequestController`
- [ ] Add `@Size(max = 2000)` constraint to message field in `CreateAccessRequestRequest`
- [ ] Conditionally include exception type in error responses only for dev/local profiles

## Tasks

### 1. Fix missing @Valid annotation
**File:** `backend/src/main/java/com/klassenzeit/klassenzeit/accessrequest/AccessRequestController.java:46`

```java
// Before
public AccessRequestResponse create(
    @PathVariable UUID schoolId, @RequestBody CreateAccessRequestRequest request)

// After
public AccessRequestResponse create(
    @PathVariable UUID schoolId, @Valid @RequestBody CreateAccessRequestRequest request)
```

### 2. Add size constraint to message field
**File:** `backend/src/main/java/com/klassenzeit/klassenzeit/accessrequest/dto/CreateAccessRequestRequest.java`

```java
public record CreateAccessRequestRequest(
    SchoolRole requestedRole,
    @Size(max = 2000, message = "{validation.message.size}") String message) {}
```

### 3. Fix exception type leakage in production
**File:** `backend/src/main/java/com/klassenzeit/klassenzeit/common/GlobalExceptionHandler.java:189`

```java
// Only include exception type in development environments
if (environment.acceptsProfiles(Profiles.of("dev", "local"))) {
    body.put("exceptionType", ex.getClass().getSimpleName());
}
```

## Notes

- These are blocking issues for the feat/review-setup branch merge
- All three can be fixed in a single commit
- Add tests to verify the validation behavior

## Related Tasks

- None (standalone security fix)
