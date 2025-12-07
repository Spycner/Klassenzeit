# B-022: Fix Critical Security & Validation Issues

## Priority: HIGH (Must fix before merge)

## Description

Address three critical issues identified during code review that affect security and data validation.

## Acceptance Criteria

- [x] Add `@Valid` annotation to `CreateAccessRequestRequest` in `AccessRequestController`
- [x] Add `@Size` constraints to unbounded string fields in DTOs
- [x] Remove exception type leakage from error responses

## Completion Notes

**Completed:** 2025-12-07

### Changes Made

#### 1. Added @Valid annotation
**File:** `backend/src/main/java/com/klassenzeit/klassenzeit/accessrequest/AccessRequestController.java:46`

```java
public AccessRequestResponse create(
    @PathVariable UUID schoolId, @Valid @RequestBody CreateAccessRequestRequest request)
```

#### 2. Added @Size constraints to DTOs

| File | Field | Constraint |
|------|-------|------------|
| `CreateAccessRequestRequest.java` | `message` | `@Size(max = 1000)` |
| `CreateRoomRequest.java` | `features` | `@Size(max = 4000)` |
| `UpdateRoomRequest.java` | `features` | `@Size(max = 4000)` |
| `CreateSchoolRequest.java` | `settings` | `@Size(max = 4000)` |
| `UpdateSchoolRequest.java` | `settings` | `@Size(max = 4000)` |

JSONB fields (`features`, `settings`) use 4000 chars to allow complex JSON configs.
Text fields (`message`) use 1000 chars as a reasonable limit.

#### 3. Removed exception type leakage
**File:** `backend/src/main/java/com/klassenzeit/klassenzeit/common/GlobalExceptionHandler.java`

Removed the line that exposed `exceptionType` in error responses entirely (simpler than profile-based conditional).

### Decisions

- Removed `exceptionType` completely rather than making it profile-conditional - exception details are logged server-side for debugging, no need to expose to clients even in dev
- Used 4000 chars for JSONB fields as a balance between flexibility and protection against abuse
- All backend tests pass

## Related Tasks

- B-024: Can now add tests that verify these validation constraints work
