# F-002: Implement Input Validation

## Description
Add client-side validation for all form inputs before API calls.

## Acceptance Criteria
- [x] Add validation library (Zod recommended for TypeScript integration)
- [x] Add email format validation before API calls
- [x] Add string length limit validation
- [x] Add grade level range validation (1-13)
- [x] Add required field validation
- [x] Add room capacity validation (min 1)

## Dependencies
None

## Blocks
None

## Notes
**Location:** `frontend/src/api/validation/`

### Validation Constants
```typescript
const VALIDATION = {
  GRADE_LEVEL: { MIN: 1, MAX: 13 },
  ROOM_CAPACITY: { MIN: 1 }
};
```

## Completion Notes

### What was implemented
Created a comprehensive validation layer at `src/api/validation/` with:

1. **Zod schemas for all 11 entity types:**
   - Teacher, School, SchoolClass, Room, Subject, Term, SchoolYear, TimeSlot, Lesson, Qualification, Availability

2. **Validation utilities:**
   - `validate()` function that shows Sonner toast on failure
   - `withValidation()` wrapper for mutation functions
   - `ValidationError` class for typed error handling
   - Schema builder utilities (requiredString, optionalEmail, intRange, etc.)

3. **Validation rules matching backend constraints:**
   - String length limits (5-255 chars depending on field)
   - Email format validation (optional, validates when provided)
   - Grade level range (1-13)
   - Room capacity (min 1)
   - Required field validation
   - UUID format validation for foreign keys
   - Date format validation (YYYY-MM-DD)
   - Time format validation (HH:mm or HH:mm:ss)
   - Cross-field validation (e.g., minGrade <= maxGrade, startDate <= endDate)

4. **Tests:**
   - 137 new tests covering validation function and all entity schemas
   - All 232 project tests passing

### Files created
- `src/api/validation/constants.ts`
- `src/api/validation/utils.ts`
- `src/api/validation/validate.ts`
- `src/api/validation/index.ts`
- `src/api/validation/schemas/*.ts` (11 schema files)
- `src/api/validation/*.test.ts` (8 test files)

### Files modified
- `src/api/error-handler.ts` - Added ValidationError support
- `src/api/index.ts` - Added validation module export

### Usage example
```typescript
import { validate, createTeacherSchema } from "@/api/validation";

const handleSubmit = async (formData: unknown) => {
  const result = validate(createTeacherSchema, formData);
  if (!result.success) {
    return; // Toast already shown
  }
  await createTeacher.mutateAsync(result.data);
};
```

### Key decisions
- Validation layer is separate from hooks (reusable for future form integration)
- Toast-only error display (inline form errors deferred to when forms are built)
- Did not add react-hook-form yet (schemas ready for later integration)
