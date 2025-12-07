# B-026: Harden CORS Configuration

## Priority: LOW

## Description

The current CORS configuration uses `allowedHeaders("*")` which is overly permissive. Restrict to only required headers for better security posture.

## Acceptance Criteria

- [ ] Replace wildcard headers with specific allowed headers
- [ ] Verify frontend still works correctly
- [ ] Document allowed headers in code comments

## Tasks

### 1. Update CorsConfig
**File:** `backend/src/main/java/com/klassenzeit/klassenzeit/common/CorsConfig.java`

```java
// Before
.allowedHeaders("*")

// After
.allowedHeaders(
    "Content-Type",
    "Authorization",
    "Accept",
    "Accept-Language",
    "X-Requested-With"
)
```

### 2. Test Frontend Integration
- Verify all API calls work with restricted headers
- Test file uploads if applicable
- Test authentication flow

## Notes

- Low priority, can be done when time permits
- Should be tested thoroughly before deployment

## Related Tasks

- None
