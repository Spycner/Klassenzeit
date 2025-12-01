# F-002: Implement Input Validation

## Description
Add client-side validation for all form inputs before API calls.

## Acceptance Criteria
- [ ] Add validation library (Zod recommended for TypeScript integration)
- [ ] Add email format validation before API calls
- [ ] Add string length limit validation
- [ ] Add grade level range validation (1-13)
- [ ] Add required field validation
- [ ] Add room capacity validation (min 1)

## Dependencies
None

## Blocks
None

## Notes
**Location:** `frontend/src/api/` (new validation layer or in hooks)

### Validation Constants
```typescript
const VALIDATION = {
  GRADE_LEVEL: { MIN: 1, MAX: 13 },
  ROOM_CAPACITY: { MIN: 1 }
};
```
